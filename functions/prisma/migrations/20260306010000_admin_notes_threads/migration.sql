-- AlterTable
ALTER TABLE "AdminNote" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'General';
ALTER TABLE "AdminNote" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AdminNote" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "AdminNote_parentId_idx" ON "AdminNote"("parentId");

-- AddForeignKey
ALTER TABLE "AdminNote" ADD CONSTRAINT "AdminNote_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AdminNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
