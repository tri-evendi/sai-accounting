import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  chartMinHeight?: number;
}

export function ChartCard({
  title,
  description,
  children,
  className,
  chartMinHeight = 280,
}: ChartCardProps) {
  return (
    <Card className={cn("flex flex-col overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-gray-900">{title}</CardTitle>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5 font-normal">{description}</p>
        )}
      </CardHeader>
      <CardContent className="flex-1 pt-0 pb-4">
        <div style={{ minHeight: chartMinHeight }}>{children}</div>
      </CardContent>
    </Card>
  );
}
