import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import AdmZip from 'adm-zip';
import Busboy from 'busboy';
import { prisma } from '../utils/prisma';
import { scanContractDocument } from '../utils/gemini';
import { requireAuth, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { batchPendingQuerySchema, updateParsedDataSchema, batchDriveSchema } from '../schemas/batch';

const router = Router();

router.use(requireAuth);
router.use(requireSuperAdmin);

const SUPPORTED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx'];
const MAX_FILES = 15;
const MAX_ZIP_SIZE = 50 * 1024 * 1024; // 50MB

function getMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    const mimeMap: Record<string, string> = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return mimeMap[ext || ''] || 'application/octet-stream';
}

// POST /api/admin/batch-upload
// Upload a ZIP file containing contract documents, process each through Gemini
router.post('/batch-upload', (req: AuthRequest, res: Response) => {
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: MAX_ZIP_SIZE } });
    let zipBuffer: Buffer | null = null;
    let localId: number | null = null;

    busboy.on('field', (fieldname, val) => {
        if (fieldname === 'localId') {
            const parsed = parseInt(val, 10);
            if (!isNaN(parsed)) localId = parsed;
        }
    });

    busboy.on('file', (fieldname, file, info) => {
        if (fieldname === 'zipFile') {
            const chunks: Buffer[] = [];
            file.on('data', (data) => chunks.push(data));
            file.on('end', () => { zipBuffer = Buffer.concat(chunks); });
        } else {
            file.resume();
        }
    });

    busboy.on('finish', async () => {
        if (!zipBuffer) {
            return res.status(400).json({ error: 'ZIP file is required' });
        }
        if (localId === null) {
            return res.status(400).json({ error: 'localId is required' });
        }

        // Verify the local exists
        const localConfig = await prisma.localConfig.findUnique({ where: { id: localId } });
        if (!localConfig) {
            return res.status(404).json({ error: `Local ${localId} not found` });
        }

        let zip: AdmZip;
        try {
            zip = new AdmZip(zipBuffer);
        } catch {
            return res.status(400).json({ error: 'Invalid ZIP file' });
        }

        const entries = zip.getEntries().filter(entry => {
            if (entry.isDirectory) return false;
            const name = entry.entryName.toLowerCase();
            // Skip macOS resource fork files
            if (name.includes('__macosx') || name.startsWith('.')) return false;
            return SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext));
        });

        if (entries.length === 0) {
            return res.status(400).json({ error: 'No supported files found in ZIP (pdf, png, jpg, doc, docx)' });
        }
        if (entries.length > MAX_FILES) {
            return res.status(400).json({ error: `Too many files. Maximum is ${MAX_FILES}, found ${entries.length}` });
        }

        const batchId = randomUUID();
        const userId = req.user!.id;
        let processed = 0;
        let failed = 0;

        for (const entry of entries) {
            const fileBuffer = entry.getData();
            const fileName = entry.entryName.split('/').pop() || entry.entryName;
            const mimeType = getMimeType(fileName);

            const result = await scanContractDocument(fileBuffer, mimeType);

            await prisma.pendingContractType.create({
                data: {
                    localId,
                    sourceFileName: fileName,
                    status: result.success ? 'pending' : 'error',
                    parsedData: result.success ? (result.data as object) : {},
                    error: result.error || null,
                    createdByUserId: userId,
                    batchId,
                }
            });

            if (result.success) {
                processed++;
            } else {
                failed++;
            }
        }

        return res.status(201).json({
            batchId,
            totalFiles: entries.length,
            processed,
            failed,
        });
    });

    busboy.on('error', (err) => {
        console.error('[POST /admin/batch-upload] Busboy error:', err);
        return res.status(500).json({ error: 'Error processing upload' });
    });

    // @ts-ignore - rawBody is added by Firebase
    if (req.rawBody) {
        // @ts-ignore
        busboy.end(req.rawBody);
    } else {
        req.pipe(busboy);
    }
});

