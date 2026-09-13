import { useState } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLinkPreview } from "@/lib/queries";

export function LinkPreviewCard({
  shortCode,
  destinationUrl,
}: {
  shortCode: string;
  destinationUrl: string;
}) {
  const preview = useLinkPreview(shortCode);
  const [imageFailed, setImageFailed] = useState(false);

  let domain = destinationUrl;
  try {
    domain = new URL(destinationUrl).hostname.replace(/^www\./, "");
  } catch {
    // Keep the raw destination when it cannot be parsed.
  }

  const data = preview.data;
  const showImage = Boolean(data?.image) && !imageFailed;

  return (
    <Card className="gap-0 overflow-hidden py-0">
      {preview.isPending ? (
        <div className="flex flex-col gap-4 p-4 sm:flex-row">
          <Skeleton className="h-28 w-full shrink-0 rounded-md sm:w-44" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4 sm:flex-row">
          {showImage && data?.image ? (
            <img
              src={data.image}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
              className="h-28 w-full shrink-0 rounded-md border bg-muted object-cover sm:w-44"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Globe className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-xs text-muted-foreground">
                {data?.siteName ?? domain}
              </span>
              {data?.title ? (
                <Badge variant="muted" className="ml-auto">
                  Preview
                </Badge>
              ) : null}
            </div>
            <p className="mt-1.5 truncate text-sm font-medium">
              {data?.title ?? "Preview unavailable"}
            </p>
            {data?.description ? (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {data.description}
              </p>
            ) : (
              <p className="mt-1 truncate text-sm text-muted-foreground">{destinationUrl}</p>
            )}
            <div className="mt-3">
              <Button variant="outline" size="sm" asChild>
                <a href={destinationUrl} target="_blank" rel="noreferrer">
                  <ExternalLink /> Open destination
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
