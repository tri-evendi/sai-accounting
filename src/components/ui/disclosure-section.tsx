"use client";

/**
 * DisclosureSection (issue #4) — bagian "Detail lengkap" yang bisa dilipat.
 *
 * Dipakai tiga formulir utama (Kontrak, Faktur, Transaksi Kas) untuk
 * menyembunyikan isian lanjutan — termin, catatan, mata uang non-standar,
 * PPN/PEB — sampai memang dibutuhkan. Pembagian field-nya BUKAN di sini,
 * melainkan data murni di `src/lib/form-sections.ts` supaya bisa diuji.
 *
 * Tiga keputusan yang menentukan bentuk komponen ini:
 *
 *  1. **Isinya tidak pernah dilepas dari DOM.** Panelnya disembunyikan dengan
 *     atribut `hidden`, bukan dengan `{open && ...}`. Isian yang di-unmount akan
 *     hilang dari `FormData` saat submit — yaitu diam-diam mengosongkan termin
 *     atau catatan yang sudah diketik pengguna — dan mustahil difokuskan ketika
 *     validasi server menolaknya. Keduanya bug yang lebih parah daripada sedikit
 *     DOM ekstra.
 *
 *  2. **Ringkasan saat tertutup.** Kalau isian disembunyikan, nilainya tidak
 *     boleh ikut tersembunyi. `summary` menampilkan nilai berjalan yang penting
 *     (mis. "USD · kurs belum diisi") di kepala bagian, sehingga tidak ada
 *     informasi yang lenyap hanya karena bagian ini terlipat.
 *
 *  3. **Aksesibilitas.** Sejak issue #51 dibangun di atas Radix `Collapsible`
 *     (lihat `collapsible.tsx`): pemicunya tetap `<button type="button">`
 *     sungguhan, dan `aria-expanded` + `aria-controls` + toggle keyboard
 *     kini datang dari Radix, bukan dirakit tangan. Panelnya `role="group"`
 *     yang dilabeli tombolnya sendiri. Catatan: `forceMount` + `hidden`
 *     manual dipakai justru untuk mempertahankan keputusan (1) — Radix tanpa
 *     forceMount akan melepas isi panel dari DOM saat tertutup.
 */

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, AlertCircle } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ADVANCED_SECTION_TITLE } from "@/lib/form-sections";

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
  className?: string;
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
  className,
}: DisclosureSectionProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const expanded = isControlled ? open : uncontrolled;
  const buttonId = useId();
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

  return (
    <Collapsible
      open={expanded}
      onOpenChange={handleOpenChange}
      className={cn(
        "rounded-lg border bg-white transition-colors duration-150",
        invalid ? "border-destructive" : "border-border",
        className
      )}
    >
      <CollapsibleTrigger
        id={buttonId}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left",
          "transition-colors duration-150 hover:bg-muted",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        )}
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
            expanded && "rotate-180"
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            {invalid && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive-soft px-2 py-0.5 text-xs font-medium text-destructive-strong">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Perlu diperiksa
              </span>
            )}
          </span>
          {description && (
            <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
          )}
          {!expanded && summary && (
            <span className="mt-1 block text-xs text-muted-foreground">{summary}</span>
          )}
        </span>
        <span className="shrink-0 text-xs font-medium text-primary">
          {expanded ? "Tutup" : "Buka"}
        </span>
      </CollapsibleTrigger>

      {/* `forceMount` + `hidden`, bukan unmount — lihat catatan (1) di atas.
          `hidden` di sini menimpa milik Radix, yang dengan forceMount tidak
          pernah menyembunyikan panelnya sendiri. Id panel TIDAK ditimpa:
          `aria-controls` pada trigger dipasang Radix ke id buatannya. */}
      <CollapsibleContent
        forceMount
        ref={panelRef}
        role="group"
        aria-labelledby={buttonId}
        hidden={!expanded}
        className="border-t border-border px-4 py-4"
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Fokuskan (dan gulirkan ke) isian bermasalah setelah simpan ditolak.
 *
 * Dipanggil SETELAH bagiannya dibuka — isian di dalam panel `hidden` tidak bisa
 * difokuskan — jadi pemanggilnya membungkus ini di `requestAnimationFrame`
 * supaya React sempat menggambar ulang panelnya lebih dulu.
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
