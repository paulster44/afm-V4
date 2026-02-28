import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../utils/prisma';

export const requireWorkspace = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] as string;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing x-workspace-id header' });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user!.id,
          workspaceId: workspaceId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Forbidden: You do not have access to this workspace' });
    }

    req.workspaceId = workspaceId;
    req.membershipRole = membership.role;
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error checking workspace access' });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.membershipRole || !roles.includes(req.membershipRole)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
};
