"use client";

/**
 * Batas galat konsol — di DALAM cangkang `(operator)/layout.tsx`, jadi menu,
 * penanda operator, dan tombol keluar tetap ada saat satu halaman gagal.
 * Doktrin #137: platform yang tak terjangkau dibaca store sebagai `null`, jadi
 * yang sampai ke sini adalah galat sungguhan, bukan "penagihan sedang mati".
 */
import { useEffect } from "react";

import { useT } from "@sai/core/i18n/client";
import { StatusScreen } from "@sai/ui/status-screen";

export default function OperatorError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useT();

  useEffect(() => {
    console.error("Operator route error:", error);
  }, [error]);

  return (
    <StatusScreen
      kind="error"
      title={t("error.title")}
      description={t("error.description")}
      detail={error.digest ? t("error.code", { digest: error.digest }) : undefined}
      retry={{ label: t("error.retry"), onRetry: unstable_retry }}
      home={{ label: t("error.toHome"), href: "/" }}
    />
  );
}
