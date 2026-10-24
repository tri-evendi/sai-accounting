/**
 * PPh Final UMKM — pengumpul angka dari buku (server). Aturannya di
 * `lib/pph-final-umkm.ts`, diuji tanpa basis data.
 *
 * PEREDARAN BRUTO = mutasi bersih akun bertipe `revenue` (penjualan dikurangi
 * retur yang dicatat di akun pendapatan) per bulan kalender Jakarta, TANPA
 * jurnal penutup tahunan (`NOT_CLOSING`) — sama dengan Laba Rugi. Pendapatan
 * lain-lain (`other_income`: bunga, selisih kurs, laba pelepasan aset) tidak
 * ikut: itu bukan peredaran bruto usaha, dan sebagian sudah dipotong PPh final
 * tersendiri di sumbernya.
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { businessDate, businessParts } from "@sai/core/business-date";
import { NOT_CLOSING } from "@/lib/year-close";

/** Peredaran bruto Januari–Desember tahun `year` (12 angka). */
export async function monthlyGrossRevenue(year: number, client = prisma): Promise<number[]> {
  /* `businessDate` memakai indeks bulan 0 (pola `new Date`). */
  const from = businessDate(year, 0, 1);
  const to = new Date(businessDate(year + 1, 0, 1).getTime() - 1);
  const lines = await client.journalLine.findMany({
    where: {
      account: { type: "revenue" },
      journal: { date: { gte: from, lte: to }, ...NOT_CLOSING },
    },
    select: { baseDebit: true, baseCredit: true, journal: { select: { date: true } } },
  });
  const months = Array.from({ length: 12 }, () => 0);
  for (const l of lines) {
    const m = businessParts(l.journal.date).month; // 0–11
    months[m] += Number(l.baseCredit) - Number(l.baseDebit);
  }
  return months.map((v) => Math.round(v * 100) / 100);
}

/** Setelan PPh Final perusahaan ini (NULL bila wisaya belum dijalankan). */
export async function readPphFinalSetting(client = prisma) {
  const s = await client.companySetting.findFirst({
    orderBy: { id: "asc" },
    select: { id: true, pphFinalUmkm: true, pphFinalUmkmStartYear: true },
  });
  return s;
}