// Google Drive ingestion helpers
const SUPPORTED_DRIVE_MIMES: Record<string, string> = {
    'application/pdf': '.pdf',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

function extractFolderId(url: string): string | null {
    // https://drive.google.com/drive/folders/<ID>?...
    const folderMatch = url.match(/\/folders\/([A-Za-z0-9_-]+)/);
    if (folderMatch) return folderMatch[1];
    // https://drive.google.com/drive/u/0/folders/<ID>
    const uMatch = url.match(/\/folders\/([A-Za-z0-9_-]+)/);
    if (uMatch) return uMatch[1];
    // https://drive.google.com/folderview?id=<ID>
    const paramMatch = url.match(/folderview\?id=([A-Za-z0-9_-]+)/);
    if (paramMatch) return paramMatch[1];
    return null;
}

// POST /api/admin/batch-drive
// Import files from a public Google Drive folder
router.post('/batch-drive', async (req: AuthRequest, res: Response) => {
    try {
        const { folderUrl, localId } = batchDriveSchema.parse(req.body);

        const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GOOGLE_DRIVE_API_KEY is not configured' });
        }

        const folderId = extractFolderId(folderUrl);
        if (!folderId) {
            return res.status(400).json({ error: 'Could not extract folder ID from URL' });
        }

        const localConfig = await prisma.localConfig.findUnique({ where: { id: localId } });
        if (!localConfig) {
            return res.status(404).json({ error: `Local ${localId} not found` });
        }

        // List files in the folder
        const listUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType)&key=${apiKey}&pageSize=100`;
        const listRes = await fetch(listUrl);
        if (!listRes.ok) {
            const errBody = await listRes.text();
            console.error('[batch-drive] Drive list error:', errBody);
            return res.status(400).json({ error: 'Failed to list Drive folder. Make sure the folder is shared publicly.' });
        }

        const listData = await listRes.json() as { files: { id: string; name: string; mimeType: string }[] };
        const driveFiles = (listData.files || []).filter(f => f.mimeType in SUPPORTED_DRIVE_MIMES);

        if (driveFiles.length === 0) {
            return res.status(400).json({ error: 'No supported files found in folder (PDF, PNG, JPG, DOC, DOCX). Google Docs native files are not supported.' });
        }
        if (driveFiles.length > MAX_FILES) {
            return res.status(400).json({ error: `Too many files. Maximum is ${MAX_FILES}, found ${driveFiles.length}` });
        }

        const batchId = randomUUID();
        const userId = req.user!.id;
        let processed = 0;
        let failed = 0;

        for (const driveFile of driveFiles) {
            const downloadUrl = `https://www.googleapis.com/drive/v3/files/${driveFile.id}?alt=media&key=${apiKey}`;
            const fileRes = await fetch(downloadUrl);
            if (!fileRes.ok) {
                console.error(`[batch-drive] Failed to download ${driveFile.name}:`, fileRes.status);
                await prisma.pendingContractType.create({
                    data: {
                        localId,
                        sourceFileName: driveFile.name,
                        status: 'error',
                        parsedData: {},
                        error: `Failed to download from Drive (HTTP ${fileRes.status})`,
                        createdByUserId: userId,
                        batchId,
                    },
                });
                failed++;
                continue;
            }

            const arrayBuffer = await fileRes.arrayBuffer();
            const fileBuffer = Buffer.from(arrayBuffer);
            const mimeType = driveFile.mimeType;

            const result = await scanContractDocument(fileBuffer, mimeType);

            await prisma.pendingContractType.create({
                data: {
                    localId,
                    sourceFileName: driveFile.name,
                    status: result.success ? 'pending' : 'error',
                    parsedData: result.success ? (result.data as object) : {},
                    error: result.error || null,
                    createdByUserId: userId,
                    batchId,
                },
            });

            if (result.success) {
                processed++;
            } else {
                failed++;
            }
        }

        return res.status(201).json({
            batchId,
            totalFiles: driveFiles.length,
            processed,
            failed,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('[POST /admin/batch-drive]', error);
        return res.status(500).json({ error: 'Failed to process Drive folder' });
    }
});

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
