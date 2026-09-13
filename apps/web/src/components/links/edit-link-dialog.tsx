import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
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
import { computeExpiresAt, type ExpiryPreset } from "@/lib/format";
import { useUpdateLink } from "@/lib/queries";
import type { LinkDTO, UpdateLinkInput } from "@/lib/types";

type ExpiryChoice = "keep" | ExpiryPreset;

const EXPIRY_OPTIONS: { value: ExpiryChoice; label: string }[] = [
  { value: "keep", label: "No change" },
  { value: "never", label: "Never" },
  { value: "1h", label: "1 hour from now" },
  { value: "1d", label: "1 day from now" },
  { value: "7d", label: "7 days from now" },
  { value: "30d", label: "30 days from now" },
];

export function EditLinkDialog({
  link,
  onOpenChange,
}: {
  link: LinkDTO | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [destinationUrl, setDestinationUrl] = useState("");
  const [expiry, setExpiry] = useState<ExpiryChoice>("keep");
  const updateLink = useUpdateLink();

  // Deliberately keyed on `link` only: the mutation object changes identity
  // every render and would reset the form mid-request.
  useEffect(() => {
    if (link) {
      setDestinationUrl(link.destinationUrl);
      setExpiry("keep");
      updateLink.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (!link) {
      return;
    }

    const input: UpdateLinkInput = {};
    const trimmed = destinationUrl.trim();
    if (trimmed && trimmed !== link.destinationUrl) {
      input.destinationUrl = trimmed;
    }
    if (expiry !== "keep") {
      input.expiresAt = computeExpiresAt(expiry);
    }

    if (Object.keys(input).length === 0) {
      toast("Nothing to update");
      return;
    }

    updateLink.mutate(
      { shortCode: link.shortCode, input },
      {
        onSuccess: () => {
          toast.success("Link updated");
          onOpenChange(false);
        },
      },
    );
  }

  const errorMessage =
    updateLink.error instanceof ApiError
      ? updateLink.error.message
      : updateLink.error
        ? "Could not update the link."
        : null;

  return (
    <Dialog open={link !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit link</DialogTitle>
          <DialogDescription>
            /{link?.shortCode} — the short code stays the same.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="editDestination">Destination</Label>
            <Input
              id="editDestination"
              name="destinationUrl"
              type="text"
              value={destinationUrl}
              onChange={(event) => setDestinationUrl(event.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Expiration</Label>
            <Select value={expiry} onValueChange={(value) => setExpiry(value as ExpiryChoice)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateLink.isPending}>
              {updateLink.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
