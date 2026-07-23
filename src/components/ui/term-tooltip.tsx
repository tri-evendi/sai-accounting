"use client";

/**
 * TermTooltip (issue #1, dirombak di issue #51) — label bahasa tugas + ikon
 * "?" yang membuka istilah akuntansi bakunya beserta definisi sederhana.
 *
 *   <TermTooltip term="faktur">Tagihan Penjualan</TermTooltip>
 *
 * Definisinya TIDAK ditulis di sini: seluruh isinya dibaca dari kamus tunggal
 * `src/lib/labels.ts`, sumber yang sama dengan halaman Kamus Istilah (issue #21).
 *
 * Kini dibangun di atas Radix `Popover`, BUKAN Radix `Tooltip` — pilihan yang
 * disengaja: panelnya berisi tautan "Pelajari selengkapnya" yang harus bisa
 * diklik/di-Tab, dan harus terbuka lewat ketukan di layar sentuh; dua hal yang
 * pola tooltip murni tidak dukung (issue #51 sendiri menyebut fallback ini).
 * Dari Radix kita dapat gratis: positioning sadar-tabrakan (flip/shift di tepi
 * layar — dulu dihitung manual), Escape + klik-luar menutup, dan fokus kembali
 * ke pemicunya.
 *
 * Aksesibilitas — tetap BUKAN hover-only:
 *   • pemicunya `<button>` sungguhan → bisa Tab + Enter/Spasi (keyboard) dan
 *     bisa diketuk di layar sentuh; saat dibuka via keyboard/klik, fokus
 *     masuk ke panel sehingga tautannya terjangkau;
 *   • area sentuhnya diperbesar ke ~40px lewat pseudo-element;
 *   • hover hanya BONUS di desktop — panel terbuka saat label disorot dan ada
 *     jeda singkat sebelum menutup supaya kursor sempat menyeberang ke panel;
 *     pembukaan via hover TIDAK mencuri fokus keyboard.
 */

import Link from "next/link";
import { useRef, useState } from "react";
import { HelpCircle, ArrowRight } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getTerm, glossaryHref } from "@/lib/labels";

/** Jeda sebelum panel hover ditutup — cukup untuk menyeberangi celah 8px. */
const HOVER_CLOSE_DELAY_MS = 150;

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
          if (next) hoverOpenRef.current = false; // dibuka via klik/keyboard
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
              "text-muted-foreground transition-colors duration-150 hover:text-primary hover:bg-primary/10",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
              // Area sentuh ~40px tanpa mengubah tinggi baris teks.
              "after:absolute after:-inset-2.5 after:content-['']",
              open && "text-primary bg-primary/10"
            )}
          >
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          className="w-72 max-w-[calc(100vw-1rem)] overflow-y-auto p-3 text-left font-normal normal-case"
          style={{ maxHeight: "var(--radix-popover-content-available-height)" }}
          // Pembukaan via hover tidak boleh mencuri fokus dari yang sedang
          // diketik; pembukaan via keyboard/klik justru butuh fokus masuk
          // supaya tautan di dalam panel terjangkau.
          onOpenAutoFocus={(event) => {
            if (hoverOpenRef.current) event.preventDefault();
          }}
          onMouseEnter={cancelScheduledClose}
          onMouseLeave={scheduleClose}
        >
          <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Istilah akuntansi
          </span>
          <span className="mt-0.5 block text-sm font-semibold text-foreground">{entry.term}</span>
          <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground">{entry.definisi}</span>
          {entry.contoh && (
            <span className="mt-2 block rounded-md bg-muted p-2 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Contoh: </span>
              {entry.contoh}
            </span>
          )}
          {!hideGlossaryLink && (
            <Link
              href={glossaryHref(entry.key)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Pelajari selengkapnya
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          )}
        </PopoverContent>
      </Popover>
    </span>
  );
}
