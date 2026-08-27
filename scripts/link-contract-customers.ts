/**
 * Tautkan pembeli kontrak ke master Pelanggan (migrasi 0057).
 *
 * ══ KENAPA ADA SKRIP, PADAHAL MIGRASINYA SUDAH MENAUTKAN ═══════════════════
 * Migrasi 0057 menautkan yang namanya cocok PERSIS ke tepat satu pelanggan. Di
 * buku yang sudah berjalan, hasilnya bisa NOL — dan memang nol di `pt-sai`:
 * 609 kontrak menyebut 78 pembeli, sementara master `customers` hanya berisi 4
 * baris, tak satu pun di antaranya seorang pembeli kontrak. Master pelanggan
 * tidak pernah diisi; pembeli sesungguhnya hidup hanya sebagai teks di kontrak.
 *
 * Migrasi tidak boleh menyelesaikan itu. Membuat 78 baris master data dari teks
 * bebas adalah keputusan tentang SIAPA pelanggan perusahaan ini — pekerjaan
 * yang harus dilihat manusia lebih dulu, sekali, dengan angkanya di depan mata.
 * Karena itu ia hidup di sini: BACA dulu, tulis hanya bila diminta.
 *
 * ══ ATURAN PENJODOHAN ══════════════════════════════════════════════════════
 * Nama dinormalkan (dirapatkan spasinya, dihuruf-kecilkan) — sama dengan
 * migrasi 0052/0057 — LALU entitas HTML-nya dibuka. Yang terakhir itu sengaja
 * lebih longgar daripada migrasinya, dan hanya boleh lebih longgar di sini:
 * migrasi berjalan sendiri tanpa ditonton siapa pun, skrip ini melaporkan
 * setiap pembukaan yang dilakukannya dan menunggu `--tautkan`.
 *
 * Ia berarti: `Foshan Taste Import &amp; Export Co., Ltd` (40 kontrak) dan
 * `Foshan Taste Import & Export Co., Ltd` (77 kontrak) dikenali sebagai SATU
 * perusahaan, bukan dua. Teks di kontraknya sendiri TIDAK diubah — `buyer`
 * adalah snapshot dokumen, dan yang salah cetak di sana tetap tercetak begitu.
 * Yang disatukan adalah tautannya.
 *
 * Nama yang cocok ke LEBIH DARI SATU pelanggan tidak pernah ditebak; ia
 * dilaporkan dan dibiarkan NULL, persis sikap migrasi 0052.
 *
 * ══ PEMAKAIAN ══════════════════════════════════════════════════════════════
 *   bunx tsx scripts/link-contract-customers.ts                 # laporan saja
 *   bunx tsx scripts/link-contract-customers.ts --tautkan       # tautkan yang cocok
 *   bunx tsx scripts/link-contract-customers.ts --buat-pelanggan --tautkan
 *   … --perusahaan=pt-sai                                       # satu buku saja
 *
 * Keluar dengan kode bukan nol bila masih ada kontrak yang belum tertaut
 * setelah pekerjaan yang diminta selesai, jadi ia bisa dipasang di rilis dan
 * berbunyi sendiri.
 */
import "dotenv/config";

import { controlDb } from "../src/lib/control-db";
import { runWithCompany } from "../src/lib/company-context";
import { prisma } from "../src/lib/prisma";
import {
  aliasTakTerpakai,
  kunciPembeli,
  namaMasterDariTeks,
  punyaEntitasHtml,
  susunAliasIndex,
  type AliasIndex,
} from "../src/lib/contract-buyer-match";
import { CONTRACT_BUYER_ALIASES } from "./data/contract-buyer-aliases";

const TAUTKAN = process.argv.includes("--tautkan");
const BUAT = process.argv.includes("--buat-pelanggan");
const SLUG = process.argv
  .find((a) => a.startsWith("--perusahaan="))
  ?.slice("--perusahaan=".length);

/* Aturan penjodohannya hidup di modul MURNI supaya bisa diuji tanpa MySQL —
   lihat `src/lib/contract-buyer-match.ts` untuk alasan setiap langkahnya. */

interface Ringkasan {
  slug: string;
  kontrak: number;
  sudahTertaut: number;
  /** Mode baca: berapa kontrak yang AKAN tertaut bila `--tautkan` diberikan. */
  akanTertaut: number;
  tertautSekarang: number;
  pelangganDibuat: number;
  ambigu: { nama: string; kontrak: number; calon: string[] }[];
  belumAda: { nama: string; kontrak: number }[];
  entitas: { nama: string; kontrak: number; bersih: string }[];
  /** Ejaan yang DISATUKAN berkas alias — dilaporkan supaya keputusannya terlihat. */
  aliasDipakai: { kanonik: string; ejaan: number; kontrak: number }[];
  /** Alias yang tak cocok ke satu teks pun — berkasnya mulai membusuk. */
  aliasYatim: string[];
  sisaNull: number;
}

