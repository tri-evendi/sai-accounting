"use client";

/**
 * Tur panduan in-app (issue #21) — mesin penampil langkah.
 *
 * Dipasang sekali di layout dashboard. Ia melihat path saat ini, mencari tur
 * yang cocok di `src/lib/tours.ts` (data murni), lalu:
 *   • MULAI OTOMATIS pada kunjungan pertama saja — penandanya disimpan di
 *     localStorage (`sai:tour-seen:<id>`), bukan tabel baru di database;
 *   • BISA DILEWATI kapan saja (tombol "Lewati" dan tombol Escape) — pedoman UX
 *     "user freedom": tur tidak boleh mengunci layar;
 *   • BISA DIULANG dari menu Bantuan lewat event `sai:tour:replay`.
 *
 * Sorotan memakai empat panel gelap di sekeliling elemen sasaran (bukan bayangan
 * raksasa), sehingga hanya memakai warna dari kelas Tailwind proyek. Bila elemen
 * `data-tour` tidak ditemukan, langkah tetap tampil sebagai kartu di tengah.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X, ArrowLeft, ArrowRight, Check, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tourForPath, tourStorageKey, type TourDef } from "@/lib/tours";

export const TOUR_REPLAY_EVENT = "sai:tour:replay";

/** Dipanggil menu Bantuan untuk memutar ulang tur halaman yang sedang dibuka. */
export function replayTour() {
  window.dispatchEvent(new Event(TOUR_REPLAY_EVENT));
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 8;
const CARD_WIDTH = 340;
const CARD_GAP = 12;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function markSeen(tour: TourDef) {
  try {
    window.localStorage.setItem(tourStorageKey(tour.id), "1");
  } catch {
    // Mode privat / storage penuh: tur tetap jalan, hanya tidak diingat.
  }
}

function hasSeen(tour: TourDef): boolean {
  try {
    return window.localStorage.getItem(tourStorageKey(tour.id)) === "1";
  } catch {
    return true;
  }
}

export function GuidedTour() {
  const pathname = usePathname();
  const tour = tourForPath(pathname);
  const [index, setIndex] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    if (tour) markSeen(tour);
    setIndex(null);
  }, [tour]);

  // Mulai otomatis hanya pada kunjungan pertama halaman ini.
  //
  // Keputusannya ditunda ke frame berikutnya dengan sengaja: `hasSeen` membaca
  // localStorage yang tidak ada di server, jadi render pertama harus identik
  // dengan hasil server (tur tertutup) sebelum penandanya dibaca di browser.
  // Efek ini juga yang menutup tur ketika pengguna pindah halaman.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIndex(tour && !hasSeen(tour) ? 0 : null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tour]);

  // Putar ulang dari menu Bantuan.
  useEffect(() => {
    if (!tour) return;
    function onReplay() {
      setIndex(0);
    }
    window.addEventListener(TOUR_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(TOUR_REPLAY_EVENT, onReplay);
  }, [tour]);

  const step = tour && index !== null ? tour.steps[index] : null;

  // Ikuti posisi elemen sasaran (scroll, resize, dan setelah animasi scroll).
  // Pengukuran pertama pun dijadwalkan lewat requestAnimationFrame agar tata
  // letaknya sudah final saat diukur — sekaligus menjauhkan setState dari badan
  // efek.
  useEffect(() => {
    const el = step?.target
      ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
      : null;

    if (!el) {
      // Sasaran tidak ada (mis. panel disembunyikan untuk peran ini) → kartu
      // tetap tampil di tengah layar, tur tidak macet.
      const frame = window.requestAnimationFrame(() => setBox(null));
      return () => window.cancelAnimationFrame(frame);
    }

    el.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });

    const update = () => {
      const r = el.getBoundingClientRect();
      // Sasaran yang sedang di luar layar (mis. menu samping yang tersembunyi di
      // ponsel) tidak disorot — kartunya jatuh ke tengah layar, bukan menyorot
      // pinggir kosong.
      const offscreen =
        r.width === 0 ||
        r.height === 0 ||
        r.right <= 0 ||
        r.bottom <= 0 ||
        r.left >= window.innerWidth ||
        r.top >= window.innerHeight;
      setBox(offscreen ? null : { top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const frame = window.requestAnimationFrame(update);
    const settle = window.setTimeout(update, 400);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);

  useEffect(() => {
    if (!step) return;
    cardRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (!step) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [step, close]);

  if (!tour || index === null || !step) return null;

  const isLast = index === tour.steps.length - 1;
  const spotlight = box
    ? {
        top: Math.max(box.top - SPOTLIGHT_PADDING, 0),
        left: Math.max(box.left - SPOTLIGHT_PADDING, 0),
        width: box.width + SPOTLIGHT_PADDING * 2,
        height: box.height + SPOTLIGHT_PADDING * 2,
      }
    : null;

  // Kartu ditaruh di bawah sasaran bila muat, kalau tidak di atasnya; tanpa
  // sasaran, kartu tampil di tengah layar.
  const viewportH = typeof window === "undefined" ? 0 : window.innerHeight;
  const viewportW = typeof window === "undefined" ? 0 : window.innerWidth;
  let cardStyle: React.CSSProperties;
  if (spotlight) {
    const below = spotlight.top + spotlight.height + CARD_GAP;
    const placeBelow = below + 220 < viewportH;
    const left = Math.min(
      Math.max(spotlight.left, CARD_GAP),
      Math.max(viewportW - CARD_WIDTH - CARD_GAP, CARD_GAP)
    );
    cardStyle = placeBelow
      ? { top: below, left, width: CARD_WIDTH, maxWidth: "calc(100vw - 24px)" }
      : {
          bottom: Math.max(viewportH - spotlight.top + CARD_GAP, CARD_GAP),
          left,
          width: CARD_WIDTH,
          maxWidth: "calc(100vw - 24px)",
        };
  } else {
    cardStyle = {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: CARD_WIDTH,
      maxWidth: "calc(100vw - 24px)",
    };
  }

  return (
    <div className="fixed inset-0 z-[100]" role="presentation">
      {/* Lapisan gelap: satu penuh, atau empat sisi mengelilingi sasaran. */}
      {spotlight ? (
        <>
          <div className="fixed inset-x-0 top-0 bg-gray-900/60" style={{ height: spotlight.top }} />
          <div
            className="fixed inset-x-0 bg-gray-900/60"
            style={{ top: spotlight.top + spotlight.height, bottom: 0 }}
          />
          <div
            className="fixed left-0 bg-gray-900/60"
            style={{ top: spotlight.top, height: spotlight.height, width: spotlight.left }}
          />
          <div
            className="fixed right-0 bg-gray-900/60"
            style={{
              top: spotlight.top,
              height: spotlight.height,
              width: Math.max(viewportW - spotlight.left - spotlight.width, 0),
            }}
          />
          <div
            className="pointer-events-none fixed rounded-lg ring-2 ring-blue-500"
            style={spotlight}
            aria-hidden="true"
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-gray-900/60" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-step-title"
        tabIndex={-1}
        className={cn(
          "fixed rounded-xl border border-gray-200 bg-white p-4 shadow-lg focus:outline-none"
        )}
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-blue-700">
            <Compass className="h-4 w-4" aria-hidden="true" />
            {tour.title}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Tutup tur"
            className="-m-1 cursor-pointer rounded p-1 text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <h2 id="tour-step-title" className="mt-2 text-base font-semibold text-gray-900">
          {step.title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs tabular-nums text-gray-500">
            Langkah {index + 1} dari {tour.steps.length}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={close}>
              Lewati
            </Button>
            {index > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="cursor-pointer"
                onClick={() => setIndex((i) => Math.max((i ?? 0) - 1, 0))}
              >
                <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                Kembali
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className="cursor-pointer"
              onClick={() => (isLast ? close() : setIndex((i) => (i ?? 0) + 1))}
            >
              {isLast ? (
                <>
                  <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                  Selesai
                </>
              ) : (
                <>
                  Lanjut
                  <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
