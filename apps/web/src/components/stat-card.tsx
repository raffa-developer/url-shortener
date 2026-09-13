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
    <Card className="gap-0 py-4">
      <div className="flex flex-col gap-1 px-5">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </p>
        <p data-testid={testId} className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </Card>
  );
}
