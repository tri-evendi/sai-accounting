"use client";

/**
 * TermTooltip (issue #1, dirombak di #51, dipindah ke AntD di #190) — label
 * bahasa tugas + ikon "?" yang membuka istilah akuntansi bakunya beserta
 * definisi sederhana.
 *
 *   <TermTooltip term="faktur">Tagihan Penjualan</TermTooltip>
 *
 * Definisinya TIDAK ditulis di sini: seluruh isinya dibaca dari kamus tunggal
 * `src/lib/labels.ts`, sumber yang sama dengan halaman Kamus Istilah (issue #21).
 *
 * ── Kenapa Popover, bukan Tooltip ─────────────────────────────────────────
 * Pilihan ini bertahan dari #51 dan alasannya tidak berubah oleh migrasi:
 * panelnya berisi TAUTAN "Pelajari selengkapnya" yang harus bisa diklik dan
 * di-Tab, dan harus terbuka lewat ketukan di layar sentuh. `Tooltip` — baik
 * Radix dulu maupun AntD sekarang — adalah panel yang hilang begitu kursor
 * pergi dan tidak pernah menerima fokus; menaruh tautan di dalamnya berarti
 * membuat tautan yang tidak bisa dicapai. Menyederhanakannya menjadi atribut
 * `title=` malah menghapus seluruh isinya: definisi dan contoh tidak muat, dan
 * pintu ke Kamus Istilah tertutup.
 *
 * Aksesibilitas — tetap BUKAN hover-only:
 *   • pemicunya `<button>` sungguhan → bisa Tab + Enter/Spasi (papan ketik) dan
 *     bisa diketuk di layar sentuh; saat dibuka via papan ketik/klik, fokus
 *     masuk ke panel sehingga tautannya terjangkau (lihat catatan fokus di
 *     `components/ui/popover.tsx` — AntD tidak memberikannya sendiri);
 *   • area sentuhnya diperbesar ke ~40px lewat pseudo-element;
 *   • hover hanya BONUS di desktop — panel terbuka saat label disorot dan ada
 *     jeda singkat sebelum menutup supaya kursor sempat menyeberang ke panel;
 *     pembukaan via hover TIDAK mencuri fokus papan ketik.
 *
 * Warna panelnya kini datang dari variabel `--ant-*` yang ditulis
 * `ConfigProvider`, bukan dari kelas Tailwind: permukaan, bayangan, dan sudut
 * panel adalah milik `Popover` AntD, jadi teks di dalamnya harus diukur
 * terhadap permukaan itu juga.
 */

import { Link } from "@/components/ui/app-link";
import { useT } from "@/lib/i18n/client";
import { useRef, useState } from "react";
import { ArrowRightOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getTerm, glossaryHref } from "@/lib/labels";

/**
 * Tiga hal yang tidak punya bentuk sebaris, dan ketiganya bukan hiasan:
 *
 *  • **`::after`** — area sentuh ~40px di sekeliling ikon "?" tanpa mengubah
 *    tinggi baris teksnya. Ikon 20px sendirian di bawah ambang target sentuh
 *    MASTER.md, dan membesarkan ikonnya akan merusak baris yang memuatnya.
 *  • **cincin fokus** — ini `<button>` telanjang, bukan komponen AntD, jadi
 *    `genFocusStyle()` AntD tidak menyentuhnya. Warnanya `colorPrimaryBorder`,
 *    token yang sama dengan cincin fokus AntD (#187).
 *  • **garis bawah saat disorot** pada tautan "Pelajari selengkapnya".
 */
const TERM_RULES = `
[data-term-trigger]::after{content:"";position:absolute;inset:-10px}
[data-term-trigger]:focus{outline:none}
[data-term-trigger]:focus-visible{outline:2px solid var(--ant-color-primary-border);outline-offset:1px}
[data-term-link]:hover{text-decoration:underline}
`;

/** Jeda sebelum panel hover ditutup — cukup untuk menyeberangi celah 8px. */
const HOVER_CLOSE_DELAY_MS = 150;

/**
 * Tinggi maksimum panel. Dulu `var(--radix-popover-content-available-height)`,
 * yaitu ruang sisa yang dihitung Radix sampai tepi layar. AntD tidak
 * menyediakan ukuran itu; `60vh` adalah penggantinya yang jujur — cukup untuk
 * definisi terpanjang di kamus, dan tetap menyisakan layar di ponsel.
 */
const PANEL_MAX_HEIGHT = "60vh";

