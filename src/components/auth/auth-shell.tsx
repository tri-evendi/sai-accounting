import { AlertCircle, MapPin } from "lucide-react";
import { APP_NAME, COMPANY_ADDRESS, COMPANY_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  children: React.ReactNode;
  heading: string;
  description?: string;
  error?: string;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
}

function BrandPanel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative flex flex-col justify-between overflow-hidden bg-foreground px-8 py-10 text-white",
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(37,99,235,0.18),_transparent_55%)]"
        aria-hidden
      />
      <div className="relative">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold tracking-tight shadow-lg shadow-primary/30">
          SAI
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{APP_NAME}</h1>
        <p className="mt-2 text-sm font-medium text-white/80">{COMPANY_NAME}</p>
        <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">
          Contract &amp; inventory management for internal teams.
        </p>
      </div>
      <div className="relative flex items-start gap-2 text-sm text-white/70">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/70" aria-hidden />
        <p>{COMPANY_ADDRESS}</p>
      </div>
    </div>
  );
}

export function AuthShell({
  children,
  heading,
  description,
  error,
  icon,
  footer,
}: AuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-muted lg:flex-row">
      <BrandPanel className="hidden lg:flex lg:w-[30%] lg:min-w-[280px] lg:max-w-sm lg:shrink-0" />

      <div className="flex flex-1 flex-col">
        <div className="border-b border-border bg-foreground px-6 py-5 lg:hidden">
          <p className="text-lg font-bold text-white">{APP_NAME}</p>
          <p className="text-sm text-white/70">{COMPANY_NAME}</p>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-12">
          <div className="w-full max-w-md">
            <div className="rounded-xl border border-border bg-white p-8 shadow-sm">
              <div className="mb-8">
                {icon && (
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-ring">
                    {icon}
                  </div>
                )}
                <h2 className="text-xl font-semibold text-foreground">{heading}</h2>
                {description && (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="mb-6 flex gap-3 rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive-strong"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                  <p>{error}</p>
                </div>
              )}

              {children}

              {footer && <div className="mt-6 border-t border-border pt-5">{footer}</div>}
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} {COMPANY_NAME}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
