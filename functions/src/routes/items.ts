import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireWorkspace } from '../middleware/tenant';

const router = Router();

router.use(requireAuth, requireWorkspace);

const itemSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { title, description } = itemSchema.parse(req.body);

    const item = await prisma.item.create({
      data: {
        title,
        description,
        workspaceId: req.workspaceId!,
        createdByUserId: req.user!.id,
      },
    });

    res.status(201).json({ item });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const items = await prisma.item.findMany({
      where: { workspaceId: req.workspaceId! },
    });
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const item = await prisma.item.findUnique({
      where: { id: req.params.id },
    });

    if (!item || item.workspaceId !== req.workspaceId) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ item });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { title, description } = itemSchema.parse(req.body);

    const item = await prisma.item.findUnique({
      where: { id: req.params.id },
    });

    if (!item || item.workspaceId !== req.workspaceId) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updated = await prisma.item.update({
      where: { id: req.params.id },
      data: { title, description },
    });

    res.json({ item: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const item = await prisma.item.findUnique({
      where: { id: req.params.id },
    });

    if (!item || item.workspaceId !== req.workspaceId) {
      return res.status(404).json({ error: 'Item not found' });
    }

    await prisma.item.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
