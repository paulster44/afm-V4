import { Router, Response } from 'express';
import { z } from 'zod';
import Busboy from 'busboy';
import { prisma } from '../utils/prisma';
import { auth } from '../utils/firebase';
import { scanContractDocument } from '../utils/gemini';
import { requireAuth, requireAdmin, requireSuperAdmin, requireGod, AuthRequest } from '../middleware/auth';
import { updateRoleSchema, createAnnouncementSchema } from '../schemas/admin';

const router = Router();

// All admin routes require at least authentication
router.use(requireAuth);

// GET /api/admin/users
// Fetch all users for role management (GOD ONLY)
router.get('/users', requireGod, async (req: AuthRequest, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                suspendedAt: true,
                createdAt: true,
                _count: {
                    select: { contracts: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ users });
    } catch (error) {
        console.error('[GET /admin/users]', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// PUT /api/admin/users/:id/role
// Update a user's role (GOD ONLY)
router.put('/users/:id/role', requireGod, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { role } = updateRoleSchema.parse(req.body);

        const updatedUser = await prisma.user.update({
            where: { id },
            data: { role },
            select: { id: true, email: true, role: true }
        });

        res.json({ user: updatedUser });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid role' });
        }
        console.error('[PUT /admin/users/:id/role]', error);
        res.status(500).json({ error: 'Failed to update user role' });
    }
});

// DELETE /api/admin/users/:id
// Permanently delete a user and all their data (GOD ONLY)
router.delete('/users/:id', requireGod, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        if (req.user!.id === id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        const targetUser = await prisma.user.findUnique({ where: { id } });
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Clean up orphaned workspaces + delete user atomically
        await prisma.$transaction([
            prisma.workspace.deleteMany({ where: { ownerUserId: id } }),
            prisma.user.delete({ where: { id } }),
        ]);

        // Remove from Firebase Auth (best-effort)
        try {
            await auth.deleteUser(id);
        } catch (firebaseError) {
            console.error('[DELETE /admin/users/:id] Firebase delete failed:', firebaseError);
        }

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('[DELETE /admin/users/:id]', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// PUT /api/admin/users/:id/suspend
// Toggle suspend/unsuspend a user (GOD ONLY)
router.put('/users/:id/suspend', requireGod, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        if (req.user!.id === id) {
            return res.status(400).json({ error: 'Cannot suspend your own account' });
        }

        const targetUser = await prisma.user.findUnique({ where: { id } });
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isSuspending = !targetUser.suspendedAt;

        const updatedUser = await prisma.user.update({
            where: { id },
            data: { suspendedAt: isSuspending ? new Date() : null },
            select: { id: true, email: true, role: true, suspendedAt: true }
        });

        // Mirror to Firebase Auth (best-effort)
        try {
            await auth.updateUser(id, { disabled: isSuspending });
        } catch (firebaseError) {
            console.error('[PUT /admin/users/:id/suspend] Firebase update failed:', firebaseError);
        }

        res.json({ user: updatedUser });
    } catch (error) {
        console.error('[PUT /admin/users/:id/suspend]', error);
        res.status(500).json({ error: 'Failed to update suspension status' });
    }
});

// POST /api/admin/announcements
// Create a new global announcement (ADMIN and GOD)
router.post('/announcements', requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const { message } = createAnnouncementSchema.parse(req.body);

        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Use a transaction to ensure only one announcement is active
        const [_, newAnnouncement] = await prisma.$transaction([
            // Deactivate all existing announcements
            prisma.announcement.updateMany({
                where: { isActive: true },
                data: { isActive: false }
            }),
            // Create the new active announcement
            prisma.announcement.create({
                data: {
                    message,
                    isActive: true,
                    createdByUserId: req.user.id
                }
            })
        ]);

        res.status(201).json({ announcement: newAnnouncement });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Valid message is required' });
        }
        console.error('[POST /admin/announcements]', error);
        res.status(500).json({ error: 'Failed to create announcement' });
    }
});

// DELETE /api/admin/announcements
// Deactivate all active announcements (ADMIN and GOD)
router.delete('/announcements', requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
        await prisma.announcement.updateMany({
            where: { isActive: true },
            data: { isActive: false }
        });
        res.json({ message: 'Announcement deactivated' });
    } catch (error) {
        console.error('[DELETE /admin/announcements]', error);
        res.status(500).json({ error: 'Failed to deactivate announcement' });
    }
});

