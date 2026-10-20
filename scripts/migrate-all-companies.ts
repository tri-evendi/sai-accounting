/**
 * Terapkan migration basis data PERUSAHAAN ke SETIAP perusahaan terdaftar
 * (issue #104).
 *
 *   bun run db:migrate:companies      # perusahaan saja
 *   bun run db:migrate:all            # kendali dulu, lalu semua perusahaan
 *
 * ══ KEGAGALAN SATU PERUSAHAAN TIDAK BOLEH MENGGANTUNG YANG LAIN ════════════
 * Ini persyaratan eksplisit issue #104, dan alasannya konkret: kalau skrip ini
 * berhenti pada perusahaan pertama yang gagal, perusahaan-perusahaan sesudahnya
 * ditinggalkan pada versi skema LAMA sementara aplikasinya sudah versi baru —
 * artinya satu basis data yang bermasalah menjatuhkan seluruh pemasangan.
 * Karena itu setiap perusahaan dijalankan sendiri-sendiri, kegagalannya dicatat,
 * dan skrip terus berjalan. Ringkasannya dicetak di akhir dan exit code-nya
 * bukan nol bila ada yang gagal — jadi CI/deploy tetap tahu ada yang salah,
 * tapi yang berhasil sudah benar-benar naik.
 *
 * ══ KENAPA PROSES TERPISAH PER PERUSAHAAN ══════════════════════════════════
 * `prisma migrate deploy` membaca koneksinya dari environment saat proses itu
 * dimulai. Menjalankannya sebagai proses anak dengan `DATABASE_URL` yang sudah
 * ditunjuk ke basis data perusahaan yang bersangkutan adalah cara paling jujur:
 * tidak ada state yang bocor antar perusahaan, dan perintah yang dijalankan
 * persis sama dengan yang dipakai orang secara manual.
 *
 * Perusahaan NONAKTIF ikut dimigrasikan. Nonaktif berarti "tidak bisa dibuka",
 * bukan "boleh tertinggal": begitu ia diaktifkan lagi, skemanya harus sudah
 * sesuai dengan aplikasi yang sedang berjalan.
 *
 * ══ BOUNDED CONCURRENCY (rancangan §6, tahap 1b) ═══════════════════════════
 *
 * Invarian I-1 menuntut jumlah tenant tidak menambah pekerjaan *wall-clock*,
 * dan loop berurutan melanggarnya secara langsung: ratusan `migrate deploy`
 * satu per satu **di setiap rilis**. Sekarang N berjalan bersamaan,
 * `COMPANY_MIGRATE_CONCURRENCY` (bawaan 2).
 *
 * ⚠ ANGKANYA KECIL, DAN ITU DARI PENGUKURAN — BUKAN KEHATI-HATIAN. Tiap
 * pelaksana adalah satu proses Prisma CLI (ratusan MB) plus satu proses
 * backend PostgreSQL, dan migration berjalan SEMENTARA aplikasi masih
 * melayani. Kotak ini ~3,6 GB dibagi enam aplikasi, dan repo ini sudah pernah
 * kehilangan proses ke OOM-killer (exit 137) karena dua pekerjaan berat
 * berjalan bersamaan. Dua pelaksana sudah memotong *wall-clock* separuh di 17
 * perusahaan; menaikkannya adalah keputusan yang menuntut ruang memori yang
 * terukur, bukan penyetelan.
 *
 * ⚠ KELUARANNYA DIKUMPULKAN PER PERUSAHAAN, bukan diwariskan langsung. Dengan
 * `stdio: "inherit"`, N proses Prisma menulis ke terminal yang sama dan
 * hasilnya saling menyisip — tidak bisa dibaca justru pada hari satu di
 * antaranya gagal. Jadi tiap pelaksana ditangkap keluarannya dan dicetak
 * sebagai SATU blok saat ia selesai.
 *
 * ══ YANG TIDAK PINDAH KE GO DI TAHAP INI, DAN KENAPA ═══════════════════════
 *
 * Rancangan §3.3 menaruh jalur `schema` di kolom Go ("migration-nya SQL
 * tangan, jadi Go menerapkannya langsung"). Ia TIDAK pindah di tahap 1b, dan
 * alasannya dua, keduanya dari rancangan yang sama:
 *
 *  1. **§3.5: Prisma tetap pemilik skema.** Penerap kedua wajib menulis baris
 *     `_prisma_migrations` dalam format yang persis sama dengan Prisma —
 *     termasuk checksum-nya. Dua penulis atas pembukuan skema yang menyimpang
 *     tidak menghasilkan galat: `migrate deploy` berikutnya akan menerapkan
 *     ulang, atau melaporkan drift, pada basis data yang sebenarnya benar.
 *     Itu kelas kerusakan paling mahal di repo ini.
 *
 *  2. **§6 sendiri menahan asinkronisitasnya.** Nilai jalur `schema` lewat
 *     antrean adalah gerbang yang berubah dari "semua perusahaan siap" menjadi
 *     "perusahaan ini siap" — dan §6 menyebut prasyaratnya: *expand/contract*,
 *     yang "belum berlaku hari ini". Memindahkan migration keluar dari gerbang
 *     pemblokir SEBELUM setiap migration bekerja untuk kode lama DAN baru
 *     berarti aplikasi melayani buku yang skemanya lebih tua daripada kodenya.
 *     §6 juga sudah mengukur harganya: pada 17 perusahaan gerbang pemblokir
 *     masih murah — detik, bukan menit.
 *
 * Yang DIBUTUHKAN §6 dari jalur ini ada tiga, dan ketiganya sudah ada tanpa
 * penerap kedua: *bounded concurrency* (di berkas ini), hasil per perusahaan
 * yang bisa ditanyai (`vonisVersi` di konsol operator `/backup` — dibaca dari
 * `_prisma_migrations` itu sendiri, bukan dari tabel jejak yang bisa
 * BERBOHONG tentang apa yang sungguh ada di basis datanya), dan dapat
 * dilanjutkan dari tengah (`migrate deploy` hanya menerapkan yang belum).
 */

