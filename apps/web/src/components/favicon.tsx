import { useState } from "react";
import { Globe } from "lucide-react";
import { faviconUrl } from "@/lib/favicon";
import { cn } from "@/lib/utils";

export function Favicon({
  domain,
  className,
}: {
  domain: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = faviconUrl(domain);

  if (!url || failed) {
    return <Globe className={cn("size-3.5 text-muted-foreground", className)} />;
  }

  return (
    <img
      src={url}
      alt=""
      width={14}
      height={14}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("size-3.5 rounded-[3px]", className)}
    />
  );
}
