import { Router, Response, Request } from 'express';
import { prisma } from '../utils/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /api/announcements/latest
// Fetch the most recent active global announcement
// We require authentication so only logged-in users see it.
router.get('/latest', requireAuth, async (req: Request, res: Response) => {
    try {
        const announcement = await prisma.announcement.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ announcement });
    } catch (error) {
        console.error('[GET /announcements/latest]', error);
        res.status(500).json({ error: 'Failed to fetch the latest announcement' });
    }
});

export default router;
