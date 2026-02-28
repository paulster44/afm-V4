import { Request, Response, NextFunction } from 'express';
import { auth } from '../utils/firebase';
import { prisma } from '../utils/prisma';

export interface AuthRequest extends Request {
  user?: {
    id: string; // Prisma ID or Firebase UID fallback
    email: string;
    role?: string;
  };
  workspaceId?: string;
  membershipRole?: string;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies?.token;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    // Verify the Firebase ID token
    const decodedToken = await auth.verifyIdToken(token);

    if (!decodedToken.email) {
      return res.status(401).json({ error: 'Unauthorized: Email required' });
    }

    // Try to safely map to existing PostgreSQL user by email to get their assigned role
    const dbUser = await prisma.user.findUnique({ where: { email: decodedToken.email } });

    req.user = {
      id: dbUser ? dbUser.id : decodedToken.uid,
      email: decodedToken.email,
      role: dbUser?.role || 'USER' // Defaults to USER if not in DB, though they should be auto-provisioned
    };

    next();
  } catch (error) {
    console.error('[requireAuth]', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // Rely on requireAuth to have run first
  if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'GOD')) {
    return res.status(403).json({ error: 'Forbidden: Requires Admin Privileges' });
  }
  next();
};

export const requireGod = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // Rely on requireAuth to have run first
  if (!req.user || req.user.role !== 'GOD') {
    return res.status(403).json({ error: 'Forbidden: Requires God Privileges' });
  }
  next();
};