async function kerjakanSatuBuku(slug: string, alias: AliasIndex): Promise<Ringkasan> {
  const r: Ringkasan = {
    slug,
    kontrak: 0,
    sudahTertaut: 0,
    akanTertaut: 0,
    tertautSekarang: 0,
    pelangganDibuat: 0,
    ambigu: [],
    belumAda: [],
    entitas: [],
    aliasDipakai: [],
    aliasYatim: [],
    sisaNull: 0,
  };

  const kontrak = await prisma.contract.findMany({
    select: { id: true, buyer: true, customerId: true },
    orderBy: { id: "asc" },
  });
  r.kontrak = kontrak.length;
  r.sudahTertaut = kontrak.filter((c) => c.customerId != null).length;
  if (kontrak.length === 0) return r;

  const pelanggan = await prisma.customer.findMany({ select: { id: true, name: true } });
  /* Peta kunci → daftar id. DAFTAR, bukan satu id: dua baris master yang
     namanya sama setelah dinormalkan adalah justru kasus yang tidak boleh
     ditebak, dan ia hanya terlihat kalau keduanya disimpan. */
  const masterByKunci = new Map<string, number[]>();
  for (const p of pelanggan) {
    const k = kunciPembeli(p.name, alias);
    masterByKunci.set(k, [...(masterByKunci.get(k) ?? []), p.id]);
  }

  // Kelompokkan kontrak yang belum tertaut menurut kunci pembelinya.
  const perKunci = new Map<string, { contoh: string; ids: number[]; ejaan: Set<string> }>();
  for (const c of kontrak) {
    if (c.customerId != null) continue;
    const k = kunciPembeli(c.buyer, alias);
    const slot = perKunci.get(k) ?? { contoh: c.buyer, ids: [], ejaan: new Set<string>() };
    slot.ids.push(c.id);
    slot.ejaan.add(c.buyer);
    perKunci.set(k, slot);
  }

  // Ejaan yang RUNTUH jadi satu adalah kerja berkas alias — dilaporkan supaya
  // keputusan manusia itu terlihat di keluaran, bukan hanya terjadi diam-diam.
  for (const [, slot] of perKunci) {
    if (slot.ejaan.size > 1) {
      r.aliasDipakai.push({
        kanonik: namaMasterDariTeks(slot.contoh, alias),
        ejaan: slot.ejaan.size,
        kontrak: slot.ids.length,
      });
    }
  }
  r.aliasYatim = aliasTakTerpakai(alias, kontrak.map((c) => c.buyer));

  for (const [k, { contoh, ids }] of perKunci) {
    if (punyaEntitasHtml(contoh)) {
      r.entitas.push({ nama: contoh, kontrak: ids.length, bersih: namaMasterDariTeks(contoh, alias) });
    }

    let calon = masterByKunci.get(k) ?? [];

    if (calon.length > 1) {
      r.ambigu.push({
        nama: contoh,
        kontrak: ids.length,
        calon: pelanggan.filter((p) => calon.includes(p.id)).map((p) => `#${p.id} ${p.name}`),
      });
      continue;
    }

    if (calon.length === 0) {
      if (!(BUAT && TAUTKAN)) {
        // Belum ada padanannya di master, dan skrip tidak diminta membuatnya.
        r.belumAda.push({ nama: contoh, kontrak: ids.length });
        continue;
      }
      /* Nama yang DIBUAT adalah versi bersihnya, bukan teks mentahnya: master
         data yang lahir hari ini tidak punya alasan membawa `&amp;` warisan.
         Teks di kontraknya sendiri tetap apa adanya. */
      const nama = namaMasterDariTeks(contoh, alias);
      const dibuat = await prisma.customer.create({ data: { name: nama } });
      r.pelangganDibuat += 1;
      calon = [dibuat.id];
      masterByKunci.set(k, calon);
    }

    // Sampai di sini `calon` berisi TEPAT SATU pelanggan.
    if (!TAUTKAN) {
      /* Mode baca: dihitung sebagai "akan tertaut", BUKAN dilaporkan sebagai
         belum ada di master — dua hal itu menuntut tindakan yang berbeda dari
         pembacanya, dan menyamakannya membuat laporan ini menyesatkan justru
         pada angka yang dipakai untuk memutuskan. */
      r.akanTertaut += ids.length;
      continue;
    }

    const { count } = await prisma.contract.updateMany({
      where: { id: { in: ids }, customerId: null },
      data: { customerId: calon[0] },
    });
    r.tertautSekarang += count;
  }

  r.sisaNull = await prisma.contract.count({ where: { customerId: null } });
  return r;
}

