-- AlterTable
ALTER TABLE "Click" ADD COLUMN "eventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Click_eventId_key" ON "Click"("eventId");
