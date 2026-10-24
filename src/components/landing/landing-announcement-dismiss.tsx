"use client";

/**
 * Tombol TUTUP bilah pengumuman — satu-satunya daun client di bilah itu.
 *
 * Menulis cookie berisi sidik pengumuman (dibaca server pada muatan
 * berikutnya, jadi bilahnya tidak dirender lagi) dan menyembunyikan bilahnya
 * seketika lewat atribut `hidden`. Keduanya dibungkus `try/catch`: cookie
 * yang diblokir peramban (mode privat, setelan situs) hanya berarti bilahnya
 * muncul lagi di muatan berikutnya — bukan galat, dan bukan tombol yang diam.
 *
 * Teksnya PROP dari komponen server (`LocaleProvider` tidak terpasang di akar
 * pemasaran, #399 — `useT()` di sini akan merender kuncinya sendiri).
 */
import { CloseOutlined } from "@ant-design/icons";
import type { CSSProperties } from "react";

import { Button } from "@sai/ui/button";
import { ANNOUNCEMENT_DISMISS_COOKIE } from "@sai/core/landing-settings";

/** 180 hari — cukup lama untuk "jangan tampilkan lagi", tidak selamanya. */
const UMUR_COOKIE_DETIK = 60 * 60 * 24 * 180;

/** Glif terang di atas isian merek, pola variabel per-elemen `WHATSAPP_FAB_STYLE`. */
const GAYA = {
  "--ant-btn-bg-color": "var(--ant-color-brand-solid)",
  "--ant-btn-bg-color-hover": "var(--ant-color-brand-solid-hover)",
  "--ant-btn-bg-color-active": "var(--ant-color-brand-solid-active)",
  "--ant-btn-text-color": "var(--ant-color-text-light-solid)",
  "--ant-btn-text-color-hover": "var(--ant-color-text-light-solid)",
  "--ant-btn-text-color-active": "var(--ant-color-text-light-solid)",
  "--ant-btn-border-color": "var(--ant-color-brand-solid)",
  "--ant-btn-border-color-hover": "var(--ant-color-text-light-solid)",
  "--ant-btn-border-color-active": "var(--ant-color-text-light-solid)",
  flexShrink: 0,
} as CSSProperties;

export function LandingAnnouncementDismiss({ fingerprint, label }: { fingerprint: string; label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      title={label}
      style={GAYA}
      onClick={(event) => {
        try {
          document.cookie = `${ANNOUNCEMENT_DISMISS_COOKIE}=${fingerprint}; path=/; max-age=${UMUR_COOKIE_DETIK}; samesite=lax`;
        } catch {
          /* Cookie diblokir: bilah tetap disembunyikan untuk muatan ini. */
        }
        try {
          event.currentTarget.closest("[data-landing-announcement]")?.setAttribute("hidden", "");
        } catch {
          /* DOM tak terduga — tidak ada yang perlu dipulihkan. */
        }
      }}
    >
      <CloseOutlined aria-hidden="true" />
    </Button>
  );
}
