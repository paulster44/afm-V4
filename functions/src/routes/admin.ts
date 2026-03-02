import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { requireAuth, requireAdmin, requireGod, AuthRequest } from '../middleware/auth';
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

export default router;
