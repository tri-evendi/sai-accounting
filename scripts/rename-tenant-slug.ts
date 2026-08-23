/**
 * Ganti slug (dan opsional nama) sebuah akun — SISI OPERATOR (issue #458 lingkup 4).
 *
 * ══ KENAPA SKRIP, PADAHAL HALAMANNYA SUDAH ADA ═════════════════════════════
 * Halaman `/platform/account` melayani pelanggan yang mengganti alamatnya
 * sendiri. Yang tidak bisa ia layani adalah akun yang lahir SEBELUM #458:
 * slug-nya menyalin nama pribadi pendaftarnya, pemiliknya mungkin tidak
 * pernah membuka panel akun, dan sebagian di antaranya perlu dibetulkan atas
 * permintaan lewat dukungan — termasuk akun yang pemiliknya sudah tidak lagi
 * di perusahaan itu.
 *
 * Pagarnya SAMA PERSIS dengan yang di halaman, dan itu disengaja: keduanya
 * memanggil `renameTenantSlug()`. Skrip yang menulis langsung ke tabel akan
 * melewati pemesanan slug lama — dan slug lama yang tidak terpesan berarti
 * tautan lama yang suatu hari mendarat di buku milik orang lain.
 *
 * ⚠ Jeda 30 hari IKUT berlaku. Kalau sebuah akun perlu dibetulkan dua kali
 * dalam sebulan, yang bermasalah bukan jedanya melainkan nama yang dipilih;
 * memberi operator jalan pintas untuk melewatinya berarti pagar itu berhenti
 * berarti pada hari pertama seseorang terburu-buru.
 *
 * PEMAKAIAN (di dalam jaringan compose — `db` tidak bisa dihubungi dari host):
 *
 *   docker compose run --rm migrate npx tsx scripts/rename-tenant-slug.ts \
 *     --slug-lama tri-evendi --slug-baru movin-nusantara [--nama "Movin Nusantara"]
 *
 * Tanpa `--terapkan`, ia hanya MENAMPILKAN apa yang akan terjadi.
 */

import { controlDb } from "@/lib/control-db";
import { renameTenantSlug } from "@/lib/tenant-slug";
import { writeTenantAuditLog } from "@/lib/tenant-audit";

function arg(nama: string): string | undefined {
  const i = process.argv.indexOf(`--${nama}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const slugLama = arg("slug-lama");
  const slugBaru = arg("slug-baru");
  const namaBaru = arg("nama");
  const terapkan = process.argv.includes("--terapkan");

  if (!slugLama || !slugBaru) {
    console.error(
      "Pemakaian: rename-tenant-slug.ts --slug-lama <slug> --slug-baru <slug> [--nama <nama>] [--terapkan]"
    );
    process.exitCode = 1;
    return;
  }

  const tenant = await controlDb.tenant.findUnique({
    where: { slug: slugLama },
    select: { id: true, slug: true, name: true, slugChangedAt: true, _count: { select: { companies: true } } },
  });
  if (!tenant) {
    console.error(`Akun dengan slug \`${slugLama}\` tidak ada.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Akun  : ${tenant.name} (id ${tenant.id}, ${tenant._count.companies} perusahaan)`);
  console.log(`Alamat: /t/${tenant.slug}/…  →  /t/${slugBaru}/…`);
  if (namaBaru) console.log(`Nama  : ${tenant.name}  →  ${namaBaru}`);
  console.log(
    "\nAlamat lama DIPESAN selamanya dan dipantulkan permanen ke alamat baru;\n" +
      "tautan yang sudah dibagikan tetap sampai. Nama basis data TIDAK berubah\n" +
      "(ia memuat id tenant, bukan slug-nya).\n"
  );

  if (!terapkan) {
    console.log("Belum diterapkan — jalankan ulang dengan --terapkan.");
    return;
  }

  const hasil = await renameTenantSlug({ tenantId: tenant.id, slugBaru });
  if (!hasil.ok) {
    console.error(`GAGAL: ${hasil.reason}`);
    process.exitCode = 1;
    return;
  }

  if (namaBaru) {
    await controlDb.tenant.update({ where: { id: tenant.id }, data: { name: namaBaru } });
  }

  /* Jejaknya ditulis ke berkas slug LAMA — di sanalah seluruh riwayat akun ini
     berada, dan memindahkannya ke berkas baru memutus riwayat tepat di
     peristiwa yang paling perlu bisa ditelusuri. Aktornya `system`: yang
     menjalankan skrip ini adalah operator, bukan pengguna mana pun. */
  await writeTenantAuditLog({
    tenantId: tenant.id,
    tenantSlug: hasil.slugLama,
    action: "tenant.slug.change",
    details: {
      from: hasil.slugLama,
      to: hasil.slugBaru,
      nameFrom: namaBaru ? tenant.name : undefined,
      nameTo: namaBaru,
      by: "operator-script",
    },
  });

  console.log(`Selesai. /t/${hasil.slugBaru}/… sudah berlaku.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => controlDb.$disconnect());