function laporkan(r: Ringkasan): void {
  console.log(`\n── ${r.slug} ──`);
  console.log(
    `  kontrak ${r.kontrak} · sudah tertaut ${r.sudahTertaut} · ` +
      (TAUTKAN
        ? `tertaut sekarang ${r.tertautSekarang} · pelanggan dibuat ${r.pelangganDibuat} · `
        : `akan tertaut ${r.akanTertaut} · `) +
      `belum tertaut ${r.sisaNull}`
  );
  for (const a of r.aliasDipakai) {
    console.log(`  ⋈ alias: ${a.ejaan} ejaan → "${a.kanonik}" (${a.kontrak} kontrak)`);
  }
  for (const y of r.aliasYatim) {
    console.log(`  ⚠ alias tak terpakai (data mungkin sudah bersih): "${y}"`);
  }
  for (const a of r.ambigu) {
    console.log(`  ⚠ ambigu: "${a.nama}" (${a.kontrak} kontrak) → ${a.calon.join(" | ")}`);
  }
  for (const e of r.entitas) {
    console.log(`  ⚠ entitas HTML di teks kontrak: "${e.nama}" (${e.kontrak}) → "${e.bersih}"`);
  }
  for (const b of r.belumAda) {
    console.log(`  · belum di master: "${b.nama}" (${b.kontrak} kontrak)`);
  }
}

async function main() {
  if (!process.env.CONTROL_DATABASE_URL) {
    console.error("CONTROL_DATABASE_URL belum diset.");
    process.exit(1);
  }

  console.log(
    TAUTKAN
      ? `MODE TULIS — menautkan${BUAT ? " dan membuat pelanggan yang belum ada" : ""}.`
      : "MODE BACA — tidak ada satu baris pun yang ditulis. Tambahkan --tautkan untuk menerapkan."
  );
  if (BUAT && !TAUTKAN) {
    console.log("(--buat-pelanggan diabaikan tanpa --tautkan.)");
  }

  const companies = await controlDb.company.findMany({
    where: { isActive: true, ...(SLUG ? { slug: SLUG } : {}) },
    select: { id: true, slug: true, databaseName: true },
    orderBy: { id: "asc" },
  });

  /*
   * Berkas alias disusun & DIPERIKSA lebih dulu, sebelum satu baris pun dibaca.
   * Sebuah ejaan yang terdaftar di dua nama kanonik tidak punya jawaban yang
   * benar, dan menjalankannya setengah jalan berarti sebagian kontrak tertaut
   * menurut tafsir yang kemudian dibatalkan. Berhenti sekarang lebih murah.
   */
  const aliasPerBuku = new Map<string, AliasIndex>();
  let konflikAda = false;
  for (const [slug, peta] of Object.entries(CONTRACT_BUYER_ALIASES)) {
    const { index, konflik } = susunAliasIndex(peta);
    for (const k of konflik) {
      konflikAda = true;
      console.error(
        `Berkas alias bertentangan di "${slug}": ejaan "${k.alias}" didaftarkan ` +
          `pada ${k.kanonik.length} nama kanonik — ${k.kanonik.join(" | ")}`
      );
    }
    aliasPerBuku.set(slug, index);
  }
  if (konflikAda) {
    console.error("Perbaiki scripts/data/contract-buyer-aliases.ts lebih dulu.");
    process.exit(1);
  }
  if (companies.length === 0) {
    console.error(SLUG ? `Perusahaan "${SLUG}" tidak ditemukan.` : "Tidak ada perusahaan aktif.");
    process.exit(1);
  }

  let sisa = 0;
  let gagal = 0;
  for (const c of companies) {
    try {
      // Satu buku yang gagal dibaca tidak menghentikan buku lain — doktrin yang
      // sama dengan `run-recurring.ts`.
      const r = await runWithCompany(
        { companyId: c.id, slug: c.slug, databaseName: c.databaseName },
        () => kerjakanSatuBuku(c.slug, aliasPerBuku.get(c.slug) ?? new Map())
      );
      if (r.kontrak > 0) laporkan(r);
      sisa += r.sisaNull;
    } catch (error) {
      gagal += 1;
      console.error(`  ${c.slug}: buku gagal dibaca — ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(`\nKontrak yang masih tanpa tautan pelanggan: ${sisa}`);
  if (sisa > 0) {
    console.log(
      "Selama NULL, faktur atas kontrak itu tidak diperiksa pihaknya — persis seperti sebelum migrasi 0057."
    );
  }
  process.exit(gagal > 0 || sisa > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
