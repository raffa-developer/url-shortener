-- CreateTable
CREATE TABLE "Click" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "country" TEXT,
    "device" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "referrer" TEXT,

    CONSTRAINT "Click_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Click_linkId_timestamp_idx" ON "Click"("linkId", "timestamp");

-- CreateIndex
CREATE INDEX "Click_linkId_country_idx" ON "Click"("linkId", "country");

-- CreateIndex
CREATE INDEX "Click_linkId_device_idx" ON "Click"("linkId", "device");

-- CreateIndex
CREATE INDEX "Click_linkId_browser_idx" ON "Click"("linkId", "browser");

-- AddForeignKey
ALTER TABLE "Click" ADD CONSTRAINT "Click_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "Link"("id") ON DELETE CASCADE ON UPDATE CASCADE;
