import { Router, Response } from 'express';
import { prisma } from '../utils/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

const GOD_EMAIL = 'paulpivetta@gmail.com';

// Auto-provisioning endpoint: Called by the frontend immediately after Firebase login.
// It ensures the Firebase User exists in the local PostgreSQL DB.
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id: firebaseUid, email } = req.user!;

    // 1. Check if user exists by email (primary linkage point from Firebase migration)
    let dbUser = await prisma.user.findUnique({ where: { email } });

    if (!dbUser) {
      // 2. Auto-provision user if they do not exist
      const initialRole = email.toLowerCase() === GOD_EMAIL ? 'GOD' : 'USER';

      dbUser = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            id: firebaseUid, // Use the Firebase UID as the primary key
            email,
            name: email.split('@')[0], // Default name
            role: initialRole,
          },
        });

        const workspace = await tx.workspace.create({
          data: {
            name: `${newUser.name}'s Workspace`,
            ownerUserId: newUser.id,
          },
        });

        await tx.membership.create({
          data: {
            userId: newUser.id,
            workspaceId: workspace.id,
            role: 'OWNER',
          },
        });

        return newUser;
      });
    } else {
      // 3. Force paulpivetta@gmail.com to always be GOD on login, fixing retroactively
      if (email.toLowerCase() === GOD_EMAIL && dbUser.role !== 'GOD') {
        dbUser = await prisma.user.update({
          where: { id: dbUser.id },
          data: { role: 'GOD' },
        });
      }
    }

    res.json({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        createdAt: dbUser.createdAt,
        // Calculate isAdmin for legacy frontend convenience, but prefer explicit roles
        isAdmin: dbUser.role === 'ADMIN' || dbUser.role === 'GOD',
        isGod: dbUser.role === 'GOD',
      }
    });
  } catch (error) {
    console.error('[GET /auth/me error]', error);
    res.status(500).json({ error: 'Internal server error during auto-provisioning' });
  }
});

export default router;
