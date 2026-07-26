"use client";

/**
 * Indikator muat. Sejak fondasi i18n berkas ini komponen CLIENT: pesan bawaan
 * `PageLoader` mengikuti bahasa aktif, dan itu butuh konteks kamus. Ia tetap
 * boleh dirender dari server component (mis. `app/(dashboard)/loading.tsx`) —
 * hanya jadi batas client kecil tanpa state.
 */

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-5 w-5 animate-spin text-primary", className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function PageLoader({ message }: { message?: string }) {
  const t = useT();

  return (
    // Berpusat vertikal di ruang yang tersedia (bukan menempel di atas). 60vh
    // aman untuk dua konteksnya: layar penuh saat sesi dimuat, dan di dalam area
    // konten pada form/halaman yang menunggu data — tanpa memicu gulir.
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Spinner className="h-8 w-8" />
      <p className="text-sm text-muted-foreground">{message ?? t("common.loading")}</p>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex gap-4 border-b border-border px-6 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-4 bg-muted rounded flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-border px-6 py-4">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-3 bg-muted rounded flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