// GET /api/admin/usage
// Fetch real usage statistics from the database (ADMIN and GOD)
router.get('/usage', requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get all users with their contract and version counts
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                _count: { select: { contracts: true } },
                contracts: {
                    select: {
                        updatedAt: true,
                        _count: { select: { versions: true } },
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        });

        // Compute per-user stats
        const userUsage = users.map(u => {
            const totalContracts = u._count.contracts;
            const totalVersions = u.contracts.reduce((sum, c) => sum + c._count.versions, 0);
            const lastActive = u.contracts.length > 0
                ? u.contracts.reduce((latest, c) => c.updatedAt > latest ? c.updatedAt : latest, u.contracts[0].updatedAt)
                : null;
            return {
                uid: u.id,
                email: u.email,
                totalContracts,
                totalVersions,
                totalActions: totalContracts + totalVersions,
                lastActive: lastActive?.toISOString() ?? null,
            };
        });

        // Aggregate totals
        const totalContractsLifetime = userUsage.reduce((sum, u) => sum + u.totalContracts, 0);
        const totalVersionsLifetime = userUsage.reduce((sum, u) => sum + u.totalVersions, 0);

        // Today's contracts
        const contractsToday = await prisma.contract.count({
            where: { createdAt: { gte: today } }
        });
        const versionsToday = await prisma.contractVersion.count({
            where: { createdAt: { gte: today } }
        });

        res.json({
            totalContractsLifetime,
            totalVersionsLifetime,
            contractsToday,
            versionsToday,
            userUsage: userUsage.sort((a, b) => b.totalActions - a.totalActions),
        });
    } catch (error) {
        console.error('[GET /admin/usage]', error);
        res.status(500).json({ error: 'Failed to fetch usage stats' });
    }
});

// GET /api/admin/notes
// Fetch top-level admin notes with replies (SUPERADMIN and GOD)
router.get('/notes', requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const notes = await prisma.adminNote.findMany({
            where: { parentId: null },
            include: {
                replies: {
                    orderBy: { createdAt: 'asc' },
                },
            },
            orderBy: [
                { isPinned: 'desc' },
                { createdAt: 'desc' },
            ],
            take: 50,
        });
        res.json({ notes });
    } catch (error) {
        console.error('[GET /admin/notes]', error);
        res.status(500).json({ error: 'Failed to fetch notes' });
    }
});

// POST /api/admin/notes
// Create a new admin note or reply (SUPERADMIN and GOD)
router.post('/notes', requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const { content, category, parentId } = req.body;
        if (!content || typeof content !== 'string' || !content.trim()) {
            return res.status(400).json({ error: 'Content is required' });
        }
        const note = await prisma.adminNote.create({
            data: {
                content: content.trim(),
                category: parentId ? 'General' : (category || 'General'),
                parentId: parentId || null,
                createdByUserId: req.user!.id,
                createdByEmail: req.user!.email,
            },
        });
        res.status(201).json({ note });
    } catch (error) {
        console.error('[POST /admin/notes]', error);
        res.status(500).json({ error: 'Failed to create note' });
    }
});

// PUT /api/admin/notes/:id/pin
// Toggle pin on a note (GOD ONLY)
router.put('/notes/:id/pin', requireGod, async (req: AuthRequest, res: Response) => {
    try {
        const note = await prisma.adminNote.findUnique({ where: { id: req.params.id } });
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }
        const updated = await prisma.adminNote.update({
            where: { id: req.params.id },
            data: { isPinned: !note.isPinned },
        });
        res.json({ note: updated });
    } catch (error) {
        console.error('[PUT /admin/notes/:id/pin]', error);
        res.status(500).json({ error: 'Failed to toggle pin' });
    }
});

// DELETE /api/admin/notes/:id
// Delete an admin note (GOD ONLY)
router.delete('/notes/:id', requireGod, async (req: AuthRequest, res: Response) => {
    try {
        await prisma.adminNote.delete({ where: { id: req.params.id } });
        res.json({ message: 'Note deleted' });
    } catch (error) {
        console.error('[DELETE /admin/notes/:id]', error);
        res.status(500).json({ error: 'Failed to delete note' });
    }
});

// POST /api/admin/scan
// Proxy contract image to Gemini AI for JSON extraction (SUPERADMIN and GOD)
router.post('/scan', requireSuperAdmin, (req: AuthRequest, res: Response) => {
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: 10 * 1024 * 1024 } });
    let fileBuffer: Buffer | null = null;
    let fileMimeType = 'image/png';

    busboy.on('file', (fieldname, file, info) => {
        if (fieldname === 'image') {
            fileMimeType = info.mimeType;
            const chunks: Buffer[] = [];
            file.on('data', (data) => chunks.push(data));
            file.on('end', () => { fileBuffer = Buffer.concat(chunks); });
        } else {
            file.resume();
        }
    });

    busboy.on('finish', async () => {
        if (!fileBuffer) {
            return res.status(400).json({ error: 'Image file is required' });
        }

        const result = await scanContractDocument(fileBuffer, fileMimeType);
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }
        return res.json({ result: result.data });
    });

    busboy.on('error', (err) => {
        console.error('[POST /admin/scan] Busboy error:', err);
        return res.status(500).json({ error: 'Error processing upload' });
    });

    // @ts-ignore - rawBody is added by Firebase
    if (req.rawBody) {
        // @ts-ignore
        busboy.end(req.rawBody);
    } else {
        req.pipe(busboy);
    }
});

export default router;
