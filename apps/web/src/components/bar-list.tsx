import type { ReactNode } from "react";
import { percentage } from "@/lib/format";

export interface BarListItem {
  label: string;
  count: number;
  icon?: ReactNode;
}

export function BarList({
  items,
  emptyLabel = "No data yet",
}: {
  items: BarListItem[];
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const total = items.reduce((sum, item) => sum + item.count, 0);
  const max = Math.max(...items.map((item) => item.count), 1);

  return (
    <ol className="space-y-3">
      {items.map((item, index) => (
        <li key={item.label}>
          <div className="flex items-center gap-2.5 text-sm">
            <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground/60">
              {index + 1}
            </span>
            <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
              {item.icon ?? <span className="size-1.5 rounded-full bg-muted-foreground/30" />}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{item.count}</span>
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground/70">
              {percentage(item.count, total)}
            </span>
          </div>
          <div className="mt-1.5 ml-[26px] h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/80 transition-[width] duration-500"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
