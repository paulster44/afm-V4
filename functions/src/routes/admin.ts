import { Router, Response } from 'express';
import { z } from 'zod';
import Busboy from 'busboy';
import { GoogleGenAI, Type } from '@google/genai';
import { prisma } from '../utils/prisma';
import { auth } from '../utils/firebase';
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

// POST /api/admin/scan
// Proxy contract image to Gemini AI for JSON extraction (ADMIN and GOD)
router.post('/scan', requireAdmin, (req: AuthRequest, res: Response) => {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

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

        try {
            const ai = new GoogleGenAI({ apiKey: geminiApiKey });
            const base64Data = fileBuffer.toString('base64');

            const imagePart = { inlineData: { mimeType: fileMimeType, data: base64Data } };
            const textPart = {
                text: `Analyze the attached image of a musician's union contract document. Extract all relevant information to create a complete JSON configuration for a single 'ContractType' object that can be used in our system.
- Infer a unique 'id' (e.g., 'local_live_engagement'), a descriptive 'name', and a 'formIdentifier'.
- Determine the 'calculationModel' (e.g., 'live_engagement', 'media_report', 'contribution_only') and 'signatureType' (e.g., 'engagement', 'media_report', 'member').
- If present, extract 'jurisdiction' (e.g., 'Canada (Ontario)') and 'currency' details (symbol and code). If currency is not specified, assume USD.
- Identify all fillable fields ('fields'). For each field, determine its 'id', 'label', 'type', 'required' status, and logical 'group'. Also extract any optional details like 'placeholder', 'description', 'options' for selects, 'min'/'minLength' values, 'dataSource' ('wageScales'), and a 'defaultValue'.
- Extract all financial rules ('rules'), including premiums for 'leader' or 'doubling', 'overtimeRate', and contributions for 'pension', 'health', and 'workDues'. For each rule, capture the rate, a descriptive text, and what the calculation is based on (for 'pension' and 'workDues') or if it's a flat rate (for 'health').
- Detail all 'wageScales'. For each scale, extract its unique 'id', 'name', 'rate', standard 'duration' in hours, and an optional 'description'.
- If there is legal text, extract it into the 'legalText' object with appropriate keys (e.g., 'preamble', 'clause_governingLaw', 'clause_arbitrationL1'). The model should create logical keys for distinct clauses.
- The 'summary' field must be an empty array '[]'.
- Structure the entire output as a single, clean JSON object that strictly adheres to the provided schema. Do not include any extra explanations, comments, or markdown formatting.`
            };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [imagePart, textPart] },
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING }, name: { type: Type.STRING }, formIdentifier: { type: Type.STRING },
                            calculationModel: { type: Type.STRING }, signatureType: { type: Type.STRING }, jurisdiction: { type: Type.STRING },
                            currency: { type: Type.OBJECT, properties: { symbol: { type: Type.STRING }, code: { type: Type.STRING } } },
                            fields: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, label: { type: Type.STRING }, type: { type: Type.STRING }, required: { type: Type.BOOLEAN }, group: { type: Type.STRING }, placeholder: { type: Type.STRING }, description: { type: Type.STRING }, options: { type: Type.ARRAY, items: { type: Type.STRING } }, dataSource: { type: Type.STRING }, min: { type: Type.NUMBER }, minLength: { type: Type.NUMBER }, defaultValue: { type: Type.STRING } } } },
                            wageScales: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, name: { type: Type.STRING }, rate: { type: Type.NUMBER }, duration: { type: Type.NUMBER }, description: { type: Type.STRING } } } },
                            rules: { type: Type.OBJECT, properties: { overtimeRate: { type: Type.NUMBER }, leaderPremium: { type: Type.OBJECT, properties: { rate: { type: Type.NUMBER }, description: { type: Type.STRING } } }, doublingPremium: { type: Type.OBJECT, properties: { rate: { type: Type.NUMBER }, description: { type: Type.STRING } } }, pensionContribution: { type: Type.OBJECT, properties: { rate: { type: Type.NUMBER }, description: { type: Type.STRING }, basedOn: { type: Type.ARRAY, items: { type: Type.STRING } } } }, healthContribution: { type: Type.OBJECT, properties: { ratePerMusicianPerService: { type: Type.NUMBER }, description: { type: Type.STRING } } }, workDues: { type: Type.OBJECT, properties: { rate: { type: Type.NUMBER }, description: { type: Type.STRING }, basedOn: { type: Type.ARRAY, items: { type: Type.STRING } } } } } },
                            summary: { type: Type.ARRAY, items: {} },
                            legalText: { type: Type.OBJECT, properties: { preamble: { type: Type.STRING }, clause_governingLaw: { type: Type.STRING }, clause_disputes: { type: Type.STRING } } }
                        }
                    }
                }
            });

            const jsonText = response.text || '{}';
            const parsedJson = JSON.parse(jsonText);
            return res.json({ result: parsedJson });
        } catch (err) {
            console.error('[POST /admin/scan]', err);
            return res.status(500).json({ error: err instanceof Error ? err.message : 'AI scan failed' });
        }
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
