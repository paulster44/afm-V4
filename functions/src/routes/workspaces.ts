import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireWorkspace, requireRole } from '../middleware/tenant';
import crypto from 'crypto';

const router = Router();

router.use(requireAuth);

const createWorkspaceSchema = z.object({
  name: z.string().min(1),
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name } = createWorkspaceSchema.parse(req.body);

    const workspace = await prisma.$transaction(async (tx) => {
      const newWorkspace = await tx.workspace.create({
        data: {
          name,
          ownerUserId: req.user!.id,
        },
      });

      await tx.membership.create({
        data: {
          userId: req.user!.id,
          workspaceId: newWorkspace.id,
          role: 'OWNER',
        },
      });

      return newWorkspace;
    });

    res.status(201).json({ workspace });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', async (req: AuthRequest, res: Response) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.user!.id },
      include: { workspace: true },
    });

    const workspaces = memberships.map(m => ({
      ...m.workspace,
      role: m.role,
    }));

    res.json({ workspaces });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER']),
});

router.post('/invite', requireWorkspace, requireRole(['OWNER', 'ADMIN']), async (req: AuthRequest, res: Response) => {
  try {
    const { email, role } = inviteSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMembership = await prisma.membership.findUnique({
        where: { userId_workspaceId: { userId: existingUser.id, workspaceId: req.workspaceId! } },
      });
      if (existingMembership) {
        return res.status(400).json({ error: 'User is already a member' });
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await prisma.invite.upsert({
      where: { email_workspaceId: { email, workspaceId: req.workspaceId! } },
      update: { role, token, expiresAt },
      create: { email, workspaceId: req.workspaceId!, role, token, expiresAt },
    });

    // In a real app, send an email here
    res.json({ message: 'Invite created', inviteToken: invite.token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

const acceptInviteSchema = z.object({
  token: z.string(),
});

router.post('/accept-invite', async (req: AuthRequest, res: Response) => {
  try {
    const { token } = acceptInviteSchema.parse(req.body);

    const invite = await prisma.invite.findUnique({ where: { token } });
    if (!invite || invite.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired invite token' });
    }

    if (invite.email !== req.user!.email) {
      return res.status(403).json({ error: 'This invite is for a different email address' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.membership.create({
        data: {
          userId: req.user!.id,
          workspaceId: invite.workspaceId,
          role: invite.role,
        },
      });

      await tx.invite.delete({ where: { id: invite.id } });
    });

    res.json({ message: 'Invite accepted successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/members', requireWorkspace, async (req: AuthRequest, res: Response) => {
  try {
    const members = await prisma.membership.findMany({
      where: { workspaceId: req.workspaceId! },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });
    res.json({ members });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

const updateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER']),
});

router.patch('/members/:id', requireWorkspace, requireRole(['OWNER', 'ADMIN']), async (req: AuthRequest, res: Response) => {
  try {
    const { role } = updateRoleSchema.parse(req.body);
    const membershipId = req.params.id;

    const membership = await prisma.membership.findUnique({ where: { id: membershipId } });
    if (!membership || membership.workspaceId !== req.workspaceId) {
      return res.status(404).json({ error: 'Membership not found' });
    }

    if (membership.role === 'OWNER') {
      return res.status(400).json({ error: 'Cannot change role of the owner' });
    }

    if (req.membershipRole === 'ADMIN' && role === 'ADMIN') {
      // Admins can't promote to ADMIN if they want, or maybe they can. Let's allow it.
    }

    const updated = await prisma.membership.update({
      where: { id: membershipId },
      data: { role },
    });

    res.json({ membership: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/members/:id', requireWorkspace, requireRole(['OWNER', 'ADMIN']), async (req: AuthRequest, res: Response) => {
  try {
    const membershipId = req.params.id;

    const membership = await prisma.membership.findUnique({ where: { id: membershipId } });
    if (!membership || membership.workspaceId !== req.workspaceId) {
      return res.status(404).json({ error: 'Membership not found' });
    }

    if (membership.role === 'OWNER') {
      return res.status(400).json({ error: 'Cannot remove the owner' });
    }

    await prisma.membership.delete({ where: { id: membershipId } });

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
