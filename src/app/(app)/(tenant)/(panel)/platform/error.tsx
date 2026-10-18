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
 * ⚠ DUA JALAN KELUAR, dan keduanya harus tetap ada setelah konversi AntD
 * (#200): "Coba lagi" dan tautan kembali ke `/platform`. Tombol
 * keduanya menuju `/platform`, BUKAN `error.toHome` ("Ke Beranda") yang dipakai
 * dasbor: beranda adalah buku sebuah PT, dan menawarkannya kepada pemilik yang
 * belum punya PT berarti mengirimnya ke pantulan berikutnya.
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

export default function PlatformError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useT();

  useEffect(() => {
    // Ter-log di server; digest memetakan ke baris log produksi bila perlu ditelusuri.
    console.error("Platform route error:", error);
  }, [error]);

  return (
    <StatusScreen
      kind="error"
      title={t("error.title")}
      description={t("error.description")}
      detail={error.digest ? t("error.code", { digest: error.digest }) : undefined}
      retry={{ label: t("error.retry"), onRetry: unstable_retry }}
      home={{ label: t("platform.title"), href: "/platform" }}
    />
  );
}
