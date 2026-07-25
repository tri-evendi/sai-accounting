"use client";

/**
 * Batas galat tingkat-rute untuk seluruh dashboard.
 *
 * Sebelum ini tak ada `error.tsx` sama sekali: satu halaman yang gagal render
 * (mis. `/receivables` saat ada dokumen ber-currency tak sah) melompat ke
 * layar galat bawaan Next.js — polos, tanpa sidebar, tanpa jalan kembali selain
 * reload. Karena file ini berada di dalam `(dashboard)/layout.tsx`, galat kini
 * tertangkap DI DALAM cangkang: sidebar & navbar tetap ada, pengguna dapat
 * mencoba lagi (`reset()`) atau pindah halaman tanpa kehilangan konteks.
 */
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Ter-log di server (dev console / pm2). Digest memetakan ke baris log
    // produksi bila perlu ditelusuri.
    console.error("Dashboard route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive-soft">
          <AlertTriangle className="h-6 w-6 text-destructive-strong" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Halaman ini gagal dimuat</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Terjadi kesalahan saat menyiapkan halaman. Coba muat ulang; bila terus berulang,
          catat kode di bawah dan hubungi admin.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">Kode: {error.digest}</p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={() => reset()}>Coba lagi</Button>
          <Link href="/dashboard">
            <Button variant="secondary">Ke Beranda</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
