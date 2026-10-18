"use client";

/**
 * Isi `global-error.tsx` untuk KEDUA aplikasi — layar yang tampil ketika ROOT
 * LAYOUT sendiri yang gagal dirender.
 *
 * Next menggantikan seluruh root layout dengan berkas ini, jadi ia menulis
 * `<html>`/`<body>`-nya sendiri dan tidak punya provider apa pun: tidak ada
 * `RootDocument`, `ThemeProvider`, `AntdProvider`, atau `LocaleProvider`. Itu
 * disengaja dan dipertahankan — yang barusan meledak bisa jadi salah satunya,
 * dan layar galat yang bergantung pada bagian yang rusak tidak pernah tampil.
 * `StatusScreen` memakai token AntD bawaan tanpa provider; teksnya dari kamus
 * bahasa aktif yang dimuat dinamis (`useLoadedDictionary`).
 */
import { useEffect } from "react";
import { theme } from "antd";

import { translate } from "@sai/core/i18n/dictionary";

import { useLoadedDictionary } from "./loaded-dictionary";
import { StatusScreen } from "./status-screen";

export function GlobalErrorDocument({
  error,
  onRetry,
  homeHref,
  label,
}: {
  error: Error & { digest?: string };
  onRetry: () => void;
  homeHref: string;
  /** Penanda di log server — aplikasi mana yang root layout-nya gagal. */
  label: string;
}) {
  const { locale, dictionary } = useLoadedDictionary();
  const token = theme.getDesignToken();

  useEffect(() => {
    console.error(`[${label}] root layout error:`, error);
  }, [error, label]);

  return (
    <html lang={locale}>
      <body style={{ margin: 0, background: token.colorBgLayout, fontFamily: token.fontFamily }}>
        {/* Sebelum kamus termuat tidak ada yang dirender — lebih baik sekejap
            kosong daripada sekejap memperlihatkan kunci kamus mentah. */}
        {dictionary && (
          <StatusScreen
            kind="error"
            minHeight="100vh"
            title={translate(dictionary, "error.title")}
            description={translate(dictionary, "error.description")}
            detail={error.digest ? translate(dictionary, "error.code", { digest: error.digest }) : undefined}
            retry={{ label: translate(dictionary, "error.retry"), onRetry }}
            home={{ label: translate(dictionary, "error.toHome"), href: homeHref }}
          />
        )}
      </body>
    </html>
  );
}
