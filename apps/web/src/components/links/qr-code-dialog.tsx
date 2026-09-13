import { useRef } from "react";
import { Download } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface QrTarget {
  shortCode: string;
  shortUrl: string;
}

export function QrCodeDialog({
  target,
  onOpenChange,
}: {
  target: QrTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  function download(): void {
    const canvas = wrapperRef.current?.querySelector("canvas");
    if (!canvas || !target) {
      return;
    }
    const anchor = document.createElement("a");
    anchor.download = `${target.shortCode}-qr.png`;
    anchor.href = canvas.toDataURL("image/png");
    anchor.click();
  }

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>QR code</DialogTitle>
          <DialogDescription>Scan to open /{target?.shortCode}.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          {/* Scanners need a light background, so this stays white in dark mode. */}
          <div ref={wrapperRef} className="rounded-lg bg-white p-4 ring-1 ring-border">
            {target ? (
              <QRCodeCanvas
                value={target.shortUrl}
                size={200}
                marginSize={1}
                level="M"
                bgColor="#ffffff"
                fgColor="#18181b"
              />
            ) : null}
          </div>
          <p className="max-w-full truncate font-mono text-xs text-muted-foreground">
            {target?.shortUrl}
          </p>
        </div>

        <DialogFooter>
          <CopyButton value={target?.shortUrl ?? ""} label="Copy URL" />
          <Button onClick={download}>
            <Download /> Download PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
