import { Router, Response } from 'express';
import { prisma } from '../utils/prisma';
import { requireAuth, requireAdmin, requireGod, AuthRequest } from '../middleware/auth';

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
        const { role } = req.body;

        if (!['USER', 'ADMIN', 'GOD'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: { role },
            select: { id: true, email: true, role: true }
        });

        res.json({ user: updatedUser });
    } catch (error) {
        console.error('[PUT /admin/users/:id/role]', error);
        res.status(500).json({ error: 'Failed to update user role' });
    }
});

import { Request } from 'express';
import { exec } from 'child_process';
import path from 'path';

// GET /api/admin/migrate
// TEMPORARY: Force database migrations to run from within the cloud environment
router.get('/migrate', async (req: Request, res: Response) => {
    try {
        const migrationsDir = path.resolve(__dirname, '../../');
        exec(
            'npx prisma migrate deploy',
            { cwd: migrationsDir, env: { ...process.env } },
            (err, stdout, stderr) => {
                if (err) {
                    res.status(500).json({ error: stderr || err.message });
                } else {
                    res.json({ message: 'Migration successful', output: stdout });
                }
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Failed to run migration' });
    }
});

export default router;
