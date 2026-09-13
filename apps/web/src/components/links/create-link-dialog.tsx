import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { EXPIRY_PRESETS, computeExpiresAt, type ExpiryPreset } from "@/lib/format";
import { useCreateLink } from "@/lib/queries";
import type { LinkDTO } from "@/lib/types";

export function CreateLinkDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [destinationUrl, setDestinationUrl] = useState("");
  const [customAlias, setCustomAlias] = useState("");
  const [expiry, setExpiry] = useState<ExpiryPreset>("never");
  const [created, setCreated] = useState<LinkDTO | null>(null);
  const createLink = useCreateLink();

  // Reset only when the dialog transitions from closed to open.
  // Deliberately not dependent on `createLink` (its identity changes every
  // render, which would wipe the success panel mid-mutation).
  useEffect(() => {
    if (open) {
      setDestinationUrl("");
      setCustomAlias("");
      setExpiry("never");
      setCreated(null);
      createLink.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    createLink.mutate(
      {
        destinationUrl: destinationUrl.trim(),
        ...(customAlias.trim() ? { customAlias: customAlias.trim() } : {}),
        expiresAt: computeExpiresAt(expiry),
      },
      {
        onSuccess: (link) => {
          setCreated(link);
          toast.success("Short URL created");
        },
      },
    );
  }

  const errorMessage =
    createLink.error instanceof ApiError
      ? createLink.error.message
      : createLink.error
        ? "Something went wrong while creating the link."
        : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create short URL</DialogTitle>
          <DialogDescription>
            Shorten a long URL. Clicks are tracked automatically.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-4">
            <p className="text-sm font-medium">Short URL created</p>
            <div className="rounded-md border bg-muted/40 p-3">
              <a
                href={created.shortUrl}
                target="_blank"
                rel="noreferrer"
                className="block truncate font-mono text-sm text-primary hover:underline"
              >
                {created.shortUrl}
              </a>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                → {created.destinationUrl}
              </p>
            </div>
            <DialogFooter>
              <CopyButton value={created.shortUrl} label="Copy" />
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="destinationUrl">Destination</Label>
              <Input
                id="destinationUrl"
                name="destinationUrl"
                type="text"
                placeholder="https://example.com/my-long-url"
                value={destinationUrl}
                onChange={(event) => setDestinationUrl(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customAlias">Custom alias (optional)</Label>
              <Input
                id="customAlias"
                name="customAlias"
                type="text"
                placeholder="summer-sale"
                value={customAlias}
                onChange={(event) => setCustomAlias(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Letters, numbers, hyphens and underscores.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Expiration</Label>
              <Select value={expiry} onValueChange={(value) => setExpiry(value as ExpiryPreset)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Never" />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_PRESETS.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {errorMessage ? (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createLink.isPending}>
                {createLink.isPending ? "Creating…" : "Create link"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
