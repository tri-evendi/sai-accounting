"use client";

/**
 * DisclosureSection (issue #4) — bagian "Detail lengkap" yang bisa dilipat,
 * ditulis ulang di atas Ant Design `Collapse` pada issue #191 (fase B5).
 *
 * Dipakai tiga formulir utama (Kontrak, Faktur, Transaksi Kas) untuk
 * menyembunyikan isian lanjutan — termin, catatan, mata uang non-standar,
 * PPN/PEB — sampai memang dibutuhkan. Pembagian field-nya BUKAN di sini,
 * melainkan data murni di `src/lib/form-sections.ts` supaya bisa diuji.
 *
 * Tiga keputusan yang menentukan bentuk komponen ini — dan bagaimana masing-
 * masing selamat dari perpindahan ke AntD:
 *
 *  1. **Isinya tidak pernah dilepas dari DOM.** Isian yang di-unmount akan
 *     hilang dari `FormData` saat submit — yaitu diam-diam mengosongkan termin
 *     atau catatan yang sudah diketik pengguna — dan mustahil difokuskan ketika
 *     validasi server menolaknya. Di AntD ini dijamin `forceRender` pada
 *     itemnya: panelnya tetap terpasang, dan saat tertutup hanya diberi
 *     `display: none` (`ant-collapse-panel-hidden`). Kendali yang tersembunyi
 *     oleh CSS TETAP ikut terkirim bersama formulirnya — yang tidak ikut adalah
 *     kendali yang tidak ada di DOM.
 *
 *  2. **Ringkasan saat tertutup.** Kalau isian disembunyikan, nilainya tidak
 *     boleh ikut tersembunyi. `summary` menampilkan nilai berjalan yang penting
 *     (mis. "USD · kurs belum diisi") di kepala bagian, sehingga tidak ada
 *     informasi yang lenyap hanya karena bagian ini terlipat.
 *
 *  3. **Aksesibilitas — dan satu hal yang HILANG di perpindahan ini.**
 *     Sebelumnya pemicunya dibangun di atas Radix `Collapsible`, sehingga ia
 *     `<button type="button">` sungguhan. Kepala `Collapse` AntD adalah `<div
 *     role="button" tabindex="0" aria-expanded>` — namanya, perannya, dan
 *     keadaannya tetap diumumkan dengan benar, tetapi penanganan papan tiknya
 *     hanya mengenal **Enter**. Spasi, yang oleh peramban diberikan gratis
 *     kepada `<button>` sungguhan dan diharapkan setiap pengguna papan tik,
 *     tidak melakukan apa pun — dan lebih buruk: ia menggulung halaman.
 *
 *     Karena itu Spasi dikembalikan di sini, pada pembungkusnya, lewat satu
 *     penangan yang naik dari kepala panel. Sasarannya dikenali dari `role` +
 *     `aria-expanded`, bukan dari nama kelas AntD, supaya ia tidak diam-diam
 *     berhenti bekerja kalau `prefixCls` berubah.
 *
 *     Yang tetap hilang dan sengaja tidak dipalsukan: `aria-controls`. AntD
 *     tidak memberi id pada panelnya dan tidak menerima id dari luar; menaruh
 *     `aria-controls` yang menunjuk id karangan lebih buruk daripada tidak ada,
 *     karena pembaca layar akan mengumumkan hubungan yang tidak bisa ditempuh.
 */

import { useEffect, useRef, useState } from "react";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import { Collapse, theme } from "antd";

import { Badge } from "@/components/ui/badge";
import { ADVANCED_SECTION_TITLE } from "@/lib/form-sections";
import { useT } from "@/lib/i18n/client";

/** Hanya ada satu panel di sini; kuncinya konstan, bukan dihitung. */
const PANEL_KEY = "detail";

interface DisclosureSectionProps {
  /** Judul bagian; standarnya "Detail lengkap". */
  title?: string;
  /** Satu kalimat: apa saja yang ada di dalam. */
  description?: string;
  /** Nilai berjalan yang tetap terbaca meski bagian ini tertutup. */
  summary?: React.ReactNode;
  /** Mode terkendali — wajib berpasangan dengan `onOpenChange`. */
  open?: boolean;
  /** Mode tak terkendali; tertutup secara default (inti dari issue #4). */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Tandai bahwa ada isian bermasalah di dalam (setelah simpan ditolak). */
  invalid?: boolean;
  children: React.ReactNode;
}

