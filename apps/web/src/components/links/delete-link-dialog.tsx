import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteLink } from "@/lib/queries";
import type { LinkDTO } from "@/lib/types";

export function DeleteLinkDialog({
  link,
  onOpenChange,
}: {
  link: LinkDTO | null;
  onOpenChange: (open: boolean) => void;
}) {
  const deleteLink = useDeleteLink();

  return (
    <Dialog open={link !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete link</DialogTitle>
          <DialogDescription>
            /{link?.shortCode} will stop redirecting and its{" "}
            {link?.clickCount === 1 ? "1 click" : `${link?.clickCount ?? 0} clicks`} will be
            permanently deleted. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteLink.isPending}
            onClick={() => {
              if (!link) {
                return;
              }
              deleteLink.mutate(link.shortCode, {
                onSuccess: () => {
                  toast.success("Link deleted");
                  onOpenChange(false);
                },
              });
            }}
          >
            {deleteLink.isPending ? "Deleting…" : "Delete link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
