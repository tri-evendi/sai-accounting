"use client";

/**
 * Galat di ROOT LAYOUT konsol. Isinya `GlobalErrorDocument` — tanpa provider,
 * dengan `<html>` sendiri (lihat kepala berkas itu).
 */
import { GlobalErrorDocument } from "@sai/ui/global-error-document";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <GlobalErrorDocument error={error} onRetry={unstable_retry} homeHref="/" label="operator" />;
}
