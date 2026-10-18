"use client";

/**
 * Batas galat untuk SELURUH root layout `(app)` — yang belum dijangkau batas
 * yang lebih dekat: `(auth)` (masuk, daftar, lupa sandi, undangan), `(docs)`,
 * `(setup)`. Dasbor dan `/platform` punya batasnya sendiri, di dalam
 * cangkangnya masing-masing, dan batas yang lebih dekat selalu menang.
 *
 * Sebelum berkas ini, halaman masuk yang gagal render melompat ke layar galat
 * bawaan Next — polos, berbahasa Inggris, tanpa jalan kembali. `(app)/layout`
 * sendiri tidak dibungkus berkas ini (Next tidak membungkus layout di segmen
 * yang sama); itu tugas `app/global-error.tsx`.
 */
import { useEffect } from "react";

import { useT } from "@sai/core/i18n/client";
import { StatusScreen } from "@sai/ui/status-screen";

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useT();

  useEffect(() => {
    console.error("App route error:", error);
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
