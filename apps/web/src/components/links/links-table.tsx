import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DeleteLinkDialog } from "@/components/links/delete-link-dialog";
import { EditLinkDialog } from "@/components/links/edit-link-dialog";
import { ExpiryBadge } from "@/components/expiry-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { copyText } from "@/lib/clipboard";
import { formatNumber, formatRelative } from "@/lib/format";
import type { LinkDTO } from "@/lib/types";

export function LinksTable({ links }: { links: LinkDTO[] }) {
  const navigate = useNavigate();
  const [editTarget, setEditTarget] = useState<LinkDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LinkDTO | null>(null);

  async function handleCopy(link: LinkDTO): Promise<void> {
    await copyText(link.shortUrl);
    toast.success("Copied to clipboard");
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Short URL</TableHead>
            <TableHead>Destination</TableHead>
            <TableHead className="text-right">Clicks</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {links.map((link) => (
            <TableRow
              key={link.id}
              className="cursor-pointer"
              onClick={() => navigate(`/links/${link.shortCode}`)}
            >
              <TableCell>
                <span className="font-mono text-sm text-primary">/{link.shortCode}</span>
              </TableCell>
              <TableCell>
                <span className="block max-w-[260px] truncate text-muted-foreground">
                  {link.destinationUrl}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(link.clickCount)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatRelative(link.createdAt)}
              </TableCell>
              <TableCell>
                <ExpiryBadge expiresAt={link.expiresAt} />
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Open menu"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <DropdownMenuItem onClick={() => void handleCopy(link)}>
                      <Copy /> Copy short URL
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditTarget(link)}>
                      <Pencil /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeleteTarget(link)}
                    >
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <EditLinkDialog
        link={editTarget}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
          }
        }}
      />
      <DeleteLinkDialog
        link={deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      />
    </>
  );
}
