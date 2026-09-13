import { BarList, type BarListItem } from "@/components/bar-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function BreakdownCard({
  title,
  items,
}: {
  title: string;
  items: BarListItem[];
}) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5 py-0">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-5">
        <BarList items={items} />
      </CardContent>
    </Card>
  );
}
