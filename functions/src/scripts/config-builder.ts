import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { scanWageAgreement } from '../utils/gemini';
import { extractedContractTypeSchema } from '../schemas/rules';
import 'dotenv/config';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
    return new Promise(resolve => rl.question(question, resolve));
}

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
    };
    return map[ext] || 'application/octet-stream';
}

async function main() {
    console.log('\n=== AFM Config Builder ===\n');

    // Step 1: Admin email for createdByUserId
    const adminEmail = await ask('Admin email: ');
    const user = await prisma.user.findFirst({ where: { email: adminEmail.trim() } });
    if (!user) {
        console.error(`Error: No user found with email "${adminEmail.trim()}"`);
        process.exit(1);
    }
    console.log(`  Authenticated as: ${user.email} (${user.id})\n`);

    // Step 2: Which local?
    const existingLocals = await prisma.localConfig.findMany({ select: { id: true, name: true } });
    if (existingLocals.length > 0) {
        console.log('Existing locals:');
        existingLocals.forEach(l => console.log(`  ${l.id} — ${l.name}`));
        console.log();
    }

    const localInput = await ask('Local ID (number, or "new" to create): ');

    let localId: number;
    let localName: string;

    if (localInput.trim().toLowerCase() === 'new') {
        const idStr = await ask('  New local ID (number): ');
        localId = parseInt(idStr.trim(), 10);
        if (isNaN(localId)) {
            console.error('Error: Invalid local ID');
            process.exit(1);
        }
        localName = await ask('  Local name: ');
        const currencySymbol = (await ask('  Currency symbol [$]: ')).trim() || '$';
        const currencyCode = (await ask('  Currency code [USD]: ')).trim() || 'USD';

        await prisma.localConfig.create({
            data: {
                id: localId,
                name: localName.trim(),
                config: {
                    localId,
                    localName: localName.trim(),
                    currency: { symbol: currencySymbol, code: currencyCode },
                    contractTypes: [],
                },
            },
        });
        console.log(`  Created local ${localId} — ${localName.trim()}\n`);
    } else {
        localId = parseInt(localInput.trim(), 10);
        const existing = await prisma.localConfig.findUnique({ where: { id: localId } });
        if (!existing) {
            console.error(`Error: Local ${localId} not found`);
            process.exit(1);
        }
        localName = existing.name;
        console.log(`  Selected: ${localId} — ${localName}\n`);
    }

    // Step 3: PDF file paths
    const pathInput = await ask('Path to wage agreement PDF(s) (comma-separated): ');
    const filePaths = pathInput.split(',').map(p => p.trim()).filter(Boolean);

    if (filePaths.length === 0) {
        console.error('Error: No file paths provided');
        process.exit(1);
    }

    // Validate files exist
    for (const fp of filePaths) {
        if (!fs.existsSync(fp)) {
            console.error(`Error: File not found — ${fp}`);
            process.exit(1);
        }
    }

    const batchId = randomUUID();
    let totalExtracted = 0;
    let totalErrors = 0;

    for (const fp of filePaths) {
        const fileName = path.basename(fp);
        console.log(`\nProcessing: ${fileName}...`);

        const fileBuffer = fs.readFileSync(fp);
        const mimeType = getMimeType(fp);

        const result = await scanWageAgreement(fileBuffer, mimeType);

        if (!result.success) {
            console.error(`  Error: ${result.error}`);
            await prisma.pendingContractType.create({
                data: {
                    localId,
                    sourceFileName: fileName,
                    status: 'error',
                    parsedData: {},
                    error: result.error || 'Unknown error',
                    createdByUserId: user.id,
                    batchId,
                },
            });
            totalErrors++;
            continue;
        }

        // Log top-level extraction notes
        if (result.extractionNotes && result.extractionNotes.length > 0) {
            console.log('  Extraction notes:');
            result.extractionNotes.forEach(n => console.log(`    - ${n}`));
        }

        // Validate and write each contract type
        for (const ct of result.contractTypes || []) {
            const validation = extractedContractTypeSchema.safeParse(ct);

            if (!validation.success) {
                const errorMsg = validation.error.issues
                    .map(i => `${i.path.join('.')}: ${i.message}`)
                    .join('; ');
                console.error(`  Validation failed for "${(ct as { name?: string }).name || 'unknown'}": ${errorMsg}`);

                await prisma.pendingContractType.create({
                    data: {
                        localId,
                        sourceFileName: fileName,
                        status: 'error',
                        parsedData: ct as object,
                        error: `Validation: ${errorMsg}`,
                        createdByUserId: user.id,
                        batchId,
                    },
                });
                totalErrors++;
            } else {
                await prisma.pendingContractType.create({
                    data: {
                        localId,
                        sourceFileName: fileName,
                        status: 'pending',
                        parsedData: validation.data as object,
                        error: null,
                        createdByUserId: user.id,
                        batchId,
                    },
                });
                console.log(`  Extracted: ${validation.data.name} (${validation.data.id})`);
                totalExtracted++;
            }
        }
    }

    console.log(`\n=== Done ===`);
    console.log(`  Batch ID: ${batchId}`);
    console.log(`  Extracted: ${totalExtracted} contract types`);
    console.log(`  Errors: ${totalErrors}`);
    console.log(`\n  Review and approve in the admin panel.\n`);

    rl.close();
    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
