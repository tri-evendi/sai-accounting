/**
 * Terapkan migration basis data PERUSAHAAN ke SETIAP perusahaan terdaftar
 * (issue #104).
 *
 *   npm run db:migrate:companies      # perusahaan saja
 *   npm run db:migrate:all            # kendali dulu, lalu semua perusahaan
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
 */

import "dotenv/config";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

function controlClient(): PrismaClient {
  const raw = process.env.CONTROL_DATABASE_URL;
  if (!raw) {
    console.error("CONTROL_DATABASE_URL belum diset — tidak tahu di mana daftar perusahaannya.");
    process.exit(1);
  }
  const url = new URL(raw);
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 2,
    }),
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
        "    npm run adopt-company -- --slug <slug> --name \"Nama PT\"\n\n" +
        "  Pemasangan BARU:\n" +
        "    npm run create-company -- --slug <slug> --name \"Nama PT\"\n\n" +
        "Lihat docs/MULTI-COMPANY.md untuk urutan lengkapnya."
    );
    process.exit(1);
  }

  const failures: { slug: string; databaseName: string; detail: string }[] = [];

  for (const company of companies) {
    const label = `${company.slug} (${company.databaseName})${company.isActive ? "" : " [nonaktif]"}`;
    console.log(`\n── migrate deploy → ${label}`);

    const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: companyUrl(company.databaseName) },
    });

    if (result.status !== 0) {
      const detail =
        result.error?.message ?? `prisma migrate deploy keluar dengan kode ${result.status}`;
      failures.push({ slug: company.slug, databaseName: company.databaseName, detail });
      console.error(`   GAGAL: ${detail} — lanjut ke perusahaan berikutnya.`);
    }
  }

  console.log(`\n═══ Ringkasan: ${companies.length - failures.length}/${companies.length} berhasil`);
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
