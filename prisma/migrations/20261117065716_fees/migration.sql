/*
  Warnings:

  - A unique constraint covering the columns `[studentId,termId]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Counter_tenantId_key_key" ON "Counter"("tenantId", "key");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_termId_status_idx" ON "Invoice"("tenantId", "termId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_studentId_termId_key" ON "Invoice"("studentId", "termId");

-- AddForeignKey
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
