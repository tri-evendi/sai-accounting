"use client";

/**
 * Menu Bantuan di navbar (issue #21) — pintu masuk tetap ke dua hal:
 *   • Kamus Istilah (`/glossary`), dan
 *   • memutar ulang tur panduan halaman yang sedang dibuka.
 *
 * Tur ditawarkan hanya bila halaman ini memang punya tur (`tourForPath`), jadi
 * pengguna tidak menekan tombol yang tidak melakukan apa-apa.
 *
 * ── Setelah migrasi AntD (issue #193) ─────────────────────────────────────
 * Dropdown rakitan tangan (pemicu `button` mentah + panel `role="menu"` + tiga
 * pendengar dokumen untuk Escape dan klik-di-luar) diganti `Dropdown` AntD.
 * Yang berpindah tuan, dan karena itu layak dicatat:
 *
 *  • **Escape.** Dulu pendengar `keydown` di `document` yang ditulis berkas
 *    ini. Kini `useAccessibility` milik rc-dropdown: ia memasang pendengar di
 *    `window` HANYA selama menu terbuka, menutupnya pada ESC, **dan
 *    mengembalikan fokus ke pemicunya** — hal terakhir itu justru yang tidak
 *    dilakukan versi lama (fokus tertinggal di menu yang sudah lenyap).
 *  • **Klik di luar.** Dulu `mousedown`/`touchstart` + `contains()`; kini
 *    `Trigger` AntD.
 *  • **Tombolnya.** Pemicunya kini `Button` primitif, jadi berkas ini keluar
 *    dari `RAW_BUTTON_ALLOWLIST`: tinggi 40px, cincin fokus, dan transisi
 *    datang dari token, bukan dari kelas yang ditulis ulang di sini.
 *
 * `data-tour="bantuan"` TETAP pada pembungkusnya — tur di `lib/tours.ts`
 * menunjuk nama itu, dan menggantinya membuat langkah tur menyorot ruang
 * kosong.
 */

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Dropdown, Flex, Grid, theme } from "antd";
import type { MenuProps } from "antd";
import { HelpCircle, BookMarked, Compass } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/app-link";
import { GLOSSARY_PATH } from "@/lib/labels";
import { tourForPath } from "@/lib/tours";
import { replayTour } from "@/components/help/guided-tour";
import { useT } from "@/lib/i18n/client";

/** Lebar panel — sama dengan `w-72` sebelum migrasi. */
const LEBAR_PANEL = 288;

/**
 * Baris menu ini berisi DUA baris teks (judul + penjelas), sedangkan
 * `Dropdown` AntD menetapkan tinggi barisnya dari `controlHeight` dan
 * memotong isi yang melebihi. `height: auto` + `whiteSpace: normal`
 * mengembalikan barisnya mengikuti isi — tanpanya penjelasnya terpotong dan
 * yang tersisa hanya judul, persis informasi yang membuat baris ini berguna.
 */
const BARIS_DUA_BARIS: React.CSSProperties = { height: "auto", whiteSpace: "normal" };

export function HelpMenu() {
  const pathname = usePathname();
  const t = useT();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const tour = tourForPath(pathname);
  const [open, setOpen] = useState(false);

  const judul: React.CSSProperties = {
    display: "block",
    fontWeight: token.fontWeightStrong,
    color: token.colorText,
  };
  const penjelas: React.CSSProperties = {
    display: "block",
    fontSize: token.fontSizeSM,
    color: token.colorTextTertiary,
  };

  const items: MenuProps["items"] = [
    {
      key: "glossary",
      icon: <BookMarked size={16} aria-hidden="true" />,
      style: BARIS_DUA_BARIS,
      label: (
        <Link href={GLOSSARY_PATH} style={{ display: "block", color: "inherit" }}>
          <span style={judul}>{t("helpMenu.glossaryTitle")}</span>
          <span style={penjelas}>{t("helpMenu.glossaryDescription")}</span>
        </Link>
      ),
    },
    tour
      ? {
          key: "replay-tour",
          icon: <Compass size={16} aria-hidden="true" />,
          style: BARIS_DUA_BARIS,
          onClick: () => {
            setOpen(false);
            replayTour();
          },
          label: (
            <span>
              <span style={judul}>{t("helpMenu.replayTour")}</span>
              <span style={penjelas}>{tour.title}</span>
            </span>
          ),
        }
      : {
          key: "no-tour",
          disabled: true,
          style: BARIS_DUA_BARIS,
          label: <span style={penjelas}>{t("helpMenu.noTour")}</span>,
        },
  ];

  return (
    // Pembungkus `data-tour` — sasaran langkah tur, jangan ganti namanya.
    <Flex component="span" data-tour="bantuan" style={{ flexShrink: 0 }}>
      <Dropdown
        open={open}
        onOpenChange={setOpen}
        trigger={["click"]}
        placement="bottomRight"
        menu={{ items, style: { width: LEBAR_PANEL } }}
      >
        <Button
          variant="secondary"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t("helpMenu.trigger")}
        >
          <Flex component="span" align="center" gap={token.marginXXS}>
            <HelpCircle size={16} aria-hidden="true" />
            {screens.sm && <span>{t("helpMenu.trigger")}</span>}
          </Flex>
        </Button>
      </Dropdown>
    </Flex>
  );
}
