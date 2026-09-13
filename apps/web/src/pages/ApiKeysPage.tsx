import { useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, KeyRound, Loader2 } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/lib/queries";
import type { CreatedApiKey } from "@/lib/types";

export function ApiKeysPage() {
  const [name, setName] = useState("");
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);
  const apiKeys = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    createKey.mutate(name.trim(), {
      onSuccess: (result) => {
        setCreated(result);
        setName("");
      },
    });
  }

  const createError =
    createKey.error instanceof ApiError
      ? createKey.error.message
      : createKey.error
        ? "Could not create the key."
        : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="API keys"
        description="Authenticate programmatic requests with the X-API-Key header. Keys can call links and analytics endpoints, but cannot manage keys."
      />

      <Card className="gap-4 py-5">
        <div className="flex flex-col gap-1 px-5">
          <h2 className="text-sm font-medium">Create a key</h2>
          <p className="text-xs text-muted-foreground">
            The secret is shown once — copy it before closing this panel.
          </p>
        </div>

        <form
          className="flex flex-wrap items-end gap-3 px-5"
          onSubmit={handleSubmit}
        >
          <div className="w-64 space-y-1.5">
            <Label htmlFor="keyName">Key name</Label>
            <Input
              id="keyName"
              name="keyName"
              placeholder="CI deploy"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={createKey.isPending}>
            {createKey.isPending ? "Creating…" : "Create key"}
          </Button>
        </form>

        {createError ? (
          <div className="px-5">
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        {created ? (
          <div className="mx-5 rounded-md border border-primary/30 bg-primary/5 p-3.5">
            <p className="text-sm font-medium">Copy your key now — it will not be shown again.</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <code
                data-testid="api-key-secret"
                className="min-w-0 flex-1 truncate rounded bg-background px-2.5 py-1.5 font-mono text-xs"
              >
                {created.key}
              </code>
              <CopyButton value={created.key} label="Copy key" />
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-sm font-medium">Your keys</h2>
        </div>

        {apiKeys.isPending ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : apiKeys.isError ? (
          <div className="p-5">
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>Could not load your API keys.</AlertDescription>
            </Alert>
          </div>
        ) : apiKeys.data && apiKeys.data.data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.data.data.map((apiKey) => {
                const revoked = apiKey.revokedAt !== null;
                return (
                  <TableRow key={apiKey.id} className={revoked ? "opacity-60" : undefined}>
                    <TableCell className="font-medium">{apiKey.name}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {apiKey.prefix}…
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatRelative(apiKey.createdAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {apiKey.lastUsedAt ? formatRelative(apiKey.lastUsedAt) : "Never"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={revoked ? "muted" : "success"}>
                        {revoked ? "Revoked" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={revoked}
                        onClick={() => setPendingRevokeId(apiKey.id)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
            <div className="grid size-10 place-items-center rounded-lg border bg-muted/40">
              <KeyRound className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No API keys yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a key to call the API from scripts and CI.
              </p>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={pendingRevokeId !== null} onOpenChange={(open) => !open && setPendingRevokeId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke API key</DialogTitle>
            <DialogDescription>
              Requests using this key will fail immediately. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRevokeId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={revokeKey.isPending}
              onClick={() => {
                if (pendingRevokeId) {
                  revokeKey.mutate(pendingRevokeId, {
                    onSuccess: () => setPendingRevokeId(null),
                  });
                }
              }}
            >
              Revoke key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
