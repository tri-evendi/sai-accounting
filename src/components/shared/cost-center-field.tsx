"use client";

/**
 * Pemilih pusat biaya untuk formulir DOKUMEN (issue #98).
 *
 * Fase 1 (#91) memasang kolom `cost_center_id` di faktur, transaksi pemasok dan
 * transaksi kas, dan mesin posting sudah menstempelkannya ke setiap baris
 * jurnal — tetapi hanya formulir kas yang punya pemilihnya. Akibatnya PENDAPATAN
 * PENJUALAN tidak bisa ditandai sama sekali, dan Laba/Rugi per cabang berisi
 * kas + jurnal manual saja tanpa satu pun tanda bahwa ada yang kurang. Komponen
 * ini yang membuat kolom-kolom itu bisa diisi.
 *
 * SATU komponen, bukan empat salinan: pemilih yang sama kini muncul di faktur
 * (baru & ubah), pembelian/pembayaran pemasok, transaksi kas, dan pengeluaran
 * stok manual. Kalau tiap formulir menyalin `fetch` + `Select` + hint-nya
 * sendiri, kelimanya pelan-pelan berbeda label dan berbeda perlakuan terhadap
 * "kosong" — padahal "kosong" di sini punya arti akuntansi yang tepat.
 *
 * DUA KEPUTUSAN YANG DIPUSATKAN DI SINI:
 *  1. Perusahaan yang belum memakai pusat biaya mendapat daftar KOSONG, dan
 *     pemilihnya tidak dirender sama sekali — formulirnya tak berubah sedikit
 *     pun bagi mereka.
 *  2. Tak dipilih = `""` = `null` = "belum ditetapkan / seluruh perusahaan".
 *     Itu nilai yang SAH, bukan isian yang terlewat, jadi tak pernah `required`.
 */

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

/** Pusat biaya aktif, sebagaimana dikembalikan `GET /api/cost-centers`. */
export interface CostCenterOption {
  id: number;
  code: string;
  name: string;
}

/**
 * Muat daftar pusat biaya AKTIF. Yang nonaktif sengaja tak ditawarkan: ia masih
 * harus terbaca di laporan lama, tetapi tak boleh dipilih untuk dokumen baru.
 */
export function useCostCenters(): CostCenterOption[] {
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await apiFetch("/api/cost-centers?activeOnly=1");
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as CostCenterOption[];
      if (!cancelled) setCostCenters(data);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return costCenters;
}

export interface CostCenterFieldProps {
  costCenters: CostCenterOption[];
  /** `""` = belum ditetapkan. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Ganti kalimat bantuan bawaan — dipakai formulir stok, yang alasannya beda. */
  hint?: string;
}

/**
 * Nilainya dikendalikan pemanggil (bukan `FormData`), supaya formulir yang
 * mengirim JSON — semuanya, di app ini — bisa menaruh `costCenterId` di badan
 * permintaan tanpa menebak-nebak isi `<form>`.
 */
export function CostCenterField({
  costCenters,
  value,
  onChange,
  className,
  hint,
}: CostCenterFieldProps) {
  const t = useT();
  if (costCenters.length === 0) return null;

  return (
    <div className={className}>
      <Select
        id="costCenterId"
        name="costCenterId"
        label={t("costCenters.filterLabel")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={[
          { value: "", label: t("costCenters.filterUnassigned") },
          ...costCenters.map((c) => ({ value: String(c.id), label: `${c.code} — ${c.name}` })),
        ]}
      />
      <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{hint ?? t("costCenters.pickerHint")}</span>
      </p>
    </div>
  );
}

/** Bentuk yang dikirim ke API: `""` menjadi `null`, bukan `0` dan bukan `NaN`. */
export function costCenterPayload(value: string): number | null {
  return value ? Number(value) : null;
}
