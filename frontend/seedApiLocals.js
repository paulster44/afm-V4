import fs from 'fs';
import path from 'path';

// Note: Ensure you change the POST route in `locals.ts` to NOT require authentication
// temporarily, or run this with a valid bearer token.

const API_URL = 'https://api-olic7ddwoq-uc.a.run.app/api/locals';

async function seedLocals() {
    console.log('Seeding LocalConfigs to production API...');

    const configsDir = path.resolve(import.meta.dirname, './public/configs');
    const masterListPath = path.join(configsDir, 'locals.json');

    if (!fs.existsSync(masterListPath)) {
        console.error(`Master locals list not found at: ${masterListPath}`);
        return;
    }

    const masterListData = JSON.parse(fs.readFileSync(masterListPath, 'utf-8'));
    const localsParams = masterListData.locals;

    for (const localData of localsParams) {
        const localId = localData.id;
        const jsonFileName = `local_${localId}.json`;
        const jsonFilePath = path.join(configsDir, jsonFileName);

        if (fs.existsSync(jsonFilePath)) {
            const configData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));

            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: localId,
                        name: localData.name,
                        config: configData
                    })
                });

                if (response.ok) {
                    console.log(`✅ Uploaded Local ${localId} to production database.`);
                } else {
                    console.error(`❌ Failed to upload Local ${localId}. Status: ${response.status} - ${await response.text()}`);
                }
            } catch (error) {
                console.error(`❌ Error uploading Local ${localId}:`, error);
            }

        } else {
            console.warn(`⚠️ Warning: Could not find configuration file: ${jsonFileName}`);
        }
    }

    console.log('API seeding complete.');
}

seedLocals().catch(console.error);
