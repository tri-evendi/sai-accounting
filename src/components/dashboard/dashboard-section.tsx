import Link from "next/link";
import { cn } from "@/lib/utils";

interface DashboardSectionProps {
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function DashboardSection({
  title,
  description,
  href,
  hrefLabel = "Lihat semua",
  actions,
  children,
  className,
}: DashboardSectionProps) {
  return (
    <section className={cn("space-y-5", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {description && (
            <p className="text-sm text-gray-500 mt-0.5">{description}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {href && (
            <Link
              href={href}
              className="cursor-pointer text-sm font-medium text-blue-600 transition-colors duration-150 hover:text-blue-800 hover:underline"
            >
              {hrefLabel} →
            </Link>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
