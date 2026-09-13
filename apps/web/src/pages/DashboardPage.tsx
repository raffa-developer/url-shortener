import { useEffect, useState } from "react";
import { AlertCircle, Link2, MailWarning, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { CreateLinkDialog } from "@/components/links/create-link-dialog";
import { LinksTable } from "@/components/links/links-table";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAuth } from "@/lib/auth-store";
import { useLinks, useResendVerification } from "@/lib/queries";
import type { LinkSort, LinkStatusFilter } from "@/lib/types";

const PAGE_SIZE = 10;

export function DashboardPage() {
  const { user } = useAuth();
  const resendVerification = useResendVerification();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LinkStatusFilter>("all");
  const [sort, setSort] = useState<LinkSort>("newest");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, sort]);

  const links = useLinks({
    page,
    pageSize: PAGE_SIZE,
    q: debouncedSearch.trim() || undefined,
    status,
    sort,
  });

  const isFiltered = debouncedSearch.trim() !== "" || status !== "all";
  const total = links.data?.total ?? 0;
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  function clearFilters(): void {
    setSearch("");
    setStatus("all");
    setSort("newest");
  }

  function handleResendVerification(): void {
    resendVerification.mutate(undefined, {
      onSuccess: () => toast.success("Verification email sent"),
    });
  }

  return (
    <div className="space-y-6">
      {user && user.emailVerifiedAt === null ? (
        <Alert className="border-primary/30 bg-primary/5">
          <MailWarning />
          <AlertTitle>Verify your email address</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap items-center gap-3">
              <span>We sent a confirmation link to {user.email}.</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResendVerification}
                disabled={resendVerification.isPending}
              >
                {resendVerification.isPending ? "Sending…" : "Resend email"}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <PageHeader
        title="My Links"
        description="Create short links and click a row to explore its analytics."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Create URL
          </Button>
        }
      />

      <CreateLinkDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-col gap-3 border-b px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">Links</h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {links.data ? `${total} total` : ""}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search alias or destination"
                aria-label="Search links"
                className="h-8 w-56 pl-8 text-sm"
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as LinkStatusFilter)}
            >
              <SelectTrigger size="sm" className="w-38" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expiring">Expiring in 7 days</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(value) => setSort(value as LinkSort)}>
              <SelectTrigger size="sm" className="w-40" aria-label="Sort links">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="clicks">Most clicks</SelectItem>
                <SelectItem value="expires">Expiring first</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {links.isPending ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : links.isError ? (
          <div className="p-5">
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>Could not load your links. Try again.</AlertDescription>
            </Alert>
          </div>
        ) : links.data && links.data.data.length > 0 ? (
          <LinksTable links={links.data.data} />
        ) : isFiltered ? (
          <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
            <p className="text-sm font-medium">No links match your filters</p>
            <p className="text-sm text-muted-foreground">
              Try a different search term or status.
            </p>
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <X />
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
            <div className="grid size-10 place-items-center rounded-lg border bg-muted/40">
              <Link2 className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No links yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your first short link and start tracking clicks.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus />
              Create URL
            </Button>
          </div>
        )}

        {total > 0 ? (
          <div className="flex items-center justify-between border-t px-5 py-3">
            <p className="text-xs text-muted-foreground tabular-nums">
              Showing {rangeStart}–{rangeEnd} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={rangeEnd >= total}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
