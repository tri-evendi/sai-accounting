/**
 * `bun run db:seed:demo <slug-perusahaan>` — mengisi SATU perusahaan dengan tiga
 * bulan transaksi contoh yang benar-benar terbukukan (issue #355).
 *
 * ══ MASALAH YANG DISELESAIKAN ═══════════════════════════════════════════════
 *
 * Audit produksi 13 Agustus 2026: perusahaan baru punya 38 akun dan nol
 * transaksi, jadi SETIAP laporan berbunyi "Rp 0". Pengguna awam akuntansi tidak
 * bisa membedakan laporan yang BEKERJA dari laporan yang RUSAK — keduanya
 * terlihat persis sama pada hari pertama. Satu-satunya tampilan buku terisi yang
 * pernah dilihat calon pengguna adalah GAMBAR di halaman pemasaran.
 *
 * ══ KENAPA MEMPOSTING, BUKAN SEKADAR MENULIS BARIS ═════════════════════════
 *
 * `prisma/seed.ts` membuat faktur & kas tetapi TIDAK PERNAH memposting jurnal —
 * ia fixture pengembangan, bukan buku. Dipakai sebagai demo ia justru merusak
 * kepercayaan: Neraca-nya tidak seimbang dan Laba/Rugi-nya kosong meski daftar
 * fakturnya penuh, sehingga pengguna baru menyimpulkan aplikasinya salah hitung.
 *
 * Pengisinya karena itu menempuh `postForSource()` — MESIN POSTING YANG SAMA yang
 * dipakai formulir sungguhan. Konsekuensinya disengaja: angka demo mematuhi
 * aturan akuntansi yang sama, Neraca Saldo-nya seimbang, dan HPP-nya lahir dari
 * biaya rata-rata tertimbang seperti transaksi asli. Kalau mesin postingnya
 * berubah, demo ini ikut berubah — itu fitur, bukan beban.
 *
 * ══ ANGKANYA TIDAK TINGGAL DI SINI ═════════════════════════════════════════
 *
 * Sejak buku perusahaan BARU ikut diisi contoh pada akhir wisaya penyiapan
 * (14 Agustus 2026), pemanggilnya ada dua: skrip ini dan `api/setup/route.ts`.
 * Angka, urutan posting, dan hitungan "buku ini sudah dipakai" karena itu
 * tinggal di `src/lib/demo-seed.ts` — menyalinnya ke tempat kedua berarti dua
 * kumpulan angka yang akan berpisah diam-diam pada perubahan pertama.
 *
 * Yang tinggal di berkas ini hanyalah yang memang MILIK baris perintah: memilih
 * perusahaan, menolak dengan kalimat yang menyebut angkanya, dan — satu-satunya
 * perbedaan perilaku yang sesungguhnya — MENANDAI perusahaannya `is_demo`.
 * Route penyiapan sengaja TIDAK menandainya: buku itu milik pelanggan, dan
 * bendera itu akan membuatnya hanya-baca.
 *
 * ══ DETERMINISTIK, BUKAN ACAK ══════════════════════════════════════════════
 *
 * Tanpa satu pun `Math.random()`. Demo yang berubah tiap dijalankan tak bisa
 * dijadikan rujukan: tangkapan layar dokumentasi basi seketika, dan laporan bug
 * "angkanya beda dengan di panduan" tak bisa ditelusuri. Tanggalnya relatif
 * terhadap `--today` (bawaan: hari ini) supaya demonya selalu "tiga bulan
 * terakhir", tetapi POLANYA sama persis setiap kali.
 *
 * ══ PAGAR PENGAMAN ═════════════════════════════════════════════════════════
 *
 * Ini aplikasi akuntansi: data contoh yang keliru dianggap buku sungguhan adalah
 * kesalahan yang mahal. Karena itu:
 *
 *   • Perusahaannya WAJIB disebut eksplisit lewat argumen — tidak ada bawaan,
 *     tidak ada "kalau cuma satu, pakai yang itu".
 *   • Skrip MENOLAK bila perusahaan itu sudah punya transaksi. Buku yang sudah
 *     dipakai tidak pernah disentuh, bahkan kalau slug-nya salah ketik.
 *   • Setiap catatan diberi keterangan berawalan `[CONTOH]`, jadi baris demo
 *     yang tercecer selalu bisa dikenali di layar mana pun.
 *   • Tidak ada mode "semua perusahaan" dan tidak ada `--force`.
 *
 * Skrip/cron TIDAK lahir dari sebuah permintaan HTTP, jadi seluruh pekerjaannya
 * dibungkus `runWithCompany()` (doktrin #104) — tanpa itu setiap query melempar.
 */

