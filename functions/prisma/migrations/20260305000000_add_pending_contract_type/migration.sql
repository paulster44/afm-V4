-- CreateTable
CREATE TABLE "PendingContractType" (
    "id" TEXT NOT NULL,
    "localId" INTEGER NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "parsedData" JSONB NOT NULL,
    "error" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingContractType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingContractType_localId_status_idx" ON "PendingContractType"("localId", "status");

-- CreateIndex
CREATE INDEX "PendingContractType_batchId_idx" ON "PendingContractType"("batchId");
