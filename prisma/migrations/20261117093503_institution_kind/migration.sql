-- CreateEnum
CREATE TYPE "InstitutionKind" AS ENUM ('SCHOOL', 'TVET', 'UNIVERSITY');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "kind" "InstitutionKind" NOT NULL DEFAULT 'SCHOOL';
