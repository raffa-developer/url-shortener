import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <Card className="gap-0 border-border/60 py-4 shadow-none">
      <div className="flex flex-col gap-1 px-4">
        <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </p>
        <p
          data-testid={testId}
          className="text-2xl font-semibold tracking-tight tabular-nums"
        >
          {value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </Card>
  );
}
