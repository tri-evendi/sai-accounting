/**
 * BUKTI: cadangan bisa DIPULIHKAN (issue #374; tata letak per tenant, tahap 1b).
 *
 *   bun run prove-backup-restore                     # putaran terbaru
 *   bun run prove-backup-restore --key <putaran>     # putaran tertentu
 *   bun run prove-backup-restore --key <nama.enc>    # artefak LAMA (satu berkas)
 *
 * ══ KENAPA SKRIP INI ADA, DAN KENAPA IA YANG PALING PENTING ════════════════
 * Sebuah cadangan yang tidak pernah dipulihkan bukan cadangan — ia file yang
 * kita HARAP berisi sesuatu. Setiap kegagalan pemulihan yang pernah saya baca
 * riwayatnya punya bentuk yang sama: cadangannya berjalan bertahun-tahun,
 * lampu hijau setiap hari, dan baru pada hari kejadian ketahuan bahwa
 * dumpnya kosong / sandinya salah / satu basis data tidak pernah ikut.
 *
 * Yang mengubah harapan menjadi pengetahuan cuma satu hal: benar-benar
 * memulihkannya, secara rutin, sebelum ada yang membutuhkannya.
 *
 * ══ DUA TATA LETAK, DAN KEDUANYA WAJIB BISA DIBACA ═════════════════════════
 * Sejak tahap 1b jalur `tenant` menulis satu OBJEK PER BASIS DATA di dalam satu
 * direktori putaran, bukan satu arsip raksasa (celah on-premise #5; §6). Tapi
 * pada hari cut-over, artefak TERBARU yang ada justru masih berbentuk lama —
 * dan pembukti yang hanya mengerti bentuk baru akan menolak satu-satunya
 * salinan yang ada, justru pada hari ia paling dibutuhkan.
 *
 * Itu bukan kehati-hatian baru. Berkas ini sudah menerapkan aturan yang sama
 * untuk dump MariaDB sesudah penukaran PostgreSQL: yang diperiksa ARTEFAKNYA,
 * bukan mesin atau versi yang sedang dipakai.
 *
 * ══ APA YANG DIBUKTIKAN (tata letak baru) ══════════════════════════════════
 *   1. Manifestnya ada dan terbaca TANPA kunci — pada hari pemulihan, basis
 *      data kendali bisa persis yang hilang.
 *   2. SETIAP objek yang disebut manifest benar-benar ada, dan sidik jarinya
 *      cocok. Bukan satu objek: satu dump PT yang rusak tidak boleh
 *      tersembunyi di balik putaran yang "lampu hijau".
 *   3. Sandinya BENAR — setiap objek didekripsi.
 *   4. Setiap objek basis data benar-benar dump PostgreSQL: dibuktikan
 *      `pg_restore --list`, yang membaca katalognya tanpa memuat satu baris
 *      pun ke mana pun.
 *   5. SETIAP basis data yang terdaftar di registry punya objeknya sendiri —
 *      itulah aturan kelengkapan §6, dan ia tidak bisa dijawab oleh dump besar.
 *   6. Peran & hak akses ikut (`globals.sql.enc`), dan berkas dokumen & jejak
 *      audit ikut (#367/#370).
 *
 * ══ APA YANG TIDAK DILAKUKAN ═══════════════════════════════════════════════
 * TIDAK memuat dumpnya ke basis data mana pun. Skrip ini hanya-baca terhadap
 * seluruh dunia: satu perintah `psql <` yang salah sasaran akan menimpa
 * produksi dengan data lama, dan tidak ada nilai pembuktian yang sepadan
 * dengan risiko itu. Pemuatan sungguhan ke server bayangan adalah LATIHAN
 * KUARTALAN yang dijalankan manusia, dengan tujuan yang ia ketik sendiri.
 * Berkas hasil dekripsi ditinggalkan (dan jalurnya dicetak) supaya latihan itu
 * tinggal melanjutkan.
 */

