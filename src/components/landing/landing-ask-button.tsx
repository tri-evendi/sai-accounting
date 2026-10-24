/**
 * TOMBOL AJAKAN UTAMA pendaratan — `/register`, atau tautan pemesanan demo.
 *
 * ══ KENAPA SATU KOMPONEN ═══════════════════════════════════════════════════
 * Saat pendaftaran mandiri DITUTUP, ajakan di pahlawan dan bilah atas berbunyi
 * "Jadwalkan demo" (`landingAsk`). Sejak konsol `/landing` bisa menyetel
 * TAUTAN PEMESANAN DEMO (Calendly, Google Calendar, …), tombol berbunyi itu
 * boleh langsung menuju ke sana alih-alih ke halaman kontak `/register`.
 * Keputusannya satu, jadi tempatnya satu: dua tombol yang masing-masing
 * memutuskan sendiri akan berbeda pada hari salah satunya disunting.
 *
 * Yang dialihkan HANYA ajakan yang berbunyi `landing.demoCta`. "Coba gratis"
 * (pendaftaran terbuka) dan "Minta penawaran" (kartu paket, penutup) tetap ke
 * `/register` — tautan pemesanan demo bukan jalan membuat akun atau meminta
 * harga.
 *
 * ══ BATAS PENJAGA PENEKANAN ════════════════════════════════════════════════
 * `tests/button-emphasis.test.ts` mengunci setiap primer pendaratan ke
 * `/register`. Cabang tautan demo di bawah adalah SATU-SATUNYA pengecualian
 * yang disebut penjaga itu (berkas ini, `href={demoBookingUrl}`): ia ajakan
 * yang SAMA — label yang sama, tempat yang sama — hanya tujuannya diganti
 * operator. Tidak pernah ada dua primer dengan dua tujuan di satu layar.
 *
 * Tautan keluar → `Button href` + tab baru + `rel="noopener noreferrer"`
 * (halaman pihak ketiga tidak mendapat `window.opener` maupun perujuk).
 * Tujuannya sudah lolos `parseDemoBookingUrl` (https saja) saat dibaca.
 */
import { Button, ButtonLink, type ButtonSize } from "@sai/ui/button";
import type { LandingAsk } from "@/lib/landing-ask";

export function LandingAskButton({
  ask,
  slot,
  demoBookingUrl,
  size,
  children,
}: {
  ask: LandingAsk;
  /** Ajakan yang dirender — hanya yang BISA berbunyi "Jadwalkan demo". */
  slot: "heroCta" | "navCta";
  demoBookingUrl: string | null;
  size?: ButtonSize;
  children: React.ReactNode;
}) {
  if (demoBookingUrl !== null && ask[slot] === "landing.demoCta") {
    return (
      <Button href={demoBookingUrl} target="_blank" rel="noopener noreferrer" size={size} variant="primary">
        {children}
      </Button>
    );
  }
  return (
    <ButtonLink href="/register" size={size} variant="primary">
      {children}
    </ButtonLink>
  );
}
