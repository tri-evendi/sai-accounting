import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/breadcrumb";

/**
 * Kepala halaman standar — breadcrumb + judul + deskripsi + aksi di satu pola.
 *
 * Aturan (lihat "Kepala Halaman" di design-system/sai-accounting/MASTER.md):
 * - SEMUA halaman dashboard memakai komponen ini; jangan menulis `<h1>` atau
 *   memanggil `<Breadcrumb>` sendiri — dijaga `tests/page-header.test.ts`.
 * - Halaman tingkat-1 (item menu samping): tanpa `breadcrumbs`, judul = label
 *   menunya persis (boleh membawa jumlah, mis. "Pelanggan (12)").
 * - Halaman di bawahnya (baru/ubah/rincian): `breadcrumbs` dimulai dari label
 *   menu induk — kata yang sama dengan menu samping, bukan terjemahan lain.
 *
 * Tanpa hook — aman dipakai server component maupun client component.
 */
export interface PageHeaderProps {
  /** Isi `<h1>` — label menu/bahasa tugas, boleh ReactNode untuk jumlah dsb. */
  title: ReactNode;
  /** Jejak lokasi untuk halaman di bawah tingkat-1; item terakhir = halaman ini. */
  breadcrumbs?: BreadcrumbItem[];
  /** Satu-dua kalimat penjelas di bawah judul (opsional). */
  description?: ReactNode;
  /** Badge status di samping judul, mis. <Badge>Aktif</Badge> (opsional). */
  badge?: ReactNode;
  /** Tombol aksi rata-kanan, mis. "+ Buat Tagihan" (opsional). */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  breadcrumbs,
  description,
  badge,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("mb-6", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumb items={breadcrumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            {badge}
          </div>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