import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { buatAdapter } from "@sai/db/adapter";
import { PrismaClient as ControlClient } from "@sai/db/client/control";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function run(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const s3Args = process.env.BACKUP_S3_ENDPOINT
  ? ["--endpoint-url", process.env.BACKUP_S3_ENDPOINT]
  : [];

/** Bentuk manifest yang ditulis jalur `tenant` — lihat `internal/backup/manifest.go`. */
interface Manifest {
  versi: number;
  putaran: string;
  enkripsi: string;
  versiServer: number;
  objek: {
    kunci: string;
    jenis: "database" | "globals" | "files";
    basis?: string;
    peran?: string;
    companyId?: number;
    bytes: number;
    sha256: string;
  }[];
  perusahaanTerdaftar: number;
}

const NAMA_MANIFEST = "manifest.json";

/* ══ SUMBER: S3 bila bucket disetel, kalau tidak CAKRAM ════════════════════
 *
 * Sampai 12 Okt 2026 skrip ini menuntut `BACKUP_S3_BUCKET` dan berhenti tanpa
 * itu. Lalu jalur cadangan belajar menyimpan ke cakram ketika bucket belum ada
 * — dan pembuktian yang tidak bisa membaca satu-satunya artefak yang ADA adalah
 * pembuktian yang tidak membuktikan apa pun. Sebuah cadangan yang belum pernah
 * dibuka bukan cadangan, dan itu berlaku untuk artefak lokal persis seperti
 * untuk artefak di S3.
 */
interface Sumber {
  /** Teks yang dicetak ke manusia. */
  nama: string;
  /** Daftar isi tingkat pertama: direktori putaran DAN berkas warisan. */
  daftar(): { putaran: string[]; berkasLama: string[] };
  /** Ambil satu objek ke direktori kerja. */
  ambil(relatif: string, tujuan: string): void;
  /** Apakah objek ini ada tanpa mengunduhnya. */
  ada(relatif: string): boolean;
}

function sumberCakram(akar: string): Sumber {
  return {
    nama: akar,
    daftar() {
      if (!existsSync(akar)) return { putaran: [], berkasLama: [] };
      const entri = readdirSync(akar, { withFileTypes: true });
      return {
        putaran: entri.filter((d) => d.isDirectory()).map((d) => d.name),
        berkasLama: entri
          .filter((d) => d.isFile() && d.name.endsWith(".tar.gz.enc"))
          .map((d) => d.name),
      };
    },
    ambil(relatif, tujuan) {
      /* DISALIN ke direktori kerja, tidak dibaca di tempat: langkah dekripsi
         menulis hasilnya di sebelah berkas sumbernya, dan direktori cadangan
         adalah satu-satunya tempat artefak itu ada. Pembuktian tidak boleh
         menyentuh apa yang dibuktikannya. */
      copyFileSync(path.join(akar, relatif), tujuan);
    },
    ada(relatif) {
      return existsSync(path.join(akar, relatif));
    },
  };
}

function sumberS3(bucket: string, prefix: string): Sumber {
  const base = `s3://${bucket}/${prefix}`;
  return {
    nama: base,
    daftar() {
      const baris = run("aws", ["s3", "ls", ...s3Args, `${base}/`]).split("\n");
      const putaran: string[] = [];
      const berkasLama: string[] = [];
      for (const b of baris) {
        const t = b.trim();
        if (t.startsWith("PRE ")) {
          putaran.push(t.slice(4).replace(/\/$/, ""));
          continue;
        }
        const nama = t.split(/\s+/).pop() ?? "";
        if (nama.endsWith(".tar.gz.enc")) berkasLama.push(nama);
      }
      return { putaran, berkasLama };
    },
    ambil(relatif, tujuan) {
      run("aws", ["s3", "cp", ...s3Args, `${base}/${relatif}`, tujuan]);
    },
    ada(relatif) {
      try {
        /* `ls` pada kunci PENUH memulangkan nol baris bila ia tidak ada, dan
           keluar dengan kode 1 — jadi ketiadaannya terbaca dari keduanya. */
        return run("aws", ["s3", "ls", ...s3Args, `${base}/${relatif}`]).trim().length > 0;
      } catch {
        return false;
      }
    },
  };
}

function sidikJari(berkas: string): string {
  return createHash("sha256").update(readFileSync(berkas)).digest("hex");
}

/** Dekripsi satu objek; memulangkan jalur hasilnya. */
function dekripsi(tersandi: string): string {
  const keluar = tersandi.replace(/\.enc$/, "");
  try {
    execFileSync(
      "openssl",
      ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000",
       "-in", tersandi, "-out", keluar, "-pass", "env:BACKUP_ENCRYPTION_KEY"],
      { stdio: "pipe" }
    );
  } catch {
    fail(
      `DEKRIPSI GAGAL pada ${path.basename(tersandi)} — BACKUP_ENCRYPTION_KEY yang\n` +
        "  dipakai sekarang bukan yang dipakai saat cadangan ini dibuat. Setiap\n" +
        "  cadangan sebelum kunci berubah TIDAK BISA DIBUKA; cari kunci lamanya\n" +
        "  sebelum melakukan apa pun."
    );
  }
  return keluar;
}

