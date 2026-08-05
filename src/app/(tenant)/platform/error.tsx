"use client";

/**
 * Batas galat untuk seluruh permukaan `/platform`.
 *
 * ══ KENAPA HALAMAN INI PUNYA TARUHAN SENDIRI ═══════════════════════════════
 * Grup `(dashboard)` sudah punya `error.tsx` dengan alasan yang tertulis di
 * kepalanya: tanpa batas galat, satu halaman yang gagal render melompat ke
 * layar bawaan Next.js — polos, tanpa cangkang, tanpa jalan kembali selain
 * reload. Di sini akibatnya lebih buruk daripada di dasbor.
 *
 * `/platform` adalah PENDARATAN pasca-masuk setiap pelanggan, dan sebagian
 * pengunjungnya belum punya satu pun PT — itulah sebabnya ia hidup di grup
 * `(tenant)`. Layar galat bawaan Next.js tidak membawa sidebar, tidak membawa
 * bilah atas, dan karena itu tidak membawa tombol KELUAR maupun penanda "akun
 * siapa". Yang tersisa bagi orang yang baru mendaftar adalah halaman putih
 * tanpa satu pun kendali: persis "jalan buntu" yang dilarang MASTER.md
 * §Orientasi Perusahaan untuk layar tanpa chrome aplikasi.
 *
 * Karena berkas ini berada DI DALAM `platform/layout.tsx`, galatnya tertangkap
 * di dalam cangkang panel — menu, penanda akun, dan tombol keluar tetap ada.
 *
 * ⚠ Tombol keduanya menuju `/platform`, BUKAN `error.toHome` ("Ke Beranda")
 * yang dipakai dasbor: beranda adalah buku sebuah PT, dan menawarkannya kepada
 * pemilik yang belum punya PT berarti mengirimnya ke pantulan berikutnya.
 */
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    // Digest memetakan ke baris log produksi bila perlu ditelusuri.
    console.error("Platform route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive-soft">
          <AlertTriangle className="h-6 w-6 text-destructive-strong" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">{t("error.title")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("error.description")}
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            {t("error.code", { digest: error.digest })}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => reset()}>{t("error.retry")}</Button>
          <Button asChild variant="secondary">
            <Link href="/platform">{t("platform.title")}</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
