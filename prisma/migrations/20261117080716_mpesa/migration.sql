-- AlterTable
ALTER TABLE "PaymentChannel" ADD COLUMN     "environment" TEXT NOT NULL DEFAULT 'sandbox',
ADD COLUMN     "lastCallbackAt" TIMESTAMP(3),
ADD COLUMN     "registeredAt" TIMESTAMP(3);