async function basisDataTerdaftar(): Promise<{ nama: string; slug: string }[] | null> {
  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!controlUrl) return null;
  const url = new URL(controlUrl);
  const control = new ControlClient({
    adapter: buatAdapter(url.toString(), { batasKoneksi: 1 }),
  });
  try {
    const companies = await control.company.findMany({
      select: { slug: true, databaseName: true },
      orderBy: { id: "asc" },
    });
    return companies.map((c) => ({ nama: c.databaseName, slug: c.slug }));
  } finally {
    await control.$disconnect();
  }
}

/* ── Tata letak BARU: satu objek per basis data ─────────────────────────── */

async function buktikanPutaran(sumber: Sumber, putaran: string, kerja: string): Promise<void> {
  console.log(`Putaran yang diuji: ${putaran}`);

  /* ── 1. Manifest, dan ia dibaca TANPA kunci ───────────────────────────
   *
   * Satu-satunya objek yang tidak tersandi, dengan sengaja: pada hari
   * pemulihan basis data kendali bisa PERSIS yang hilang, dan baris riwayat
   * yang menjelaskan di mana dump setiap PT berada hilang bersamanya. Manifest
   * yang menuntut kunci untuk dibaca tidak bisa menjawab "apa saja yang ada di
   * dalam putaran ini" sebelum kuncinya ditemukan.
   */
  const manifestLokal = path.join(kerja, NAMA_MANIFEST);
  if (!sumber.ada(`${putaran}/${NAMA_MANIFEST}`)) {
    fail(
      `putaran ${putaran} TIDAK punya ${NAMA_MANIFEST}.\n` +
        "  Manifest ditulis PALING AKHIR, jadi ketiadaannya berarti putaran itu\n" +
        "  BERHENTI DI TENGAH — objek yang ada di dalamnya tidak lengkap, dan\n" +
        "  tidak ada yang bisa mengatakan apa yang kurang. Pakai putaran sebelumnya."
    );
  }
  sumber.ambil(`${putaran}/${NAMA_MANIFEST}`, manifestLokal);

  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestLokal, "utf8")) as Manifest;
  } catch (e) {
    fail(`${NAMA_MANIFEST} tidak bisa diurai: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!Array.isArray(manifest.objek) || manifest.objek.length === 0) {
    fail(`${NAMA_MANIFEST} tidak menyebut satu objek pun.`);
  }
  console.log(
    `✓ manifest terbaca: ${manifest.objek.length} objek, ` +
      `server PostgreSQL ${manifest.versiServer}, sandi "${manifest.enkripsi}"`
  );

  /* ── 2+3+4. SETIAP objek: ada, cocok, terbuka, dan benar isinya ───────
   *
   * Setiap objek, bukan satu: satu dump PT yang rusak tidak boleh tersembunyi
   * di balik putaran yang "lampu hijau". Itu bentuk kegagalan yang persis sama
   * dengan "cadangan yang kehilangan satu PT" — ia gagal untuk satu customer
   * saja, dan karena itu paling mudah tidak terlihat.
   */
  const dibukaBasis: { basis: string; jalur: string }[] = [];
  let adaGlobals = false;
  let adaBerkas = false;
  let totalByte = 0;

  for (const o of manifest.objek) {
    const relatif = `${putaran}/${o.kunci}`;
    if (!sumber.ada(relatif)) {
      fail(
        `objek ${o.kunci} DISEBUT manifest tapi tidak ada di ${sumber.nama}/${putaran}/.\n` +
          "  Manifest yang menjanjikan objek yang tidak ada adalah janji yang baru\n" +
          "  ditemukan salah pada hari pemulihan."
      );
    }
    const lokal = path.join(kerja, o.kunci);
    sumber.ambil(relatif, lokal);

    const terhitung = sidikJari(lokal);
    if (terhitung !== o.sha256) {
      fail(
        `SIDIK JARI TIDAK COCOK pada ${o.kunci} — berkasnya rusak di penyimpanan\n` +
          `  atau di jalan. AES-CBC tidak membawa pemeriksaan keutuhan sendiri,\n` +
          `  jadi angka inilah satu-satunya yang bisa membantahnya.\n` +
          `  tercatat : ${o.sha256}\n  terhitung: ${terhitung}`
      );
    }
    const ukuran = statSync(lokal).size;
    totalByte += ukuran;

    const terbuka = dekripsi(lokal);

    switch (o.jenis) {
      case "database": {
        /* `pg_restore --list` membaca KATALOG dump format custom tanpa memuat
           satu baris pun ke mana pun. Ia membuktikan dua hal sekaligus yang
           pemeriksaan "memuat teks .sql" tidak bisa: bahwa berkasnya memang
           dump PostgreSQL, dan bahwa katalognya utuh. */
        let daftar: string;
        try {
          daftar = run("pg_restore", ["--list", terbuka]);
        } catch {
          fail(
            `${o.kunci} terbuka tapi BUKAN dump PostgreSQL yang bisa dibaca\n` +
              "  `pg_restore --list`. Dekripsinya berhasil, jadi sandinya benar —\n" +
              "  yang salah isinya."
          );
        }
        const entri = daftar.split("\n").filter((b) => b.trim() && !b.startsWith(";")).length;
        console.log(`✓ ${o.basis ?? o.kunci}: ${entri} entri katalog (${(ukuran / 1024 / 1024).toFixed(1)} MB)`);
        dibukaBasis.push({ basis: o.basis ?? o.kunci, jalur: terbuka });
        break;
      }
      case "globals": {
        /* Peran & hak akses. Dump per basis data tidak memuat satu pun peran,
           jadi pemasangan yang dipulihkan dari dump-dump itu SAJA akan berisi
           data lengkap yang tidak bisa dimasuki siapa pun. */
        const isi = readFileSync(terbuka, "utf8");
        if (!/CREATE ROLE/i.test(isi)) {
          fail(
            `${o.kunci} tidak memuat satu \`CREATE ROLE\` pun. Pemasangan yang\n` +
              "  dipulihkan tanpa peran akan berisi data lengkap yang tidak bisa\n" +
              "  dimasuki siapa pun."
          );
        }
        adaGlobals = true;
        console.log(`✓ peran & hak akses tingkat server ikut`);
        break;
      }
      case "files": {
        const isi = run("tar", ["-tzf", terbuka]).split("\n").filter(Boolean);
        const adaDokumen = isi.some((f) => f.startsWith("documents"));
        const adaAudit = isi.some((f) => f.startsWith("audit"));
        if (!adaDokumen) {
          console.warn("⚠ tidak ada `documents/` — belum ada dokumen, atau volumenya tidak terpasang.");
        }
        if (!adaAudit) {
          console.warn("⚠ tidak ada `audit/` — belum ada jejak, atau volumenya tidak terpasang.");
        }
        adaBerkas = true;
        console.log(`✓ berkas di luar basis data ikut (${isi.length} entri)`);
        break;
      }
      default:
        console.warn(`⚠ objek ${o.kunci} berjenis "${o.jenis}" yang tidak dikenal pembukti ini.`);
    }
  }

  if (!adaGlobals) fail("putaran ini tidak memuat objek `globals` — peran tidak pernah ikut.");
  if (!adaBerkas) {
    console.warn("⚠ putaran ini tidak memuat objek `files` (#367/#370).");
  }

  /* ── 5. KELENGKAPAN: setiap basis data terdaftar punya objeknya sendiri ─
   *
   * Inilah aturan §6, dan ia TIDAK BISA dijawab oleh dump besar: "hadir di
   * dalam satu dump" dan "punya objek dumpnya sendiri" adalah dua janji yang
   * berbeda, dan hanya yang kedua yang membuat satu tenant bisa dipulihkan
   * tanpa menyentuh tenant lain.
   */
  const terdaftar = await basisDataTerdaftar();
  if (terdaftar === null) {
    console.warn("⚠ CONTROL_DATABASE_URL belum diset — kelengkapan per PT tidak dicocokkan.");
  } else {
    const adaObjek = new Set(dibukaBasis.map((b) => b.basis));
    const hilang = terdaftar.filter((c) => !adaObjek.has(c.nama));
    if (hilang.length > 0) {
      fail(
        `CADANGAN TIDAK LENGKAP — ${hilang.length} basis data terdaftar tidak punya objeknya sendiri:\n` +
          hilang.map((c) => `  - ${c.nama} (${c.slug})`).join("\n") +
          "\n  Cadangan yang kehilangan satu PT adalah cadangan yang gagal untuk\n" +
          "  customer itu saja — dan itulah bentuk kegagalan yang paling mudah\n" +
          "  tidak terlihat."
      );
    }
    console.log(`✓ ${terdaftar.length} basis data PT masing-masing punya objek dumpnya sendiri`);
  }

  console.log(
    `\n✓ PUTARAN INI BISA DIPULIHKAN — ${manifest.objek.length} objek, ` +
      `${(totalByte / 1024 / 1024).toFixed(1)} MB tersandi.`
  );
  console.log(
    `\nPulihkan SATU PT saja (inilah yang dibuka tata letak ini):\n` +
      `  pg_restore -h <host-bayangan> -U <peran> -d <basis-data-tujuan> \\\n` +
      `    --clean --if-exists ${path.join(kerja, "db-<nama>.dump")}\n\n` +
      `Pulihkan SELURUH pemasangan (ke server BAYANGAN — jangan pernah ke produksi):\n` +
      `  1. psql -h <host-bayangan> -U <peran> -d postgres -f ${path.join(kerja, "globals.sql")}\n` +
      `  2. createdb + pg_restore untuk tiap db-*.dump\n` +
      `  3. tar -xzf ${path.join(kerja, "berkas.tar.gz")} -C <volume-data>\n\n` +
      `lalu buka satu PT dan cocokkan Neraca Saldonya.\n\n` +
      `Buang setelah selesai:  rm -rf ${kerja}`
  );
}

