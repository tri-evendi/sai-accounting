/**
 * Tombol WhatsApp MELAYANG — jalan cepat bertanya, kanan-bawah (#402).
 *
 * ══ KENAPA ADA ═════════════════════════════════════════════════════════════
 * Lima dari enam situs akuntansi Indonesia yang ditinjau memasang tombol
 * WhatsApp yang selalu terlihat; halaman ini hanya punya kanal WhatsApp di
 * seksi kontak, empat layar ke bawah. Tombol ini bidang pekat 48px yang ikut
 * menggulung — dan ia BUKAN pita: `landing.md` §"Satu pita pekat" tetap
 * berlaku, sebab yang dijaga aturan itu adalah bidang navy SELEBAR LAYAR
 * yang memikul ajakan; ini bulatan 48px yang memikul satu ikon.
 *
 * ══ HANYA DIRENDER BILA NOMORNYA SAH ═══════════════════════════════════════
 * Sumbernya `contactChannels()` (`lib/contact-channels.ts`) — sakelar yang
 * SAMA dengan kanal di seksi kontak, jadi tidak ada `process.env` kedua yang
 * bisa menyimpang: `PLATFORM_CONTACT_WHATSAPP` kosong atau salah bentuk berarti
 * `null`, bukan tombol yang membuka WhatsApp lalu berkata "nomor tidak
 * ditemukan".
 *
 * ══ WARNA: NAVY MEREK, BUKAN HIJAU WHATSAPP ════════════════════════════════
 * Di app ini hijau = uang masuk (`colorMoneyPositive`), dan sebuah bulatan
 * hijau yang mengapung di atas halaman yang menjual pembukuan terbaca sebagai
 * pernyataan tentang angka. Isian `--ant-color-brand-solid` dengan glif putih:
 * 11,50:1 (terang) · 5,06:1 (gelap), angka `BrandMark` yang sama — dan
 * `tests/landing-colors.test.ts` menolak warna mentah, jadi hijau WA (#25D366)
 * memang tidak bisa ditulis di sini.
 *
 * ══ `Button href` `outline` + gaya varian, BUKAN `primary` ═════════════════
 * Ia tautan KELUAR (`https://wa.me/…`, tab baru), bukan ajakan mendaftar:
 * penjaga penekanan (`tests/button-emphasis.test.ts`) mengunci setiap primer
 * pendaratan ke `/register`, dan tombol ini memang tidak boleh dihitung sebagai
 * ajakan utama. Isian navy-nya ditulis lewat variabel CSS per-elemen AntD
 * (`--ant-btn-bg-color`, `-hover`, `-active`, `--ant-btn-text-color*`) — pola
 * yang sama dengan `INVERSE_BUTTON_STYLE` di `ui/button.tsx`; hover/aktif
 * memakai `--ant-color-brand-solid-hover` / `-active` (token global baru di
 * #402, nilainya = `PRIMARY_BUTTON_*` — token komponen `Button` TERUKUR tidak
 * sampai ke dokumen sebagai variabel) yang MENGGELAP di kedua tema, jadi glif
 * putihnya hanya naik kontrasnya saat disentuh (13,38 / 6,24:1 hover; 16,59 /
 * 8,64:1 aktif).
 *
 * ══ CINCIN 2px `colorBgContainer` ══════════════════════════════════════════
 * Tombol tetap (fixed) melintasi pita penutup yang isiannya token yang SAMA
 * (`brand-solid` vs `brand-solid` = 1,00:1) — di sana bulatan navy lenyap.
 * Cincin sewarna latar halaman tidak terlihat di atas halaman (1,00:1 —
 * memang tidak dimaksudkan terlihat) dan menggambar tepinya di atas pita
 * navy: 11,50 / 3,64:1. Ia `border`, bukan `box-shadow` tulisan tangan
 * (MASTER.md §Jarak, radius, bayangan); bayangan melayangnya token
 * `--ant-box-shadow`.
 *
 * ══ HANYA ≥576px — DIUKUR ═════════════════════════════════════════════════
 * Di bawah 576px tombol hero bertumpuk SATU KOLOM selebar isi
 * (`[data-landing-actions]{flex-direction:column}`), jadi ajakan utama
 * membentang 16–304px di 320px dan 16–374px di 390px, sedangkan bulatan 48px
 * dengan jarak `margin-lg` (24px) menempati 248–296px / 318–366px: ia menutupi
 * 48px = 17% (320) / 13% (390) lebar tombol utama pada setiap posisi gulungan
 * yang menaruh tombol itu di 72px terbawah layar. Issue memberi jalan
 * keluarnya: tombol melayang baru muncul di ≥576px, tempat tombol hero
 * berjajar (row, selebar isinya masing-masing — total ±350px, jauh di kiri
 * bulatan). Di bawah itu WhatsApp tetap ada di seksi kontak.
 */
import { WhatsAppOutlined } from "@ant-design/icons";
import type { CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { contactChannels } from "@/lib/contact-channels";
import { getT } from "@/lib/i18n/server";

/** Diameter tombol — 48px (permintaan issue; ≥40px target sentuh MASTER.md). */
export const WHATSAPP_FAB_SIZE = 48;

/**
 * Isian navy merek + glif putih di atas tombol `outline`, lewat variabel CSS
 * per-elemen AntD. Diekspor supaya `tests/landing-colors.test.ts` mengukur
 * pasangan yang benar-benar dirender, bukan salinannya.
 */
export const WHATSAPP_FAB_STYLE = {
  "--ant-btn-bg-color": "var(--ant-color-brand-solid)",
  "--ant-btn-bg-color-hover": "var(--ant-color-brand-solid-hover)",
  "--ant-btn-bg-color-active": "var(--ant-color-brand-solid-active)",
  "--ant-btn-text-color": "var(--ant-color-text-light-solid)",
  "--ant-btn-text-color-hover": "var(--ant-color-text-light-solid)",
  "--ant-btn-text-color-active": "var(--ant-color-text-light-solid)",
  "--ant-btn-border-color": "var(--ant-color-bg-container)",
  "--ant-btn-border-color-hover": "var(--ant-color-bg-container)",
  "--ant-btn-border-color-active": "var(--ant-color-bg-container)",
} as CSSProperties;

export async function LandingWhatsappFab() {
  const kanal = contactChannels();
  if (kanal.whatsappUrl === undefined) return null;
  const t = await getT();

  return (
    /* `display` milik CSS (`[data-landing-fab]`, `landing-scale.ts`): none di
       bawah 576px, block di atasnya — gaya sebaris akan menang atas aturan
       itu, jadi tidak ditulis di sini. */
    <div
      data-landing-fab=""
      style={{
        position: "fixed",
        right: "var(--ant-margin-lg)",
        bottom: "var(--ant-margin-lg)",
        zIndex: 20,
      }}
    >
      <Button
        href={kanal.whatsappUrl}
        variant="outline"
        size="icon"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("landing.contactWhatsappCta")}
        style={{
          ...WHATSAPP_FAB_STYLE,
          width: WHATSAPP_FAB_SIZE,
          height: WHATSAPP_FAB_SIZE,
          /* Sebaris, karena `[data-landing] .ant-btn` menyetel radius kendali
             (12px) untuk semua tombol pendaratan dan akan menang atas
             `shape="circle"`. */
          borderRadius: "50%",
          borderWidth: 2,
          boxShadow: "var(--ant-box-shadow)",
        }}
      >
        <WhatsAppOutlined
          aria-hidden="true"
          style={{ fontSize: "var(--ant-font-size-heading-4)" }}
        />
      </Button>
    </div>
  );
}
