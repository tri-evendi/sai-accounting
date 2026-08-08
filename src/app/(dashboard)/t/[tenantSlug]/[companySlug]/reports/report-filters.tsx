"use client";

/**
 * Penyaring di atas laporan — dikonversi ke tata letak Ant Design (issue #198).
 *
 * Kedua formulir memakai `Flex component="form"`: yang hilang hanyalah kelas
 * Tailwind-nya, tidak satu pun perilakunya. `align="flex-end"` tetap penting —
 * `Input` menaruh labelnya DI ATAS kotak isian, jadi meratakan ke atas akan
 * membuat tombol "Tampilkan" berdiri sejajar dengan label, bukan dengan kotak
 * yang ia jalankan.
 *
 * ── Kenapa kedua "Tampilkan" `outline` (#267 potongan 4) ──────────────────
 *
 * Keduanya MENYARING: mereka membaca ulang laporannya dengan rentang lain dan
 * tidak menulis apa pun ke buku. §Aksi utama per layar sudah menjawab bentuk
 * ini tiga kali (`/operator` "Saring", `shared/ledger-filter.tsx` di potongan 2,
 * enam kotak cari halaman daftar di potongan 3); berkas ini yang keempat.
 *
 * Radiusnya delapan halaman laporan (neraca, laba rugi, arus kas, neraca saldo,
 * kas & bank, penjualan per pelanggan, pembelian per pemasok, dan seterusnya) —
 * seluruhnya layar BACA yang tombol ekspornya sudah `secondary`. **Nol aksi
 * utama** adalah jawaban yang benar untuk layar semacam itu, dan sebelum ini
 * satu-satunya blok biru di sana justru kendali penyaringnya.
 *
 * ⚠ `AsOfFilter` dan `PeriodFilter` TIDAK PERNAH terender bersamaan — tiap
 * halaman laporan memakai satu. Alat audit yang membaca per-berkas akan
 * melaporkannya sebagai "dua primer di satu rute"; itu artefak berkasnya, bukan
 * layarnya.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flex } from "antd";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

/** `margin` 16 · `marginLG` 24 — jarak antar kendali & jarak ke tabel di bawah. */
const CONTROL_GAP = 12;
const SECTION_GAP = 24;
/** Lebar nyaman pemilih pusat biaya (`min-w-[220px]` lama). */
const SELECT_MIN_WIDTH = 220;

export function AsOfFilter({ basePath, asOf }: { basePath: string; asOf: string }) {
  const router = useRouter();
  const t = useT();
  const [d, setD] = useState(asOf);
  function submit(e: React.FormEvent<HTMLElement>) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (d) p.set("asOf", d);
    router.push(`${basePath}?${p.toString()}`);
  }
  return (
    <Flex
      component="form"
      onSubmit={submit}
      align="flex-end"
      gap={CONTROL_GAP}
      style={{ marginBottom: SECTION_GAP }}
    >
      <div>
        <Input
          id="asOf"
          type="date"
          label={t("reports.asOfDate")}
          value={d}
          onChange={(e) => setD(e.target.value)}
        />
      </div>
      {/* Lihat catatan `outline` di kepala berkas (#267). */}
      <Button type="submit" variant="outline">
        {t("common.show")}
      </Button>
    </Flex>
  );
}

/**
 * Penyaring periode, dengan penyaring PUSAT BIAYA opsional (issue #91).
 *
 * Pemilihnya hanya muncul bila halaman memberi `costCenterOptions` — jadi
 * laporan yang memang tidak boleh dipilah per pusat biaya (Neraca: debit &
 * kredit takkan seimbang tanpa akun antar-unit) tidak menawarkannya sama
 * sekali, alih-alih menawarkan lalu diam-diam mengabaikannya.
 */
export function PeriodFilter({
  basePath,
  from,
  to,
  costCenterOptions,
  costCenter,
}: {
  basePath: string;
  from: string;
  to: string;
  costCenterOptions?: { value: string; label: string }[];
  costCenter?: string;
}) {
  const router = useRouter();
  // `t` sudah dipakai untuk tanggal "sampai" di komponen ini.
  const translate = useT();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [cc, setCc] = useState(costCenter ?? "");
  function submit(e: React.FormEvent<HTMLElement>) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (f) p.set("from", f);
    if (t) p.set("to", t);
    if (cc) p.set("costCenter", cc);
    router.push(`${basePath}?${p.toString()}`);
  }
  return (
    <Flex
      component="form"
      onSubmit={submit}
      wrap
      align="flex-end"
      gap={CONTROL_GAP}
      style={{ marginBottom: SECTION_GAP }}
    >
      <div>
        <Input
          id="from"
          type="date"
          label={translate("common.from")}
          value={f}
          onChange={(e) => setF(e.target.value)}
        />
      </div>
      <div>
        <Input
          id="to"
          type="date"
          label={translate("common.to")}
          value={t}
          onChange={(e) => setT(e.target.value)}
        />
      </div>
      {costCenterOptions && (
        <div style={{ minWidth: SELECT_MIN_WIDTH }}>
          <Select
            id="costCenter"
            label={translate("costCenters.filterLabel")}
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            options={costCenterOptions}
          />
        </div>
      )}
      {/* Lihat catatan `outline` di kepala berkas (#267). */}
      <Button type="submit" variant="outline">
        {translate("common.show")}
      </Button>
    </Flex>
  );
}
