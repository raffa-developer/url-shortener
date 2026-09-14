import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { formatCompactNumber, formatDayLabel, formatNumber } from "@/lib/format";

function ChartTooltip({
  active,
  payload,
  label,
}: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{formatDayLabel(String(label))}</p>
      <p className="mt-0.5 tabular-nums text-muted-foreground">
        {formatNumber(Number(payload[0]?.value ?? 0))} clicks
      </p>
    </div>
  );
}

export function ClicksChart({ data }: { data: { date: string; count: number }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="clicksFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value: string) => formatDayLabel(value)}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            allowDecimals={false}
            width={44}
            tickFormatter={(value: number) => formatCompactNumber(value)}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={(props) => <ChartTooltip {...props} />}
            cursor={{ stroke: "var(--border)" }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#clicksFill)"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0, fill: "var(--chart-1)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