interface TermTooltipProps {
  /** Kunci entri di `src/lib/labels.ts`, mis. "faktur". */
  term: string;
  /** Label yang tampil. Bila kosong, dipakai label bahasa tugas dari kamus. */
  children?: React.ReactNode;
  /** Gaya pembungkus label + ikon — pengganti `className` yang dicabut di #203. */
  style?: React.CSSProperties;
  /** Sembunyikan tautan "Pelajari selengkapnya" (mis. di dalam halaman kamus). */
  hideGlossaryLink?: boolean;
}

export function TermTooltip({ term, children, style, hideGlossaryLink }: TermTooltipProps) {
  const t = useT();
  const entry = getTerm(term);
  const [open, setOpen] = useState(false);
  /** true selama pembukaan terakhir dipicu hover — menentukan soal fokus. */
  const hoverOpenRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelScheduledClose() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openFromHover() {
    cancelScheduledClose();
    if (!open) hoverOpenRef.current = true;
    setOpen(true);
  }

  function scheduleClose() {
    cancelScheduledClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  }

  // Istilah tak dikenal: tampilkan labelnya apa adanya, jangan pernah gagal render.
  if (!entry) return <>{children ?? term}</>;

  const label = children ?? entry.label;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--ant-margin-xxs)",
        verticalAlign: "middle",
        ...style,
      }}
      onMouseEnter={openFromHover}
      onMouseLeave={scheduleClose}
    >
      <style href="sai-term-tooltip" precedence="default">
        {TERM_RULES}
      </style>
      <span>{label}</span>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) hoverOpenRef.current = false; // dibuka via klik/papan ketik
          cancelScheduledClose();
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            data-term-trigger
            aria-label={`Penjelasan istilah: ${entry.label}`}
            style={{
              position: "relative",
              display: "inline-flex",
              width: 20,
              height: 20,
              flexShrink: 0,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              cursor: "pointer",
              transition: "color 150ms, background-color 150ms",
              color: open ? "var(--ant-color-primary)" : "var(--ant-color-text-tertiary)",
              background: open ? "var(--ant-color-primary-bg)" : "transparent",
            }}
          >
            <QuestionCircleOutlined aria-hidden="true" style={{ fontSize: 16 }} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          style={{
            width: 288,
            maxWidth: "calc(100vw - 1rem)",
            maxHeight: PANEL_MAX_HEIGHT,
            overflowY: "auto",
            padding: "var(--ant-padding-sm)",
            textAlign: "left",
            fontWeight: 400,
            textTransform: "none",
          }}
          // Pembukaan via hover tidak boleh mencuri fokus dari yang sedang
          // diketik; pembukaan via papan ketik/klik justru butuh fokus masuk
          // supaya tautan di dalam panel terjangkau.
          onOpenAutoFocus={(event) => {
            if (hoverOpenRef.current) event.preventDefault();
          }}
          onMouseEnter={cancelScheduledClose}
          onMouseLeave={scheduleClose}
        >
          <span
            style={{
              display: "block",
              fontSize: "var(--ant-font-size-sm)",
              fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--ant-color-text-tertiary)",
            }}
          >
            {t("term.badge")}
          </span>
          <span
            style={{
              display: "block",
              marginTop: 2,
              fontSize: "var(--ant-font-size)",
              fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
              color: "var(--ant-color-text)",
            }}
          >
            {entry.term}
          </span>
          <span
            style={{
              display: "block",
              marginTop: 6,
              fontSize: "var(--ant-font-size)",
              lineHeight: 1.625,
              color: "var(--ant-color-text-secondary)",
            }}
          >
            {entry.definisi}
          </span>
          {entry.contoh && (
            <span
              style={{
                display: "block",
                marginTop: "var(--ant-margin-xs)",
                padding: "var(--ant-padding-xs)",
                borderRadius: "var(--ant-border-radius)",
                fontSize: "var(--ant-font-size-sm)",
                lineHeight: 1.625,
                background: "var(--ant-color-fill-quaternary)",
                color: "var(--ant-color-text-secondary)",
              }}
            >
              <span style={{ fontWeight: 500, color: "var(--ant-color-text)" }}>
                {t("term.example")}{" "}
              </span>
              {entry.contoh}
            </span>
          )}
          {!hideGlossaryLink && (
            <Link
              data-term-link
              href={glossaryHref(entry.key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--ant-margin-xxs)",
                marginTop: "var(--ant-margin-xs)",
                fontSize: "var(--ant-font-size-sm)",
                fontWeight: 500,
                color: "var(--ant-color-link)",
              }}
            >
              {t("term.learnMore")}
              <ArrowRightOutlined aria-hidden="true" style={{ fontSize: 12 }} />
            </Link>
          )}
        </PopoverContent>
      </Popover>
    </span>
  );
}
