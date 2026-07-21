"use client";

/**
 * TermTooltip (issue #1) — label bahasa tugas + ikon "?" yang membuka istilah
 * akuntansi bakunya beserta definisi sederhana.
 *
 *   <TermTooltip term="faktur">Tagihan Penjualan</TermTooltip>
 *
 * Definisinya TIDAK ditulis di sini: seluruh isinya dibaca dari kamus tunggal
 * `src/lib/labels.ts`, sumber yang sama dengan halaman Kamus Istilah (issue #21).
 *
 * Aksesibilitas — sengaja BUKAN hover-only:
 *   • pemicunya `<button>` sungguhan → bisa Tab + Enter/Spasi (keyboard) dan
 *     bisa diketuk di layar sentuh yang tidak punya hover sama sekali;
 *   • area sentuhnya diperbesar ke ~40px lewat pseudo-element, tanpa menggeser
 *     tata letak teks di sekitarnya;
 *   • hover hanya BONUS di desktop; Escape dan klik di luar menutup panel;
 *   • statusnya diumumkan lewat `aria-expanded` + `aria-controls`.
 */

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { HelpCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTerm, glossaryHref } from "@/lib/labels";

/** Lebar panel penjelasan (px) — dipakai juga untuk menjaga posisinya di layar. */
const PANEL_WIDTH = 288;
const PANEL_GAP = 8;
/** Ruang minimum di bawah label sebelum panel dibalik ke atas. */
const PANEL_MIN_HEIGHT = 200;

interface PanelCoords {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

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
  const [coords, setCoords] = useState<PanelCoords | null>(null);
  const containerRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  /**
   * Panel dipasang `fixed` dan dihitung dari posisi tombol, BUKAN `absolute`
   * di dalam alirannya: banyak label duduk di dalam kepala tabel yang dibungkus
   * `overflow-x-auto`, dan panel absolut di sana akan terpotong. Karena posisinya
   * dibekukan saat dibuka, panel ditutup begitu halaman digulir/diubah ukurannya
   * supaya tidak pernah tertinggal jauh dari labelnya.
   */
  function place() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const maxLeft = Math.max(window.innerWidth - PANEL_WIDTH - PANEL_GAP, PANEL_GAP);
    const left = Math.min(Math.max(rect.left, PANEL_GAP), maxLeft);
    const roomBelow = window.innerHeight - rect.bottom;
    // Muat di bawah label? kalau tidak, panel dibalik ke atasnya; apa pun
    // pilihannya tingginya dibatasi agar tidak pernah keluar layar.
    if (roomBelow >= PANEL_MIN_HEIGHT) {
      setCoords({
        left,
        top: rect.bottom + PANEL_GAP,
        maxHeight: roomBelow - PANEL_GAP * 2,
      });
    } else {
      setCoords({
        left,
        bottom: window.innerHeight - rect.top + PANEL_GAP,
        maxHeight: rect.top - PANEL_GAP * 2,
      });
    }
  }

  function show() {
    place();
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    // Menggulir HALAMAN menutup panel (posisinya dibekukan saat dibuka), tetapi
    // menggulir ISI panel yang panjang tidak — kalau tidak, definisi panjang jadi
    // mustahil dibaca sampai habis.
    function dismiss(event: Event) {
      const target = event.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  // Istilah tak dikenal: tampilkan labelnya apa adanya, jangan pernah gagal render.
  if (!entry) return <>{children ?? term}</>;

  const label = children ?? entry.label;

  return (
    <span
      ref={containerRef}
      className={cn("inline-flex items-center gap-1 align-middle", className)}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
    >
      <span>{label}</span>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Penjelasan istilah: ${entry.label}`}
        onClick={() => (open ? setOpen(false) : show())}
        className={cn(
          "relative inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full",
          "text-gray-400 transition-colors duration-150 hover:text-blue-700 hover:bg-blue-50",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1",
          // Area sentuh ~40px tanpa mengubah tinggi baris teks.
          "after:absolute after:-inset-2.5 after:content-['']",
          open && "text-blue-700 bg-blue-50"
        )}
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && coords && (
        <span
          ref={panelRef}
          id={panelId}
          role="note"
          style={{
            top: coords.top,
            bottom: coords.bottom,
            left: coords.left,
            width: PANEL_WIDTH,
            maxHeight: coords.maxHeight,
          }}
          className={cn(
            "fixed z-50 block max-w-[calc(100vw-1rem)] overflow-y-auto",
            "rounded-lg border border-gray-200 bg-white p-3 text-left font-normal normal-case text-gray-900 shadow-lg"
          )}
        >
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400">
            Istilah akuntansi
          </span>
          <span className="mt-0.5 block text-sm font-semibold text-gray-900">{entry.term}</span>
          <span className="mt-1.5 block text-sm leading-relaxed text-gray-600">{entry.definisi}</span>
          {entry.contoh && (
            <span className="mt-2 block rounded-md bg-gray-50 p-2 text-xs leading-relaxed text-gray-600">
              <span className="font-medium text-gray-700">Contoh: </span>
              {entry.contoh}
            </span>
          )}
          {!hideGlossaryLink && (
            <Link
              href={glossaryHref(entry.key)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
            >
              Pelajari selengkapnya
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          )}
        </span>
      )}
    </span>
  );
}
