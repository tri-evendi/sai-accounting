import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="text-muted-foreground mb-4">
        {icon || <Package className="h-12 w-12" />}
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {actionLabel && actionHref && (
        <Link href={actionHref} className="mt-4">
          <Button size="sm">{actionLabel}</Button>
        </Link>
      )}
    </div>
  );
}
