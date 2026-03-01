require('dotenv').config({ path: '../.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    const latestContract = await prisma.contract.findFirst({
        orderBy: { updatedAt: 'desc' },
        include: { versions: true }
    });
    console.log('--- LATEST CONTRACT ---');
    console.table([{
        id: latestContract.id,
        name: latestContract.name,
        contractTypeId: latestContract.contractTypeId,
        versionsCount: latestContract.versions.length,
        firstVersionName: latestContract.versions[0]?.name
    }]);
}
test()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