/*
 * Impor RELATIF dan `dotenv/config` lebih dulu — pola yang sama dengan
 * `verify-local-setup.ts`, dan bukan selera: `lib/company-registry.ts` diawali
 * `import "server-only"`, yang tidak bisa diselesaikan di luar bundler Next.
 * Skrip `tsx` yang menyentuhnya mati sebelum baris pertamanya berjalan. Karena
 * itu perusahaannya dibaca langsung dari basis data kendali di bawah, dan
 * `CompanyContext`-nya dirakit di sini.
 */
import "dotenv/config";
import { controlDb } from "../src/lib/control-db";
import { runWithCompany, type CompanyContext } from "../src/lib/company-context";
import { bookActivity, seedSampleBook, SAMPLE_TAG } from "../src/lib/demo-seed";

interface Args {
  /** Salah satu dari keduanya terisi; `--id` menang bila dua-duanya ada. */
  slug: string | null;
  companyId: number | null;
  today: Date;
}

function parseArgs(argv: string[]): Args {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const slug = positional[0] ?? null;

  const idArg = argv.find((a) => a.startsWith("--id="))?.slice("--id=".length);
  const companyId = idArg ? Number.parseInt(idArg, 10) : null;
  if (idArg && (companyId === null || Number.isNaN(companyId))) {
    throw new Error(`--id bukan angka: ${idArg}`);
  }

  if (!slug && companyId === null) {
    throw new Error(
      "Sebutkan perusahaannya: bun run db:seed:demo <slug-perusahaan>\n" +
        "atau, bila slug-nya dipakai lebih dari satu tenant: bun run db:seed:demo --id=<id>\n" +
        "Tidak ada nilai bawaan — mengisi perusahaan yang keliru dengan data contoh " +
        "jauh lebih mahal daripada mengetik slug-nya."
    );
  }
  const todayArg = argv.find((a) => a.startsWith("--today="))?.slice("--today=".length);
  const today = todayArg ? new Date(`${todayArg}T12:00:00`) : new Date();
  if (Number.isNaN(today.getTime())) {
    throw new Error(`--today bukan tanggal yang sah: ${todayArg}`);
  }
  return { slug, companyId, today };
}

/**
 * Buku yang SUDAH DIPAKAI tidak pernah disentuh.
 *
 * Hitungannya sendiri ada di `lib/demo-seed.ts` (`bookActivity`) — dipakai
 * bersama route penyiapan, supaya "buku ini masih kosong" tidak pernah berarti
 * dua hal berbeda di dua tempat. Yang tinggal di sini hanyalah KALIMATNYA:
 * skrip berhenti dengan galat yang menyebut angkanya, sedangkan route diam-diam
 * melewati pengisian. Penolakan yang sama, akibat yang sengaja berbeda.
 */
