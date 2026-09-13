import { useState } from "react";
import { AlertCircle, Link2, Plus } from "lucide-react";
import { CreateLinkDialog } from "@/components/links/create-link-dialog";
import { LinksTable } from "@/components/links/links-table";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLinks } from "@/lib/queries";

export function DashboardPage() {
  const links = useLinks();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
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
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-sm font-medium">Links</h2>
          {links.data ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {links.data.data.length} total
            </span>
          ) : null}
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
      </Card>
    </div>
  );
}
