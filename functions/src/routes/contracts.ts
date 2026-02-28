import { Router, Response } from 'express';
import { prisma } from '../utils/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

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
// Creates a new contract
router.post('/', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { localId, contractTypeId, name, baseFormData, personnel } = req.body;

        if (!localId || !contractTypeId || !name) {
            return res.status(400).json({ error: 'localId, contractTypeId, and name are required' });
        }

        const contract = await prisma.contract.create({
            data: {
                userId,
                localId: parseInt(localId, 10),
                contractTypeId,
                name,
                baseFormData: baseFormData ?? {},
                personnel: personnel ?? [],
            },
            include: { versions: true },
        });

        res.status(201).json({ contract });
    } catch (error) {
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
        const { contractTypeId, name, baseFormData, personnel } = req.body;

        // Verify ownership
        const existing = await prisma.contract.findFirst({ where: { id, userId } });

        if (!existing) {
            return res.status(404).json({ error: 'Contract not found or access denied' });
        }

        const contract = await prisma.contract.update({
            where: { id },
            data: {
                contractTypeId: contractTypeId ?? existing.contractTypeId,
                name: name ?? existing.name,
                baseFormData: baseFormData ?? existing.baseFormData,
                personnel: personnel ?? existing.personnel,
            },
            include: { versions: { orderBy: { createdAt: 'asc' } } },
        });

        res.json({ contract });
    } catch (error) {
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
        const { name, formData, personnel, contractTypeId } = req.body;

        const existing = await prisma.contract.findFirst({ where: { id, userId } });
        if (!existing) {
            return res.status(404).json({ error: 'Contract not found' });
        }

        const version = await prisma.contractVersion.create({
            data: {
                contractId: id,
                name: name || new Date().toISOString(),
                formData: formData ?? {},
                personnel: personnel ?? [],
                contractTypeId: contractTypeId ?? existing.contractTypeId,
            },
        });

        res.status(201).json({ version });
    } catch (error) {
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

        await prisma.contractVersion.delete({ where: { id: versionId } });
        res.json({ message: 'Version deleted' });
    } catch (error) {
        console.error('[DELETE /contracts/:id/versions/:versionId]', error);
        res.status(500).json({ error: 'Failed to delete version' });
    }
});

export default router;
