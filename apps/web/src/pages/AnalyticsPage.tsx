import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { BreakdownCard } from "@/components/analytics/breakdown-card";
import { ClicksChart } from "@/components/analytics/clicks-chart";
import { LinkPreviewCard } from "@/components/analytics/link-preview-card";
import { CopyButton } from "@/components/copy-button";
import { StatCard } from "@/components/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import { useAnalytics } from "@/lib/queries";

const RANGES = [7, 30, 90];

export function AnalyticsPage() {
  const { shortCode = "" } = useParams();
  const [days, setDays] = useState(30);
  const analytics = useAnalytics(shortCode, days);

  if (analytics.isPending) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (analytics.isError || !analytics.data) {
    const message =
      analytics.error instanceof ApiError
        ? analytics.error.message
        : "Could not load analytics for this link.";
    return (
      <div className="space-y-4">
        <BackLink />
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const data = analytics.data;

  return (
    <div className="space-y-6">
      <div>
        <BackLink />
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-mono text-xl font-semibold tracking-tight">
              /{data.link.shortCode}
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {data.link.destinationUrl}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void analytics.refetch()}
              disabled={analytics.isFetching}
              aria-label="Refresh analytics"
            >
              <RefreshCw className={cn(analytics.isFetching && "animate-spin")} />
              Refresh
            </Button>
            <CopyButton value={data.link.shortUrl} label="Copy short URL" />
          </div>
        </div>
      </div>

      <LinkPreviewCard
        shortCode={data.link.shortCode}
        destinationUrl={data.link.destinationUrl}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total clicks"
          value={formatNumber(data.totalClicks)}
          testId="total-clicks"
        />
        <StatCard
          label="Today"
          value={formatNumber(data.today)}
          hint={formatDate(data.range.to)}
        />
        <StatCard label="Yesterday" value={formatNumber(data.yesterday)} />
      </div>

      <Card className="gap-4 py-5">
        <CardHeader className="flex-row items-center justify-between space-y-0 px-5 py-0">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium">Clicks over time</CardTitle>
            <p className="text-xs text-muted-foreground">
              Last {data.range.days} days · UTC
            </p>
          </div>
          <div className="flex rounded-md bg-muted p-0.5">
            {RANGES.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setDays(range)}
                className={cn(
                  "rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors",
                  days === range
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {range}d
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-5">
          <ClicksChart data={data.clicksPerDay} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <BreakdownCard
          title="Countries"
          items={data.countries.map((row) => ({ label: row.country, count: row.count }))}
        />
        <BreakdownCard
          title="Devices"
          items={data.devices.map((row) => ({ label: row.device, count: row.count }))}
        />
        <BreakdownCard
          title="Browsers"
          items={data.browsers.map((row) => ({ label: row.browser, count: row.count }))}
        />
        <BreakdownCard
          title="Referrers"
          items={data.referrers.map((row) => ({ label: row.source, count: row.count }))}
        />
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Back to links
    </Link>
  );
}
