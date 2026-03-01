import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/locals -> Returns a list of all local configurations (id and name only, for the selector)
router.get('/', async (req, res) => {
    try {
        const locals = await prisma.localConfig.findMany({
            select: {
                id: true,
                name: true,
            },
            orderBy: { id: 'asc' }
        });

        // Formatting to match the old locals.json structure for backwards compatibility
        res.json({ locals });
    } catch (error) {
        console.error('Error fetching locals list:', error);
        res.status(500).json({ error: 'Failed to fetch locals list' });
    }
});

// GET /api/locals/:id -> Returns the full JSON configuration for a specific local
router.get('/:id', async (req, res) => {
    try {
        const localId = parseInt(req.params.id, 10);
        if (isNaN(localId)) {
            return res.status(400).json({ error: 'Invalid local ID' });
        }

        const localConfig = await prisma.localConfig.findUnique({
            where: { id: localId }
        });

        if (!localConfig) {
            return res.status(404).json({ error: 'Local configuration not found' });
        }

        // Return just the JSON config object to match the old static file behavior
        res.json(localConfig.config);
    } catch (error) {
        console.error(`Error fetching local config ${req.params.id}:`, error);
        res.status(500).json({ error: 'Failed to fetch local configuration' });
    }
});

// POST /api/locals -> Create a new local configuration (Admin Only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id, name, config } = req.body;

        if (!id || !name || !config) {
            return res.status(400).json({ error: 'Missing required fields (id, name, config)' });
        }

        const newLocal = await prisma.localConfig.create({
            data: {
                id: parseInt(id, 10),
                name,
                config,
            }
        });

        res.status(201).json(newLocal);
    } catch (error: any) {
        console.error('Error creating local:', error);
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'A local with this ID already exists.' });
        }
        res.status(500).json({ error: 'Failed to create local configuration' });
    }
});

// PUT /api/locals/:id -> Update an existing local configuration (Admin Only)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const localId = parseInt(req.params.id, 10);
        const { name, config } = req.body;

        if (isNaN(localId)) {
            return res.status(400).json({ error: 'Invalid local ID' });
        }

        const updatedLocal = await prisma.localConfig.update({
            where: { id: localId },
            data: {
                ...(name && { name }),
                ...(config && { config })
            }
        });

        res.json(updatedLocal);
    } catch (error) {
        console.error(`Error updating local ${req.params.id}:`, error);
        res.status(500).json({ error: 'Failed to update local configuration' });
    }
});

// DELETE /api/locals/:id -> Delete a local configuration (Admin Only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const localId = parseInt(req.params.id, 10);
        if (isNaN(localId)) {
            return res.status(400).json({ error: 'Invalid local ID' });
        }

        await prisma.localConfig.delete({
            where: { id: localId }
        });

        res.status(204).send();
    } catch (error) {
        console.error(`Error deleting local ${req.params.id}:`, error);
        res.status(500).json({ error: 'Failed to delete local configuration' });
    }
});

export default router;
