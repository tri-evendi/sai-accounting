/**
 * Panel "Aksi Cepat" (issue #2) — enam pekerjaan tersering, satu klik dari Beranda.
 *
 * Server component: daftar aksinya sudah disaring per peran di server
 * (`quickActionsForRole`), jadi tombol yang tidak boleh dipakai peran tersebut
 * tidak ikut dikirim ke browser — bukan disembunyikan dengan CSS.
 *
 * Arah uang ditandai ikon + TEKS ("Uang masuk" / "Uang keluar"), tidak pernah
 * warna saja, sesuai aturan semantik uang di MASTER.md.
 */

import Link from "next/link";
import {
  Receipt,
  ShoppingCart,
  ArrowDownLeft,
  ArrowUpRight,
  PackagePlus,
  FileText,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuickAction, QuickActionTone } from "@/lib/quick-actions";

const ICONS: Record<string, LucideIcon> = {
  Receipt,
  ShoppingCart,
  ArrowDownLeft,
  ArrowUpRight,
  PackagePlus,
  FileText,
};

const TONE_STYLES: Record<QuickActionTone, { icon: string; note: string; label: string }> = {
  in: {
    icon: "bg-green-50 text-green-700 group-hover:bg-green-100",
    note: "text-green-700",
    label: "Uang masuk",
  },
  out: {
    icon: "bg-red-50 text-red-700 group-hover:bg-red-100",
    note: "text-red-700",
    label: "Uang keluar",
  },
  stock: {
    icon: "bg-amber-50 text-amber-700 group-hover:bg-amber-100",
    note: "text-amber-700",
    label: "Barang",
  },
  neutral: {
    icon: "bg-blue-50 text-blue-700 group-hover:bg-blue-100",
    note: "text-blue-700",
    label: "Dokumen",
  },
};

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;

  return (
    <section data-tour="aksi-cepat" aria-labelledby="aksi-cepat-judul">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-5 w-5 text-blue-600" aria-hidden="true" />
        <h2 id="aksi-cepat-judul" className="text-lg font-semibold text-gray-900">
          Aksi Cepat
        </h2>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Pekerjaan yang paling sering dilakukan — pilih satu untuk langsung membuka formulirnya.
      </p>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((action) => {
          const Icon = ICONS[action.icon] ?? FileText;
          const tone = TONE_STYLES[action.tone];
          return (
            <Link
              key={action.key}
              href={action.href}
              className={cn(
                "group flex min-h-[6.5rem] cursor-pointer items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm",
                "transition-shadow duration-200 hover:shadow-md",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              )}
            >
              <span
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
                  tone.icon
                )}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold text-gray-900">{action.label}</span>
                <span className={cn("mt-0.5 block text-xs font-medium", tone.note)}>
                  {tone.label}
                </span>
                <span className="mt-1 block text-sm leading-snug text-gray-500">
                  {action.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
