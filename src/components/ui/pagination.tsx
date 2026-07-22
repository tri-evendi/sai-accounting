import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
}

function buildUrl(basePath: string, page: number, searchParams?: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== "page") params.set(key, value);
    }
  }
  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

export function Pagination({ currentPage, totalPages, basePath, searchParams }: PaginationProps) {
  if (totalPages <= 1) return null;

  // Show max 5 page numbers
  let startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  const pages = [];
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-between border-t border-border px-6 py-3">
      <p className="text-sm text-muted-foreground">
        Halaman {currentPage} dari {totalPages}
      </p>
      <nav className="flex items-center gap-1" aria-label="Navigasi halaman">
        {/* Previous */}
        {currentPage > 1 ? (
          <Link
            href={buildUrl(basePath, currentPage - 1, searchParams)}
            className="inline-flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
        ) : (
          <span className="inline-flex items-center rounded-md px-2 py-1.5 text-sm text-muted-foreground/40">
            <ChevronLeft className="h-4 w-4" />
          </span>
        )}

        {/* Page numbers */}
        {startPage > 1 && (
          <>
            <Link href={buildUrl(basePath, 1, searchParams)} className="inline-flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
              1
            </Link>
            {startPage > 2 && <span className="px-1 text-muted-foreground">...</span>}
          </>
        )}

        {pages.map((page) => (
          <Link
            key={page}
            href={buildUrl(basePath, page, searchParams)}
            className={cn(
              "inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium",
              page === currentPage
                ? "bg-primary text-primary-foreground"
                : "cursor-pointer text-muted-foreground hover:bg-muted"
            )}
          >
            {page}
          </Link>
        ))}

        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="px-1 text-muted-foreground">...</span>}
            <Link href={buildUrl(basePath, totalPages, searchParams)} className="inline-flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
              {totalPages}
            </Link>
          </>
        )}

        {/* Next */}
        {currentPage < totalPages ? (
          <Link
            href={buildUrl(basePath, currentPage + 1, searchParams)}
            className="inline-flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className="inline-flex items-center rounded-md px-2 py-1.5 text-sm text-muted-foreground/40">
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </nav>
    </div>
  );
}
