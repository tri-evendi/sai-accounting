import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: number | string;
  href?: string;
  valueClassName?: string;
}

export function StatCard({ title, value, href, valueClassName }: StatCardProps) {
  const content = (
    <Card className={cn(href && "hover:shadow-md transition-shadow cursor-pointer h-full")}>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-gray-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn("text-3xl font-bold text-gray-900 tabular-nums", valueClassName)}>
          {value}
        </p>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href} className="block h-full">{content}</Link>;
  }

  return content;
}
