import { useNavigate } from "react-router-dom";
import { CopyButton } from "@/components/copy-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatExpiry, formatNumber, formatRelative } from "@/lib/format";
import type { LinkDTO } from "@/lib/types";

export function LinksTable({ links }: { links: LinkDTO[] }) {
  const navigate = useNavigate();

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Short URL</TableHead>
          <TableHead>Destination</TableHead>
          <TableHead className="text-right">Clicks</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead className="w-10">
            <span className="sr-only">Copy</span>
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
            <TableCell className="text-muted-foreground">
              {formatExpiry(link.expiresAt)}
            </TableCell>
            <TableCell className="text-right">
              <div
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <CopyButton value={link.shortUrl} className="size-7" />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
