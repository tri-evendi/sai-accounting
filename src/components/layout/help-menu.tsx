"use client";

/**
 * Menu Bantuan di navbar (issue #21) — pintu masuk tetap ke dua hal:
 *   • Kamus Istilah (`/glossary`), dan
 *   • memutar ulang tur panduan halaman yang sedang dibuka.
 *
 * Tur ditawarkan hanya bila halaman ini memang punya tur (`tourForPath`), jadi
 * pengguna tidak menekan tombol yang tidak melakukan apa-apa. Menu memakai
 * `<button>`/`<Link>` sungguhan agar bisa dioperasikan dengan keyboard, dan
 * ditutup oleh Escape maupun klik di luar.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { HelpCircle, BookMarked, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { GLOSSARY_PATH } from "@/lib/labels";
import { tourForPath } from "@/lib/tours";
import { replayTour } from "@/components/help/guided-tour";

export function HelpMenu() {
  const pathname = usePathname();
  const tour = tourForPath(pathname);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const itemClass =
    "flex w-full cursor-pointer items-start gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors duration-150 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="relative" ref={containerRef} data-tour="bantuan">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Bantuan"
        className={cn(
          "flex h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors duration-150",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          open
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-white text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Bantuan</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Menu bantuan"
          className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-border bg-white p-1 shadow-lg"
        >
          <Link
            role="menuitem"
            href={GLOSSARY_PATH}
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <BookMarked className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              <span className="block font-medium text-foreground">Kamus Istilah</span>
              <span className="block text-xs text-muted-foreground">
                Arti istilah akuntansi dengan bahasa sehari-hari.
              </span>
            </span>
          </Link>

          {tour ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                replayTour();
              }}
              className={itemClass}
            >
              <Compass className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>
                <span className="block font-medium text-foreground">Ulangi tur halaman ini</span>
                <span className="block text-xs text-muted-foreground">{tour.title}</span>
              </span>
            </button>
          ) : (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Halaman ini belum punya tur panduan. Tur tersedia di Beranda, Catat Penjualan, dan
              Pusat Laporan.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
