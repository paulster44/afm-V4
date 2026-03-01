import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

export async function seedLocals() {
    console.log('Seeding LocalConfigs from JSON files...');

    // Path to the static configs folder in the frontend
    const configsDir = path.resolve(__dirname, '../../frontend/public/configs');
    const masterListPath = path.join(configsDir, 'locals.json');

    if (!fs.existsSync(masterListPath)) {
        console.error(`Master locals list not found at: ${masterListPath}`);
        return;
    }

    const masterListData = JSON.parse(fs.readFileSync(masterListPath, 'utf-8'));
    const localsParams = masterListData.locals; // e.g. [{ id: 802, name: ... }]

    for (const localData of localsParams) {
        const localId = localData.id;
        const jsonFileName = `local_${localId}.json`;
        const jsonFilePath = path.join(configsDir, jsonFileName);

        if (fs.existsSync(jsonFilePath)) {
            const configData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));

            await prisma.localConfig.upsert({
                where: { id: localId },
                update: {
                    name: localData.name,
                    config: configData
                },
                create: {
                    id: localId,
                    name: localData.name,
                    config: configData
                }
            });

            console.log(`✅ Uploaded Local ${localId} to database.`);
        } else {
            console.warn(`⚠️ Warning: Could not find configuration file: ${jsonFileName}`);
        }
    }

    console.log('Database seeding complete.');
}