/* ── Tata letak LAMA: satu arsip untuk seluruh pemasangan ───────────────── */

async function buktikanBerkasLama(sumber: Sumber, nama: string, kerja: string): Promise<void> {
  /* Tetap ada, dan sengaja: pada hari cut-over artefak TERBARU masih berbentuk
     ini. Pembukti yang hanya mengerti bentuk baru akan menolak satu-satunya
     salinan yang ada. */
  console.log(`Cadangan yang diuji: ${nama}  (tata letak LAMA — satu arsip)`);
  console.log(
    "⚠ Tata letak ini TIDAK bisa memulihkan satu PT tanpa menyentuh yang lain\n" +
      "  (celah on-premise #5). Ia diperiksa supaya artefak sebelum cut-over tetap\n" +
      "  terbukti — bukan supaya bentuk ini dipakai lagi."
  );

  const tersandi = path.join(kerja, nama);
  sumber.ambil(nama, tersandi);
  sumber.ambil(`${nama}.sha256`, `${tersandi}.sha256`);

  const tercatat = readFileSync(`${tersandi}.sha256`, "utf8").trim().split(/\s+/)[0];
  const terhitung = sidikJari(tersandi);
  if (tercatat !== terhitung) {
    fail(
      `SIDIK JARI TIDAK COCOK — berkasnya rusak di penyimpanan atau di jalan.\n` +
        `  tercatat : ${tercatat}\n  terhitung: ${terhitung}`
    );
  }
  console.log(`✓ sidik jari cocok (${(statSync(tersandi).size / 1024 / 1024).toFixed(1)} MB)`);

  const arsip = dekripsi(tersandi);
  console.log("✓ dekripsi berhasil — sandinya benar");

  const isi = run("tar", ["-tzf", arsip]).split("\n").filter(Boolean);
  const namaSql = isi.find((f) => f.endsWith(".sql"));
  if (!namaSql) fail("arsipnya tidak memuat satu pun berkas .sql — dumpnya tidak pernah ikut.");
  if (!isi.some((f) => f.startsWith("documents"))) {
    console.warn("⚠ tidak ada `documents/` — belum ada dokumen, atau volumenya tidak terpasang.");
  }
  if (!isi.some((f) => f.startsWith("audit"))) {
    console.warn("⚠ tidak ada `audit/` — belum ada jejak, atau volumenya tidak terpasang.");
  }
  console.log(`✓ arsip berisi ${isi.length} entri`);

  run("tar", ["-xzf", arsip, "-C", kerja]);
  const sql = readFileSync(path.join(kerja, namaSql), "utf8");

  const terdaftar = await basisDataTerdaftar();
  if (terdaftar === null) {
    console.warn("⚠ CONTROL_DATABASE_URL belum diset — daftar PT tidak bisa dicocokkan.");
  } else {
    const kendali = new URL(process.env.CONTROL_DATABASE_URL!).pathname.replace(/^\//, "");
    const diharapkan = [
      kendali,
      ...(process.env.PLATFORM_DATABASE_URL
        ? [new URL(process.env.PLATFORM_DATABASE_URL).pathname.replace(/^\//, "")]
        : []),
      ...terdaftar.map((c) => c.nama),
    ];

    /*
     * == DUA MESIN MENULIS DUMP DENGAN BENTUK YANG BERBEDA ==================
     * `mariadb-dump --all-databases` menandai tiap basis data dengan
     * `CREATE DATABASE ... `nama`` lalu `USE `nama``. `pg_dumpall` memakai
     * `CREATE DATABASE "nama"` lalu `\connect nama`.
     *
     * Pemeriksaan ini SENGAJA menerima keduanya alih-alih bercabang pada mesin
     * yang sedang dipakai: yang diperiksa adalah ARTEFAKNYA. Pembukti yang hanya
     * mengerti dump mesin sekarang akan menolak cadangan terakhir dari mesin
     * sebelumnya — justru pada hari ia paling dibutuhkan.
     */
    const adaDiDump = (db: string): boolean =>
      sql.includes("CREATE DATABASE /*!32312 IF NOT EXISTS*/ `" + db + "`") ||
      sql.includes("USE `" + db + "`") ||
      sql.includes('CREATE DATABASE "' + db + '"') ||
      new RegExp("^\\\\connect " + db + "\\s*$", "m").test(sql);

    const hilang = diharapkan.filter((db) => !adaDiDump(db));
    if (hilang.length > 0) {
      fail(
        `CADANGAN TIDAK LENGKAP — ${hilang.length} basis data tidak ada di dumpnya:\n` +
          hilang.map((d) => `  - ${d}`).join("\n") +
          "\n  Kredensial dump tidak berhak membacanya? (`--all-databases` menuntut root.)"
      );
    }
    console.log(`✓ ${diharapkan.length} basis data ada di dalam dump (${terdaftar.length} buku PT)`);
  }

  console.log(
    `\n✓ CADANGAN INI BISA DIPULIHKAN.\n\n` +
      `Hasil dekripsi ditinggalkan untuk latihan pemulihan:\n  ${arsip}\n\n` +
      `Latihan penuh (KUARTALAN, ke server BAYANGAN — jangan pernah ke produksi):\n` +
      `  psql -h <host-bayangan> -U <peran> -d postgres -f ${path.join(kerja, namaSql)}\n` +
      `lalu buka satu PT dan cocokkan Neraca Saldonya.\n\n` +
      `Buang setelah selesai:  rm -rf ${kerja}`
  );
}

async function main(): Promise<void> {
  if (!process.env.BACKUP_ENCRYPTION_KEY) {
    fail("BACKUP_ENCRYPTION_KEY belum diset — tanpa sandinya tidak ada yang bisa dibuka.");
  }

  const bucket = process.env.BACKUP_S3_BUCKET;
  const prefix = process.env.BACKUP_S3_PREFIX ?? "cadangan";
  const lokalDir = process.env.BACKUP_LOCAL_DIR ?? "/app/data/cadangan";
  const sumber = bucket ? sumberS3(bucket, prefix) : sumberCakram(lokalDir);

  if (!bucket) {
    console.log(`⚠ BACKUP_S3_BUCKET belum diset — menguji artefak LOKAL di ${lokalDir}`);
    console.log("⚠ Artefak ini TIDAK menyelamatkan dari kehilangan mesin.");
  }

  const kerja = mkdtempSync(path.join(tmpdir(), "prove-restore-"));

  /* ── Pilih apa yang diuji ────────────────────────────────────────────
   *
   * `--key` menerima KEDUA bentuk, dan bentuknya dikenali dari namanya sendiri
   * alih-alih dari sebuah bendera tambahan: `.enc` di ujung = artefak tunggal
   * yang lama, selain itu = direktori putaran. Satu bendera lagi adalah satu
   * hal lagi yang harus diingat benar pada hari pemulihan.
   */
  const diminta = argValue("--key");
  if (diminta) {
    if (diminta.endsWith(".enc")) {
      await buktikanBerkasLama(sumber, diminta, kerja);
    } else {
      await buktikanPutaran(sumber, diminta.replace(/\/$/, ""), kerja);
    }
    return;
  }

  const { putaran, berkasLama } = sumber.daftar();
  const putaranTerurut = [...putaran].filter((p) => /^[a-z0-9-]+-\d{8}T\d{6}Z$/.test(p)).sort();
  const lamaTerurut = [...berkasLama].sort();

  if (putaranTerurut.length === 0 && lamaTerurut.length === 0) {
    fail(
      `tidak ada satu pun cadangan di ${sumber.nama}/ — jalur \`tenant\` sudah pernah jalan?\n` +
        "  Periksa `docker compose logs svc-tenant` dan `/api/health` → `backup`."
    );
  }

  /* Yang TERBARU menang apa pun bentuknya, dan perbandingannya dengan NAMA —
     stempel waktunya ada di dalam nama, dalam format yang terurut secara
     leksikografis. Memilih bentuk baru lebih dulu akan menguji putaran kemarin
     sementara artefak hari ini berbentuk lama, atau sebaliknya. */
  const terbaruPutaran = putaranTerurut[putaranTerurut.length - 1];
  const terbaruLama = lamaTerurut[lamaTerurut.length - 1];
  const pakaiPutaran =
    terbaruPutaran !== undefined &&
    (terbaruLama === undefined || terbaruPutaran > terbaruLama.replace(/\.tar\.gz\.enc$/, ""));

  if (pakaiPutaran) {
    await buktikanPutaran(sumber, terbaruPutaran, kerja);
  } else {
    await buktikanBerkasLama(sumber, terbaruLama!, kerja);
  }
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

void main();
