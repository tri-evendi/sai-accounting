/**
 * Tanggal bisnis tidak dipotong dari `toISOString()` (keputusan pemilik,
 * 22 Okt 2026: tanggal bisnis mengikuti jam Jakarta).
 *
 * ══ Bentuk yang dijaga, dan kenapa ia bug ══════════════════════════════════
 *
 * `new Date().toISOString().slice(0, 10)` adalah tanggal UTC. Pukul 00.00–06.59
 * WIB ia masih "kemarin": bawaan tanggal formulir mundur sehari, nama berkas
 * laporan bertanggal kemarin, dan penjadwal yang berjalan dini hari menerbitkan
 * kejadian tanggal 1 sehari terlambat. `setHours(23, 59, 59, 999)` sama
 * buruknya ke arah lain: akhir hari ZONA PROSES, yang di CI (UTC) atau host
 * berzona lain bukan akhir hari Jakarta. Bentuk yang benar ada di
 * `@sai/core/business-date`: `businessISODate`, `businessDayStart`,
 * `businessDayEnd`.
 *
 * ══ Daftar-izin: nama berkas → JUMLAH, masing-masing dengan alasannya ══════
 *
 * Peta hitungan, bukan daftar nama berkas (pelajaran #289): berkas yang sudah
 * terdaftar tidak boleh menambah pemakaian baru tanpa membuat penjaga ini
 * merah, dan mencabut satu pemakaian juga memerahkannya — supaya angkanya
 * diperbarui di diff, bukan dibiarkan menjadi izin yang basi.
 *
 * Yang SAH memakai bentuk UTC hanya tiga golongan:
 *   1. nilainya SUDAH tanggal kalender murni di tengah malam UTC (kolom
 *      `@db.Date`, hasil pengurai impor, aritmetika kalender `Date.UTC`) —
 *      bagian tanggal ISO-nya memang tanggal itu sendiri;
 *   2. hasilnya KUNCI yang sudah tersimpan (idempotensi, nomor tagihan) —
 *      menggeser bentuknya menerbitkan ulang yang sudah terbit;
 *   3. stempel teknis yang bukan tanggal bisnis (nama basis data, log
 *      perkakas pengembang).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AKAR_REPO, berkasSumber, tanpaKomentar } from "./akar-sumber";

const POLA = /toISOString\(\)\.(slice\(0,\s*10\)|split\(["']T["']\)\[0\]|substring\(0,\s*10\))|\.setHours\(\s*(0|23)\s*,/g;

const DIIZINKAN: Record<string, { jumlah: number; alasan: string }> = {
  "packages/core/src/business-date.ts": {
    jumlah: 1,
    alasan: "implementasi `businessISODate` itu sendiri — instan digeser +07:00 lebih dulu",
  },
  "packages/core/src/schedule-due.ts": {
    jumlah: 1,
    alasan: "butir kunci idempotensi denyut — UTC menurut `contract/kinds.yaml`; kembaran Go dibuktikan fikstur bersama",
  },
  "packages/core/src/export-limits.ts": {
    jumlah: 1,
    alasan: "aritmetika kalender murni atas teks ISO yang diurai sebagai tengah malam UTC",
  },
  "packages/platform/src/licence-register-store.ts": {
    jumlah: 1,
    alasan: "kolom `support_ends_on` ber-`@db.Date` — Prisma memulangkannya sebagai tengah malam UTC",
  },
  "packages/billing/src/subscription-lifecycle.ts": {
    jumlah: 1,
    alasan: "`dateKey` = kunci `reminder_logs.due_key` dan nomor `PINV-S…` yang sudah tersimpan",
  },
  "packages/billing/src/trial-retention.ts": {
    jumlah: 1,
    alasan: "`dateKey` = kunci `reminder_logs.due_key` pemberitahuan retensi (`D-14:`/`D-3:`) — bentuk yang sama dengan `subscription-lifecycle`",
  },
  "apps/operator/src/lib/operator/writes.ts": {
    jumlah: 1,
    alasan: "nomor tagihan kompensasi wajib sebentuk dengan `dateKey` nomor penjadwal",
  },
  "apps/operator/src/app/(operator)/licences/actions.ts": {
    jumlah: 1,
    alasan: "uji keabsahan kalender (bukan 31 Februari) atas teks yang diurai sebagai UTC",
  },
  "src/lib/validations/tax.ts": {
    jumlah: 1,
    alasan: "uji keabsahan kalender (bukan 31 Februari) atas teks yang diurai sebagai UTC",
  },
  "src/lib/tax-rates.ts": {
    jumlah: 1,
    alasan: "kolom `effective_from` ber-`@db.Date` — tengah malam UTC",
  },
  "src/lib/recurring.ts": {
    jumlah: 1,
    alasan: "`occurrenceKey` — kunci idempotensi atas tanggal kalender `Date.UTC` buatan modul itu",
  },
  "src/lib/legacy-contract-fix.ts": {
    jumlah: 1,
    alasan: "`isoDay` — hari kalender kolom tanggal WARISAN, yang ditulis pengimpor sebagai `Date.UTC(y, m, d)`; dicocokkan ke tanggal konversi & kurs BI",
  },
  "src/lib/invoice-reminder.ts": {
    jumlah: 1,
    alasan: "`dueKeyOf` — kunci idempotensi riwayat pengingat atas jatuh tempo bertanggal kalender",
  },
  "src/lib/accurate/preview.ts": {
    jumlah: 1,
    alasan: "tanggal Accurate diurai sebagai tengah malam UTC (`accurate/dates.ts`)",
  },
  "src/app/api/t/[tenantSlug]/[companySlug]/master/opening/route.ts": {
    jumlah: 3,
    alasan: "pratinjau impor memulangkan teks tanggal yang diurai pengurai impor (tengah malam UTC) untuk diurai ulang",
  },
  "src/lib/onprem-migration.ts": {
    jumlah: 1,
    alasan: "stempel nama berkas bundel pemindahan — teknis, bukan tanggal bisnis",
  },
  "src/lib/tenant-move.ts": {
    jumlah: 1,
    alasan: "stempel nama basis data yang dipensiunkan — teknis, bukan tanggal bisnis",
  },
  "scripts/report-stack-count.ts": {
    jumlah: 1,
    alasan: "log perkakas pengembang, bukan tanggal bisnis",
  },
};

function berkasSkrip(): { rel: string; isi: string }[] {
  const akar = join(AKAR_REPO, "scripts");
  const hasil: { rel: string; isi: string }[] = [];
  const telusuri = (dir: string, rel: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (d.isDirectory()) telusuri(join(dir, d.name), `${rel}/${d.name}`);
      else if (/\.(ts|tsx|mts)$/.test(d.name)) {
        hasil.push({ rel: `${rel}/${d.name}`, isi: readFileSync(join(dir, d.name), "utf8") });
      }
    }
  };
  telusuri(akar, "scripts");
  return hasil;
}

function hitungan(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { rel, isi } of [...berkasSumber([".ts", ".tsx"]), ...berkasSkrip()]) {
    const n = (tanpaKomentar(isi).match(POLA) ?? []).length;
    if (n > 0) out[rel] = n;
  }
  return out;
}

describe("tanggal bisnis tidak dipotong dari toISOString()", () => {
  it("pemakaian bentuk UTC hanya di tempat yang disebut, dengan jumlah persis", () => {
    const diizinkan = Object.fromEntries(Object.entries(DIIZINKAN).map(([f, v]) => [f, v.jumlah]));
    expect(
      hitungan(),
      "Tanggal bisnis wajib lewat `@sai/core/business-date` (businessISODate / businessDayStart / " +
        "businessDayEnd). Bila tempat baru ini memang sah memakai UTC, daftarkan di DIIZINKAN beserta alasannya."
    ).toEqual(diizinkan);
  });

  it("setiap izin menyebut alasannya", () => {
    for (const [f, v] of Object.entries(DIIZINKAN)) expect(v.alasan.length, f).toBeGreaterThan(20);
  });
});