import "dotenv/config";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@sai/db/client/control";
import { buatAdapter } from "@sai/db/adapter";

function controlClient(): PrismaClient {
  const raw = process.env.CONTROL_DATABASE_URL;
  if (!raw) {
    console.error("CONTROL_DATABASE_URL belum diset — tidak tahu di mana daftar perusahaannya.");
    process.exit(1);
  }
  const url = new URL(raw);
  return new PrismaClient({
    adapter: buatAdapter(url.toString(), { batasKoneksi: 2 }),
  });
}

/** URL basis data satu perusahaan: kredensial dari template, nama dari registry. */
function companyUrl(databaseName: string): string {
  const raw =
    process.env.COMPANY_DATABASE_URL_TEMPLATE ??
    process.env.DATABASE_URL ??
    process.env.CONTROL_DATABASE_URL!;
  const url = new URL(raw);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

/**
 * Berapa perusahaan dimigrasikan BERSAMAAN.
 *
 * Bawaan 2 — lihat catatan memori di kepala berkas. Nilai di luar jangkauan
 * diabaikan dengan BUNYI, bukan diam: angka salah tulis yang diam-diam jatuh ke
 * bawaan membuat orang mengira ia sedang menjalankan sesuatu yang lain.
 */
function batasSerentak(): number {
  const raw = process.env.COMPANY_MIGRATE_CONCURRENCY;
  if (raw === undefined || raw === "") return 2;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    console.warn(
      `⚠ COMPANY_MIGRATE_CONCURRENCY=${JSON.stringify(raw)} bukan bilangan bulat ≥ 1 — memakai 2.`
    );
    return 2;
  }
  if (n > 8) {
    /* Plafon, dan bukan selera: tiap pelaksana satu proses Prisma CLI plus satu
       backend PostgreSQL, dan migration berjalan sementara aplikasi masih
       melayani. Angka besar di sini adalah OOM-killer yang kita jadwalkan
       sendiri, pada langkah rilis yang paling tidak boleh gagal separuh jalan. */
    console.warn(`⚠ COMPANY_MIGRATE_CONCURRENCY=${n} di atas plafon 8 — memakai 8.`);
    return 8;
  }
  return n;
}

