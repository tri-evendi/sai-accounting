"use client";

/**
 * Batas galat permukaan pemasaran (`/`, `/pricing`, `/status`). Tanpa
 * `<LocaleProvider>` di sini (#399), jadi kamus bahasa aktif dimuat dinamis —
 * hanya saat layar langka ini benar-benar tampil.
 */
import { useEffect } from "react";

import { translate } from "@sai/core/i18n/dictionary";
import { useLoadedDictionary } from "@sai/ui/loaded-dictionary";
import { StatusScreen } from "@sai/ui/status-screen";

export default function MarketingError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const { dictionary } = useLoadedDictionary();

  useEffect(() => {
    console.error("Marketing route error:", error);
  }, [error]);

  // Lebih baik sekejap kosong daripada sekejap memperlihatkan kunci kamus mentah.
  if (!dictionary) return null;
  return (
    <StatusScreen
      kind="error"
      title={translate(dictionary, "error.title")}
      description={translate(dictionary, "error.description")}
      detail={error.digest ? translate(dictionary, "error.code", { digest: error.digest }) : undefined}
      retry={{ label: translate(dictionary, "error.retry"), onRetry: unstable_retry }}
      home={{ label: translate(dictionary, "error.toLanding"), href: "/" }}
    />
  );
}
