-- AlterTable
ALTER TABLE "Click" ADD COLUMN     "visitorHash" TEXT;

-- CreateIndex
CREATE INDEX "Click_linkId_visitorHash_idx" ON "Click"("linkId", "visitorHash");
