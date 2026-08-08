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

/* ------------------------------------------------------------------------- *
 * Fokus ke isian bermasalah (issue #259)
 * ------------------------------------------------------------------------- */

/**
 * Bentuk DOM SEMINIMAL yang dipakai pencarian sasaran fokus di bawah.
 *
 * Kenapa bukan `Element`/`HTMLElement` begitu saja: suite tes repo ini berjalan
 * di lingkungan `node` TANPA DOM (lihat `vitest.config.mts`), sedangkan bug yang
 * diperbaiki di sini hanya bisa dibuktikan dengan menyatakan SIMPUL MANA yang
 * menerima fokus — "tidak melempar galat" tidak membuktikan apa pun, sebab
 * `focus()` pada simpul tersembunyi pun sah dan senyap. Dengan bentuk ini
 * penjaganya (`tests/focus-form-field.test.tsx`) bisa menjalankan
 * `focusFormField` YANG SEBENARNYA di atas pohon yang dibangun dari markup NYATA
 * hasil render `SelectField`, bukan di atas tiruan perilaku.
 *
 * `HTMLElement` memenuhi bentuk ini apa adanya, jadi pemanggil di peramban tidak
 * perlu tahu bahwa ia ada.
 */
export interface FocusTargetNode {
  readonly tagName: string;
  readonly children: ArrayLike<FocusTargetNode>;
  readonly parentElement: FocusTargetNode | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  /** Ada pada `HTMLElement`, tidak pada `Element` — karena itu opsional. */
  focus?(options?: { preventScroll?: boolean }): void;
  scrollIntoView?(options?: { block?: "center"; behavior?: "auto" | "smooth" }): void;
}

/** Apa pun yang bisa dicari dengan selektor: `document`, `<form>`, panel. */
export interface FocusSearchRoot {
  querySelector(selectors: string): FocusTargetNode | null;
}

/** Tag yang bisa menerima fokus papan tik tanpa `tabindex` apa pun. */
const NATIVELY_FOCUSABLE = new Set(["input", "select", "textarea", "button"]);

/**
 * Bisakah simpul ini benar-benar menerima fokus papan tik?
 *
 * `input[type="hidden"]` sengaja disebut lebih dulu: itulah simpul yang
 * dititipkan `SelectField` supaya `new FormData(form)` tetap bekerja (lihat
 * catatan `SelectField` di MASTER.md), dan memfokuskannya adalah kegagalan
 * DIAM — peramban menerima panggilannya lalu membuang fokusnya.
 */
function isKeyboardFocusable(node: FocusTargetNode): boolean {
  if (node.hasAttribute("disabled") || node.hasAttribute("hidden")) return false;
  if (node.getAttribute("aria-hidden") === "true") return false;

  const tabIndex = node.getAttribute("tabindex");
  const tabIndexValue = tabIndex === null ? null : Number(tabIndex);
  if (tabIndexValue !== null && tabIndexValue < 0) return false;

  const tag = node.tagName.toLowerCase();
  if (tag === "input") {
    return (node.getAttribute("type") ?? "text").toLowerCase() !== "hidden";
  }
  if (NATIVELY_FOCUSABLE.has(tag)) return true;
  if (tag === "a") return node.hasAttribute("href");
  // `div role="button" tabindex="0"` — bentuk yang dipakai kepala `Collapse`
  // AntD di atas, dan pemicu beberapa kendali AntD lain.
  return tabIndexValue !== null && tabIndexValue >= 0;
}

/** Kendali fokusabel pertama menurut urutan dokumen di dalam `node`. */
function firstFocusableWithin(node: FocusTargetNode): FocusTargetNode | null {
  const children = node.children;
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (isKeyboardFocusable(child)) return child;
    const deeper = firstFocusableWithin(child);
    if (deeper) return deeper;
  }
  return null;
}

/**
 * Batas pendakian: kotak SATU isian.
 *
 * Tanpa batas ini, "kendali fokusabel pertama" bisa jadi milik isian LAIN —
 * dan memfokuskan isian yang salah lebih buruk daripada tidak memfokuskan apa
 * pun: pengguna dibawa ke tempat yang bukan sumber galatnya.
 */
function isFieldBoundary(node: FocusTargetNode): boolean {
  const tag = node.tagName.toLowerCase();
  if (tag === "form" || tag === "body" || tag === "html") return true;
  return node.getAttribute("data-slot") === "form-item-content";
}

/**
 * Dari simpul yang KETEMU pencarian, tentukan simpul yang benar-benar boleh
 * menerima fokus.
 *
 * Tiga langkah, berhenti pada yang pertama berhasil:
 *  1. simpulnya sendiri, kalau memang fokusabel (isian teks, textarea, …);
 *  2. kendali fokusabel di DALAMNYA, kalau yang ketemu ternyata pembungkus;
 *  3. kendali fokusabel milik isian yang SAMA, ditemukan dengan menaiki induk
 *     selangkah demi selangkah sampai batas kotak isian — inilah jalur isian
 *     pilihan: yang ketemu lewat `[name=…]` adalah `<input type="hidden">` di
 *     dalam `ant-select-prefix`, sedangkan kendali sungguhannya (`<input
 *     role="combobox">`) bertetangga satu tingkat di atasnya.
 */
function resolveFocusTarget(candidate: FocusTargetNode | null): FocusTargetNode | null {
  if (!candidate) return null;
  if (isKeyboardFocusable(candidate)) return candidate;

  const inside = firstFocusableWithin(candidate);
  if (inside) return inside;

  let parent = candidate.parentElement;
  while (parent && !isFieldBoundary(parent)) {
    const found = firstFocusableWithin(parent);
    if (found) return found;
    parent = parent.parentElement;
  }
  return null;
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
 *
 * ── Yang ketemu BUKAN selalu yang boleh difokuskan (issue #259) ─────────────
 * Sampai #188 `[name=…]` selalu berujung di kontrol sungguhan. Sejak isian
 * pilihan menjadi `Select` AntD, `[name=…]` berujung di `<input type="hidden">`
 * titipan primitifnya — dan `focus()` di sana TIDAK melempar galat, ia hanya
 * membuang fokusnya. Akibatnya halaman menggulir ke isian yang ditolak
 * validasi, tetapi fokusnya lenyap: pembaca layar tidak mengumumkan apa pun,
 * pengguna papan tik harus mencari sendiri isian yang salah.
 *
 * Karena itu hasil pencarian di sini DISELESAIKAN dulu menjadi kendali yang
 * benar-benar fokusabel (`resolveFocusTarget`), bukan dipakai apa adanya. Ia
 * dikerjakan di sini — bukan di ketiga formulir pemanggilnya — supaya pemanggil
 * berikutnya tidak mewarisi jebakan yang sama.
 */
export function focusFormField(field: string, root: FocusSearchRoot = document): void {
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(field) : field;
  const byId = root.querySelector(`#${escaped}`);
  const byName = root.querySelector(`[name="${field}"]`);
  const target = resolveFocusTarget(byId) ?? resolveFocusTarget(byName);

  // Kalau tidak ada satu pun kendali fokusabel (markup yang belum dikenal),
  // isiannya tetap dibawa ke layar — menggulir tanpa fokus masih lebih baik
  // daripada tidak terjadi apa-apa. Yang TIDAK dilakukan lagi: memanggil
  // `focus()` pada simpul yang tak bisa menerimanya.
  const anchor = target ?? byId ?? byName;
  if (!anchor) return;

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  anchor.scrollIntoView?.({ block: "center", behavior: reduced ? "auto" : "smooth" });
  target?.focus?.({ preventScroll: true });
}