async function main() {
  const control = controlClient();
  const companies = await control.company.findMany({
    orderBy: { id: "asc" },
    select: { id: true, slug: true, name: true, databaseName: true, isActive: true },
  });
  await control.$disconnect();

  if (companies.length === 0) {
    /*
     * Registry kosong = aplikasi tidak bisa melayani siapa pun, sebab setiap
     * halaman menuntut perusahaan. Karena itu keluar dengan kode BUKAN NOL:
     * service `migrate` di compose dirantai `service_completed_successfully`,
     * jadi `web` tidak akan naik — dan itu memang yang benar. Naik dengan
     * registry kosong hanya menghasilkan aplikasi yang terlihat sehat tapi
     * menolak setiap orang yang mencoba masuk, dan orang akan mencari
     * penyebabnya di tempat yang salah.
     *
     * Tidak ada satu pun migration perusahaan yang dijalankan di jalur ini —
     * termasuk 0042 yang menghapus tabel `users`. Itulah pengamannya: naiknya
     * container sebelum adopsi tidak bisa menghapus akun siapa pun.
     */
    console.error(
      "Belum ada perusahaan terdaftar — tidak ada migration perusahaan yang dijalankan.\n\n" +
        "  Pemasangan yang SUDAH berjalan (punya basis data & pengguna):\n" +
        "    bun run adopt-company -- --slug <slug> --name \"Nama PT\"\n\n" +
        "  Pemasangan BARU:\n" +
        "    bun run create-company -- --slug <slug> --name \"Nama PT\"\n\n" +
        "Lihat docs/MULTI-COMPANY.md untuk urutan lengkapnya."
    );
    process.exit(1);
  }

  const failures: { slug: string; databaseName: string; detail: string }[] = [];
  const mulai = Date.now();

  /* Pelaksana berikutnya diambil dari satu kursor bersama, bukan dari potongan
     daftar yang dibagi rata: perusahaan tidak sama besar, dan pembagian rata
     membuat satu pelaksana selesai lebih dulu lalu menganggur sementara yang
     lain masih punya giliran. */
  let kursor = 0;

  async function pelaksana(nomor: number): Promise<void> {
    for (;;) {
      const i = kursor++;
      if (i >= companies.length) return;
      const company = companies[i]!;
      const label = `${company.slug} (${company.databaseName})${company.isActive ? "" : " [nonaktif]"}`;

      /* Keluarannya DITANGKAP, bukan diwariskan: N proses yang menulis ke
         terminal yang sama saling menyisip, dan yang tidak bisa dibaca adalah
         justru log pada hari satu di antaranya gagal. */
      const result = spawnSync("prisma", ["migrate", "deploy"], {
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: companyUrl(company.databaseName) },
      });

      if ((result.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
        console.error(
          "✗ Binary `prisma` tidak ditemukan di PATH. Jalankan lewat package " +
            "manager: `bun run db:migrate:companies`."
        );
        process.exit(1);
      }

      /* Satu blok per perusahaan, dicetak saat ia selesai — label di atas
         keluarannya, supaya potongan log mana pun bisa ditelusuri ke bukunya. */
      const badan = `${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd();
      console.log(`\n── [p${nomor}] migrate deploy → ${label}`);
      if (badan) console.log(badan);

      if (result.status !== 0) {
        const detail =
          result.error?.message ?? `prisma migrate deploy keluar dengan kode ${result.status}`;
        failures.push({ slug: company.slug, databaseName: company.databaseName, detail });
        console.error(`   GAGAL: ${detail} — perusahaan lain TIDAK terpengaruh.`);
      }
    }
  }

  const serentak = Math.max(1, Math.min(batasSerentak(), companies.length));
  console.log(
    `${companies.length} perusahaan, ${serentak} dimigrasikan bersamaan ` +
      `(COMPANY_MIGRATE_CONCURRENCY=${serentak}).`
  );
  await Promise.all(Array.from({ length: serentak }, (_, n) => pelaksana(n + 1)));

  /* Urutan laporan kegagalan DITETAPKAN ulang menurut id: dengan beberapa
     pelaksana, urutan selesai berubah tiap putaran — dan ringkasan yang
     urutannya berubah membuat dua rilis yang hasilnya sama terbaca berbeda. */
  failures.sort(
    (a, b) =>
      companies.findIndex((c) => c.slug === a.slug) - companies.findIndex((c) => c.slug === b.slug)
  );

  console.log(
    `\n═══ Ringkasan: ${companies.length - failures.length}/${companies.length} berhasil ` +
      `dalam ${Math.round((Date.now() - mulai) / 1000)}s`
  );
  if (failures.length > 0) {
    for (const f of failures) {
      console.error(`   ✗ ${f.slug} (${f.databaseName}): ${f.detail}`);
    }
    console.error(
      "\nPerusahaan yang gagal MASIH memakai skema lama. Perbaiki lalu jalankan " +
        "ulang perintah ini — perusahaan yang sudah berhasil akan dilewati " +
        "(migrate deploy hanya menerapkan yang belum)."
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