export function DisclosureSection({
  title = ADVANCED_SECTION_TITLE,
  description,
  summary,
  open,
  defaultOpen = false,
  onOpenChange,
  invalid = false,
  children,
}: DisclosureSectionProps) {
  const t = useT();
  const { token } = theme.useToken();
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const expanded = isControlled ? open : uncontrolled;
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * `required` DILEPAS selama bagian ini tertutup, lalu dipasang lagi saat
   * dibuka.
   *
   * Kalau tidak: isian wajib yang sedang tersembunyi tetap ikut validasi bawaan
   * peramban, peramban berusaha memfokuskannya, gagal (elemennya `display:none`),
   * lalu MEMBATALKAN submit tanpa pesan apa pun di layar — persis kegagalan diam
   * yang hendak dicegah issue #4. Aturannya ditegakkan di sini, bukan dititipkan
   * ke setiap pemakai, supaya isian wajib mana pun boleh masuk ke bagian ini.
   * Penjaga penggantinya adalah pemeriksaan sebelum-kirim milik formulir, yang
   * membuka bagian ini dan memfokuskan isiannya dengan pesan berbahasa manusia.
   *
   * Sengaja tanpa daftar dependensi: render apa pun bisa memasang kembali
   * `required` dari JSX, jadi invariannya ditegakkan ulang setiap kali.
   */
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    for (const control of panel.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea")) {
      if (!expanded) {
        if (control.required) {
          control.dataset.disclosureRequired = "1";
          control.required = false;
        }
      } else if (control.dataset.disclosureRequired) {
        control.required = true;
        delete control.dataset.disclosureRequired;
      }
    }
  });

  function handleOpenChange(next: boolean) {
    if (!isControlled) setUncontrolled(next);
    onOpenChange?.(next);
  }

  /** Spasi pada kepala panel — lihat catatan (3) di kepala berkas. */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== " " && event.key !== "Spacebar") return;
    const target = event.target as HTMLElement;
    if (target.getAttribute("role") !== "button" || !target.hasAttribute("aria-expanded")) {
      return;
    }
    event.preventDefault(); // tanpa ini, Spasi menggulung halaman
    handleOpenChange(!expanded);
  }

  return (
    <div onKeyDown={handleKeyDown}>
      <Collapse
        activeKey={expanded ? [PANEL_KEY] : []}
        onChange={(keys) => handleOpenChange(keys.length > 0)}
        /* Satu-satunya warna yang ditulis komponen ini: batas merah saat ada
           isian bermasalah di dalamnya — dan ia tidak pernah sendirian, label
           "perlu diperiksa" di kepala bagian membawa katanya. */
        style={invalid ? { borderColor: token.colorError } : undefined}
        items={[
          {
            key: PANEL_KEY,
            // Lihat catatan (1): panelnya tetap terpasang, hanya disembunyikan.
            forceRender: true,
            extra: (
              <span style={{ fontSize: token.fontSizeSM, color: token.colorLink }}>
                {expanded ? t("disclosure.collapse") : t("disclosure.expand")}
              </span>
            ),
            label: (
              <>
                <span
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: token.marginXS,
                  }}
                >
                  <span style={{ fontWeight: token.fontWeightStrong }}>{title}</span>
                  {invalid && (
                    <Badge variant="danger">
                      <ExclamationCircleOutlined aria-hidden="true" style={{ fontSize: 14, verticalAlign: "-0.2em", marginInlineEnd: token.marginXXS }} />
                      {t("disclosure.reviewNeeded")}
                    </Badge>
                  )}
                </span>
                {description && (
                  <span
                    style={{
                      display: "block",
                      marginTop: token.marginXXS,
                      fontSize: token.fontSizeSM,
                      color: token.colorTextSecondary,
                    }}
                  >
                    {description}
                  </span>
                )}
                {/* Ringkasan hanya saat tertutup — lihat catatan (2). */}
                {!expanded && summary && (
                  <span
                    style={{
                      display: "block",
                      marginTop: token.marginXXS,
                      fontSize: token.fontSizeSM,
                      color: token.colorTextSecondary,
                    }}
                  >
                    {summary}
                  </span>
                )}
              </>
            ),
            children: <div ref={panelRef}>{children}</div>,
          },
        ]}
      />
    </div>
  );
}

/**
 * Fokuskan (dan gulirkan ke) isian bermasalah setelah simpan ditolak.
 *
 * Dipanggil SETELAH bagiannya dibuka — isian di dalam panel yang disembunyikan
 * tidak bisa difokuskan — jadi pemanggilnya membungkus ini di
 * `requestAnimationFrame` supaya React sempat menggambar ulang panelnya lebih
 * dulu.
 *
 * Dicari lewat `id` dulu, lalu `name`: sebagian isian dikendalikan React tanpa
 * `id` yang stabil, tetapi `name`-nya selalu sama dengan kunci payload API —
 * kunci yang sama yang dipakai `fieldErrors` dari server.
 */
export function focusFormField(field: string, root: ParentNode | Document = document): void {
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(field) : field;
  const target =
    root.querySelector<HTMLElement>(`#${escaped}`) ??
    root.querySelector<HTMLElement>(`[name="${field}"]`);
  if (!target) return;

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  target.focus({ preventScroll: true });
}