async function refuseIfInUse(): Promise<void> {
  const used = await bookActivity();
  if (used.total > 0) {
    throw new Error(
      `Perusahaan ini sudah punya transaksi (faktur ${used.invoices}, kas ${used.cash}, ` +
        `pembelian ${used.purchases}, jurnal non-pembuka ${used.journals}). ` +
        "Skrip demo berhenti — buku yang sudah dipakai tidak pernah diisi data contoh."
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  /* `--id` menang: ia dipakai justru untuk membedah slug yang ambigu. */
  const companyId = args.companyId ?? (await slugToId(args.slug as string));
  const row = await controlDb.company.findUnique({
    where: { id: companyId },
    select: { id: true, slug: true, name: true, databaseName: true, isActive: true },
  });
  if (!row) {
    throw new Error(`Perusahaan dengan id ${companyId} tidak ditemukan di basis data kendali.`);
  }
  if (!row.isActive) {
    throw new Error(`Perusahaan "${row.slug}" nonaktif. Skrip demo berhenti.`);
  }
  const company: CompanyContext = {
    companyId: row.id,
    slug: row.slug,
    databaseName: row.databaseName,
  };

  console.log(`\nMengisi data contoh ke: ${row.name} (${row.slug})`);
  console.log(`Periode: tiga bulan sebelum ${args.today.toISOString().slice(0, 10)}\n`);

  await runWithCompany(company, async () => {
    await refuseIfInUse();
    await seedSampleBook({ today: args.today, onStep: (m) => console.log(`  ✓ ${m}`) });
  });

  /*
   * Perusahaannya DITANDAI demo setelah isinya jadi, bukan sebelum (issue #355).
   *
   * Urutannya penting: `is_demo` menyalakan gerbang tulis di kedua penjaga, dan
   * menandainya lebih dulu berarti skrip ini memblokir dirinya sendiri kalau
   * suatu saat ia dijalankan lewat jalur yang melewati penjaga. Ditandai di
   * akhir, buku yang setengah terisi juga tidak pernah sempat berspanduk
   * "contoh" tanpa isi contohnya.
   */
  await controlDb.company.update({ where: { id: companyId }, data: { isDemo: true } });
  /*
   * TANPA `invalidateCompany()` — dan itu disengaja, bukan kelalaian.
   *
   * Fungsi itu tinggal di `lib/company-registry.ts`, yang diawali
   * `import "server-only"`; skrip `tsx` yang menyentuhnya mati sebelum baris
   * pertamanya berjalan (terbukti sekali saat berkas ini ditulis, dan dijaga
   * `tests/seed-demo.test.ts`).
   *
   * Ia juga tidak akan berguna: cache registry hidup di dalam PROSES aplikasi,
   * sedangkan skrip ini proses terpisah — memanggilnya di sini hanya akan
   * mengosongkan cache milik dirinya sendiri, yang seketika mati bersamanya.
   * Cache aplikasinya kedaluwarsa sendiri dalam 60 detik (TTL registry).
   */

  console.log(
    `\nSelesai. Buka Pusat Laporan — Laba/Rugi, Neraca, dan Arus Kas kini terisi.\n` +
      `Setiap baris contoh diberi awalan "${SAMPLE_TAG}" supaya mudah dikenali.\n`
  );
}

/**
 * Slug → id, lewat basis data kendali.
 *
 * `findFirst`, bukan `findUnique`: slug perusahaan unik PER TENANT
 * (`@@unique([tenantId, slug])`), bukan unik global — dua tenant boleh
 * sama-sama punya "pt-maju". Skrip ini menolak bila slug-nya ambigu daripada
 * diam-diam memilih salah satunya; mengisi buku tenant yang keliru dengan data
 * contoh adalah persis kesalahan yang seluruh pagar di berkas ini cegah.
 */
async function slugToId(slug: string): Promise<number> {
  const rows = await controlDb.company.findMany({
    where: { slug },
    select: { id: true, name: true, tenantId: true },
  });
  if (rows.length === 0) {
    throw new Error(`Perusahaan "${slug}" tidak ditemukan di basis data kendali.`);
  }
  if (rows.length > 1) {
    const daftar = rows.map((r) => `  • id=${r.id} tenant=${r.tenantId} — ${r.name}`).join("\n");
    throw new Error(
      `Slug "${slug}" dipakai ${rows.length} perusahaan di tenant berbeda:\n${daftar}\n` +
        "Skrip berhenti — sebutkan id perusahaannya lewat --id=<id>."
    );
  }
  return rows[0].id;
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
