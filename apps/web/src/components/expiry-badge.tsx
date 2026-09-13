import { Badge } from "@/components/ui/badge";
import { formatExpiry, getExpiryStatus, type ExpiryStatus } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Urgency is expressed with the theme's destructive token (solid when already
 * expired, outline when close), everything else stays neutral so the badge
 * never competes with the primary accent.
 */
const EXPIRY_VARIANT: Record<
  ExpiryStatus,
  "destructive" | "destructiveSubtle" | "outline" | "muted"
> = {
  expired: "destructive",
  soon: "destructiveSubtle",
  upcoming: "outline",
  far: "muted",
  never: "muted",
};

export function ExpiryBadge({
  expiresAt,
  className,
}: {
  expiresAt: string | null;
  className?: string;
}) {
  return (
    <Badge
      variant={EXPIRY_VARIANT[getExpiryStatus(expiresAt)]}
      className={cn("font-normal", className)}
      title={
        expiresAt
          ? new Date(expiresAt).toLocaleString()
          : "This link does not expire"
      }
    >
      {formatExpiry(expiresAt)}
    </Badge>
  );
}
