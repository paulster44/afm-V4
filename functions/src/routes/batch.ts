import { Router, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { requireAuth, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { batchPendingQuerySchema, updateParsedDataSchema } from '../schemas/batch';

const router = Router();

router.use(requireAuth);
router.use(requireSuperAdmin);

// GET /api/admin/batch-pending
// List pending items, filterable by localId, status, batchId
router.get('/batch-pending', async (req: AuthRequest, res: Response) => {
    try {
        const query = batchPendingQuerySchema.parse(req.query);

        const where: Record<string, unknown> = {};
        if (query.localId !== undefined) where.localId = query.localId;
        if (query.status) where.status = query.status;
        if (query.batchId) where.batchId = query.batchId;

        const items = await prisma.pendingContractType.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });

        res.json({ items });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('[GET /admin/batch-pending]', error);
        res.status(500).json({ error: 'Failed to fetch pending items' });
    }
});

// PUT /api/admin/batch-pending/:id
// Edit parsed JSON before approving
router.put('/batch-pending/:id', async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { parsedData } = updateParsedDataSchema.parse(req.body);

        const item = await prisma.pendingContractType.findUnique({ where: { id } });
        if (!item) {
            return res.status(404).json({ error: 'Pending item not found' });
        }
        if (item.status !== 'pending') {
            return res.status(400).json({ error: `Cannot edit item with status "${item.status}"` });
        }

        const updated = await prisma.pendingContractType.update({
            where: { id },
            data: { parsedData: parsedData as Prisma.InputJsonValue },
        });

        res.json({ item: updated });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('[PUT /admin/batch-pending/:id]', error);
        res.status(500).json({ error: 'Failed to update pending item' });
    }
});

// POST /api/admin/batch-pending/:id/approve
// Merge parsedData into the local's config.contractTypes[]
router.post('/batch-pending/:id/approve', async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const item = await prisma.pendingContractType.findUnique({ where: { id } });
        if (!item) {
            return res.status(404).json({ error: 'Pending item not found' });
        }
        if (item.status !== 'pending') {
            return res.status(400).json({ error: `Cannot approve item with status "${item.status}"` });
        }

        const localConfig = await prisma.localConfig.findUnique({ where: { id: item.localId } });
        if (!localConfig) {
            return res.status(404).json({ error: `Local ${item.localId} not found` });
        }

        const config = localConfig.config as { contractTypes?: { id: string }[] };
        const contractTypes = config.contractTypes || [];
        const parsedData = item.parsedData as { id?: string };

        // Check for duplicate contract type id
        if (parsedData.id && contractTypes.some(ct => ct.id === parsedData.id)) {
            return res.status(409).json({
                error: `Contract type "${parsedData.id}" already exists in Local ${item.localId}`
            });
        }

        // Append and save atomically
        const updatedContractTypes = [...contractTypes, parsedData];
        const updatedConfig = { ...config, contractTypes: updatedContractTypes };

        await prisma.$transaction([
            prisma.localConfig.update({
                where: { id: item.localId },
                data: { config: updatedConfig },
            }),
            prisma.pendingContractType.update({
                where: { id },
                data: { status: 'approved' },
            }),
        ]);

        res.json({ message: 'Contract type approved and added to local config' });
    } catch (error) {
        console.error('[POST /admin/batch-pending/:id/approve]', error);
        res.status(500).json({ error: 'Failed to approve item' });
    }
});

// POST /api/admin/batch-pending/:id/reject
// Mark as rejected
router.post('/batch-pending/:id/reject', async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const item = await prisma.pendingContractType.findUnique({ where: { id } });
        if (!item) {
            return res.status(404).json({ error: 'Pending item not found' });
        }
        if (item.status !== 'pending') {
            return res.status(400).json({ error: `Cannot reject item with status "${item.status}"` });
        }

        await prisma.pendingContractType.update({
            where: { id },
            data: { status: 'rejected' },
        });

        res.json({ message: 'Item rejected' });
    } catch (error) {
        console.error('[POST /admin/batch-pending/:id/reject]', error);
        res.status(500).json({ error: 'Failed to reject item' });
    }
});

// DELETE /api/admin/batch-pending/:id
// Hard delete
router.delete('/batch-pending/:id', async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const item = await prisma.pendingContractType.findUnique({ where: { id } });
        if (!item) {
            return res.status(404).json({ error: 'Pending item not found' });
        }

        await prisma.pendingContractType.delete({ where: { id } });

        res.status(204).send();
    } catch (error) {
        console.error('[DELETE /admin/batch-pending/:id]', error);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

export default router;
