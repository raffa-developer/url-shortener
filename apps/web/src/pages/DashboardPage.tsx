import { useEffect, useState } from "react";
import { AlertCircle, Link2, Plus, Search, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useLinks, useResendVerification } from "@/lib/queries";
import type { LinkSort, LinkStatusFilter } from "@/lib/types";

const PAGE_SIZE = 10;

const STATUS_TABS: { value: LinkStatusFilter; label: string; title: string }[] = [
  { value: "all", label: "All", title: "Every link" },
  { value: "active", label: "Active", title: "Not expired" },
  { value: "expiring", label: "Expiring", title: "Expires within 7 days" },
  { value: "expired", label: "Expired", title: "Already expired" },
];

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

  useEffect(() => {
    const openCreate = () => setCreateOpen(true);
    window.addEventListener("open-create-link", openCreate);
    return () => window.removeEventListener("open-create-link", openCreate);
  }, []);

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
        title="Links"
        description="Create short links and open one to explore its analytics."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Create URL
          </Button>
        }
      />

      <CreateLinkDialog open={createOpen} onOpenChange={setCreateOpen} />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card p-1.5">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search alias or destination"
            aria-label="Search links"
            className="h-8 border-transparent bg-transparent pl-8 shadow-none focus-visible:ring-1"
          />
        </div>

        <div className="flex items-center rounded-lg bg-muted p-0.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              title={tab.title}
              onClick={() => setStatus(tab.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                status === tab.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Select value={sort} onValueChange={(value) => setSort(value as LinkSort)}>
          <SelectTrigger
            size="sm"
            className="w-36 border-transparent bg-transparent shadow-none"
            aria-label="Sort links"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="clicks">Most clicks</SelectItem>
            <SelectItem value="expires">Expiring first</SelectItem>
          </SelectContent>
        </Select>

        <span className="px-2 text-xs text-muted-foreground tabular-nums">
          {total} {total === 1 ? "link" : "links"}
        </span>
      </div>

      <Card className="gap-0 overflow-hidden border-border/60 py-0 shadow-none">
        {links.isPending ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 6 }).map((_, index) => (
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
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-2.5">
            <p className="text-xs text-muted-foreground tabular-nums">
              {rangeStart}–{rangeEnd} of {total}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
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
