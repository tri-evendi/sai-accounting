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
import { cn } from "@/lib/utils";
import { getTerm, glossaryHref } from "@/lib/labels";

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
  className?: string;
  /** Sembunyikan tautan "Pelajari selengkapnya" (mis. di dalam halaman kamus). */
  hideGlossaryLink?: boolean;
}

export function TermTooltip({ term, children, className, hideGlossaryLink }: TermTooltipProps) {
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
      className={cn("inline-flex items-center gap-1 align-middle", className)}
      onMouseEnter={openFromHover}
      onMouseLeave={scheduleClose}
    >
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
            aria-label={`Penjelasan istilah: ${entry.label}`}
            className={cn(
              "relative inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full",
              "transition-colors duration-150",
              // Cincin fokus tetap kelas: ini `<button>` telanjang, bukan
              // komponen AntD, jadi `genFocusStyle()` AntD tidak menyentuhnya.
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              // Area sentuh ~40px tanpa mengubah tinggi baris teks.
              "after:absolute after:-inset-2.5 after:content-['']"
            )}
            style={{
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
          className="w-72 max-w-[calc(100vw-1rem)] overflow-y-auto p-3 text-left font-normal normal-case"
          style={{ maxHeight: PANEL_MAX_HEIGHT }}
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
            className="block text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--ant-color-text-tertiary)" }}
          >
            {t("term.badge")}
          </span>
          <span
            className="mt-0.5 block text-sm font-semibold"
            style={{ color: "var(--ant-color-text)" }}
          >
            {entry.term}
          </span>
          <span
            className="mt-1.5 block text-sm leading-relaxed"
            style={{ color: "var(--ant-color-text-secondary)" }}
          >
            {entry.definisi}
          </span>
          {entry.contoh && (
            <span
              className="mt-2 block rounded-md p-2 text-xs leading-relaxed"
              style={{
                background: "var(--ant-color-fill-quaternary)",
                color: "var(--ant-color-text-secondary)",
              }}
            >
              <span className="font-medium" style={{ color: "var(--ant-color-text)" }}>
                {t("term.example")}{" "}
              </span>
              {entry.contoh}
            </span>
          )}
          {!hideGlossaryLink && (
            <Link
              href={glossaryHref(entry.key)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium hover:underline"
              style={{ color: "var(--ant-color-link)" }}
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
