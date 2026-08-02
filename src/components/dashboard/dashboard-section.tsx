import { Link } from "@/components/ui/app-link";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

interface DashboardSectionProps {
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export async function DashboardSection({
  title,
  description,
  href,
  hrefLabel,
  actions,
  children,
  className,
}: DashboardSectionProps) {
  const t = await getT();
  const linkLabel = hrefLabel ?? t("dashboard.seeAll");
  return (
    <section className={cn("space-y-5", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {href && (
            <Link
              href={href}
              className="cursor-pointer text-sm font-medium text-primary transition-colors duration-150 hover:text-primary hover:underline"
            >
              {linkLabel} →
            </Link>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
