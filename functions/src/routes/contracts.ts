import { Router, Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { createContractSchema, updateContractSchema, createVersionSchema } from '../schemas/contracts';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /api/contracts?localId=47
// Returns all contracts for the authenticated user, optionally filtered by localId
router.get('/', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const localId = req.query.localId ? parseInt(req.query.localId as string, 10) : undefined;

        const where: { userId: string; localId?: number } = { userId };
        if (localId !== undefined && !isNaN(localId)) {
            where.localId = localId;
        }

        const contracts = await prisma.contract.findMany({
            where,
            include: { versions: { orderBy: { createdAt: 'asc' } } },
            orderBy: { updatedAt: 'desc' },
        });

        res.json({ contracts });
    } catch (error) {
        console.error('[GET /contracts]', error);
        res.status(500).json({ error: 'Failed to fetch contracts' });
    }
});

// POST /api/contracts
// Creates a new contract with optional version snapshots
router.post('/', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const data = createContractSchema.parse(req.body);

        const versionsData = data.versions && data.versions.length > 0
            ? {
                create: data.versions.map((v) => ({
                    name: v.name,
                    formData: v.formData,
                    personnel: v.personnel,
                    contractTypeId: v.contractTypeId ?? data.contractTypeId
                }))
            }
            : undefined;

        const contract = await prisma.contract.create({
            data: {
                userId,
                localId: data.localId as number,
                contractTypeId: data.contractTypeId,
                name: data.name,
                baseFormData: data.baseFormData,
                personnel: data.personnel,
                ...(versionsData ? { versions: versionsData } : {}),
                activeVersionIndex: data.activeVersionIndex ?? null,
            },
            include: { versions: { orderBy: { createdAt: 'asc' } } },
        });

        res.status(201).json({ contract });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('[POST /contracts]', error);
        res.status(500).json({ error: 'Failed to create contract' });
    }
});

// PUT /api/contracts/:id
// Updates an existing contract (must belong to the authenticated user)
router.put('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;
        const data = updateContractSchema.parse(req.body);

        // Verify ownership
        const existing = await prisma.contract.findFirst({ where: { id, userId } });

        if (!existing) {
            return res.status(404).json({ error: 'Contract not found or access denied' });
        }

        // Build the versions update object
        let versionsUpdate: Record<string, unknown> | undefined = undefined;
        if (data.versions) {
            versionsUpdate = {
                deleteMany: {},
                ...(data.versions.length > 0 ? {
                    create: data.versions.map((v) => ({
                        name: v.name,
                        formData: v.formData,
                        personnel: v.personnel,
                        contractTypeId: v.contractTypeId ?? data.contractTypeId ?? existing.contractTypeId
                    }))
                } : {})
            };
        }

        const contract = await prisma.contract.update({
            where: { id },
            data: {
                contractTypeId: data.contractTypeId ?? existing.contractTypeId,
                name: data.name ?? existing.name,
                baseFormData: data.baseFormData ?? existing.baseFormData as Prisma.InputJsonValue,
                personnel: data.personnel ?? existing.personnel as Prisma.InputJsonValue,
                ...(versionsUpdate ? { versions: versionsUpdate } : {}),
                activeVersionIndex: data.activeVersionIndex ?? existing.activeVersionIndex,
            },
            include: { versions: { orderBy: { createdAt: 'asc' } } },
        });

        res.json({ contract });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('[PUT /contracts/:id]', error);
        res.status(500).json({ error: 'Failed to update contract' });
    }
});

// DELETE /api/contracts/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;

        // Verify ownership
        const existing = await prisma.contract.findFirst({ where: { id, userId } });

        if (!existing) {
            return res.status(404).json({ error: 'Contract not found or access denied' });
        }

        await prisma.contract.delete({ where: { id } });
        res.json({ message: 'Contract deleted' });
    } catch (error) {
        console.error('[DELETE /contracts/:id]', error);
        res.status(500).json({ error: 'Failed to delete contract' });
    }
});

// POST /api/contracts/:id/versions
// Saves a version snapshot of a contract
router.post('/:id/versions', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;
        const data = createVersionSchema.parse(req.body);

        const existing = await prisma.contract.findFirst({ where: { id, userId } });
        if (!existing) {
            return res.status(404).json({ error: 'Contract not found' });
        }

        const version = await prisma.contractVersion.create({
            data: {
                contractId: id,
                name: data.name || new Date().toISOString(),
                formData: data.formData,
                personnel: data.personnel,
                contractTypeId: data.contractTypeId ?? existing.contractTypeId,
            },
        });

        res.status(201).json({ version });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('[POST /contracts/:id/versions]', error);
        res.status(500).json({ error: 'Failed to save version' });
    }
});

// DELETE /api/contracts/:id/versions/:versionId
router.delete('/:id/versions/:versionId', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id, versionId } = req.params;

        const existing = await prisma.contract.findFirst({ where: { id, userId } });
        if (!existing) {
            return res.status(404).json({ error: 'Contract not found' });
        }

        await prisma.contractVersion.delete({ where: { id: versionId, contractId: id } });
        res.json({ message: 'Version deleted' });
    } catch (error) {
        console.error('[DELETE /contracts/:id/versions/:versionId]', error);
        res.status(500).json({ error: 'Failed to delete version' });
    }
});

export default router;
