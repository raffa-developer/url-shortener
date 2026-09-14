import type { ReactNode } from "react";
import { Bot, Globe, Monitor, Smartphone, Tablet } from "lucide-react";
import { BarList, type BarListItem } from "@/components/bar-list";
import { Favicon } from "@/components/favicon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { countryFlag } from "@/lib/flags";
import type { AnalyticsResponse } from "@/lib/types";

function deviceIcon(device: string): ReactNode {
  switch (device) {
    case "mobile":
      return <Smartphone className="size-3.5" />;
    case "tablet":
      return <Tablet className="size-3.5" />;
    case "desktop":
      return <Monitor className="size-3.5" />;
    case "bot":
      return <Bot className="size-3.5" />;
    default:
      return <Globe className="size-3.5" />;
  }
}

export function InsightsCard({ data }: { data: AnalyticsResponse }) {
  const groups: { value: string; label: string; items: BarListItem[] }[] = [
    {
      value: "countries",
      label: "Countries",
      items: data.countries.map((row) => {
        const flag = countryFlag(row.country);
        return {
          label: row.country,
          count: row.count,
          icon: flag ? <span className="text-sm leading-none">{flag}</span> : undefined,
        };
      }),
    },
    {
      value: "devices",
      label: "Devices",
      items: data.devices.map((row) => ({
        label: row.device,
        count: row.count,
        icon: deviceIcon(row.device),
      })),
    },
    {
      value: "browsers",
      label: "Browsers",
      items: data.browsers.map((row) => ({ label: row.browser, count: row.count })),
    },
    {
      value: "referrers",
      label: "Referrers",
      items: data.referrers.map((row) => ({
        label: row.source,
        count: row.count,
        icon: <Favicon domain={row.source} />,
      })),
    },
  ];

  return (
    <Card className="gap-4 border-border/60 py-5 shadow-none">
      <CardHeader className="px-5 py-0">
        <CardTitle className="text-sm font-medium">Audience</CardTitle>
      </CardHeader>
      <CardContent className="px-5">
        <Tabs defaultValue="countries">
          <TabsList className="grid w-full grid-cols-4 sm:inline-flex sm:w-fit">
            {groups.map((group) => (
              <TabsTrigger key={group.value} value={group.value}>
                {group.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {groups.map((group) => (
            <TabsContent key={group.value} value={group.value} className="mt-4">
              <BarList items={group.items} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
