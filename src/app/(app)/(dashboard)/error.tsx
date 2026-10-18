"use client";

/**
 * Batas galat tingkat-rute untuk seluruh dashboard.
 *
 * Sebelum ini tak ada `error.tsx` sama sekali: satu halaman yang gagal render
 * (mis. `/receivables` saat ada dokumen ber-currency tak sah) melompat ke
 * layar galat bawaan Next.js — polos, tanpa sidebar, tanpa jalan kembali selain
 * reload. Karena file ini berada di dalam `(dashboard)/layout.tsx`, galat kini
 * tertangkap DI DALAM cangkang: sidebar & navbar tetap ada, pengguna dapat
 * mencoba lagi atau pindah halaman tanpa kehilangan konteks.
 *
 * ── Tanpa satu kelas Tailwind pun (PR penutup #201/#240) ───────────────────
 * Kembarannya `(tenant)/(panel)/platform/error.tsx` sudah dikonversi di #200; berkas
 * ini tertinggal karena ia bukan halaman dan bukan komponen, jadi tak masuk
 * lingkup issue mana pun. Susunannya kini dibuat SAMA dengan kembarannya itu —
 * dua layar galat yang berbeda jarak dan berbeda warna lingkaran ikonnya adalah
 * cacat yang hanya terlihat kalau seseorang kebetulan memicu keduanya.
 *
 * Sejak 18 Okt 2026 tata letaknya `StatusScreen` (`@sai/ui`) — satu primitif
 * untuk setiap layar galat & 404 di kedua aplikasi — dan "Coba lagi" memanggil
 * `unstable_retry()`, bukan `reset()`: `reset()` hanya merender ulang TANPA
 * mengambil ulang data, jadi galat dari server component (yang paling umum di
 * sini) tidak pernah pulih lewat tombol itu.
 */
import { useEffect } from "react";

import { useT } from "@sai/core/i18n/client";
import { StatusScreen } from "@sai/ui/status-screen";

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useT();

  useEffect(() => {
    // Ter-log di server; digest memetakan ke baris log produksi bila perlu ditelusuri.
    console.error("Dashboard route error:", error);
  }, [error]);

  return (
    <StatusScreen
      kind="error"
      title={t("error.title")}
      description={t("error.description")}
      detail={error.digest ? t("error.code", { digest: error.digest }) : undefined}
      retry={{ label: t("error.retry"), onRetry: unstable_retry }}
      home={{ label: t("error.toHome"), href: "/dashboard" }}
    />
  );
}
