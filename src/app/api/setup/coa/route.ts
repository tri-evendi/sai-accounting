/**
 * Menyemai bagan akun DI TENGAH wisaya, bukan hanya di ujungnya (issue #416).
 *
 * ══ KENAPA ROUTE INI ADA ════════════════════════════════════════════════════
 * Sampai issue #416, satu-satunya penyemaian untuk perusahaan baru ada di
 * `POST /api/setup` — yaitu di dalam permintaan yang menutup wisaya. Akibatnya
 * langkah "Saldo Awal", yang berdiri SEBELUM permintaan itu, membaca basis data
 * yang masih kosong: nol akun kas/bank, nol pelanggan, nol pemasok, nol barang.
 * Bagiannya masing-masing lalu menampilkan keadaan kosong DAN menyembunyikan
 * tombol "Tambah"-nya, sehingga layarnya tidak punya satu isian pun — sementara
 * tombol Simpan menuntut minimal satu saldo awal. Buntu penuh, dan karena
 * gerbang setup memantulkan setiap halaman lain kembali ke wisaya, orangnya
 * terkunci di luar aplikasinya sendiri. Persis itu yang dilaporkan pengguna.
 *
 * Jadi wisaya memanggil route ini saat meninggalkan langkah MODUL — momen
 * paling awal yang mungkin, sebab yang disemai memang mengikuti modul terpilih.
 * Langkah COA berikutnya lalu menyebut jumlah akun yang SUNGGUH ada (dulu ia
 * mengumumkan "0 akun aktif" sambil menyebutnya "sudah tersedia"), dan langkah
 * Saldo Awal punya akun kas/bank untuk dipilih.
 *
 * ══ AMAN DIPANGGIL BERULANG ═════════════════════════════════════════════════
 * `seedCoaForModules` idempoten dan aditif: kode akun yang sudah ada tidak
 * disentuh sama sekali. Bolak-balik antar langkah, atau mengganti pilihan modul
 * lalu maju lagi, karena itu tidak pernah menggandakan atau menimpa apa pun —
 * paling banyak menambahkan akun milik modul yang baru dicentang.
 *
 * Penyemaian di `POST /api/setup` TETAP ADA dan tidak boleh dicabut: ia jaring
 * pengaman untuk wisaya yang dijalankan tanpa pernah melewati route ini (draf
 * lama yang dipulihkan langsung ke langkah akhir, klien tanpa JS, skrip).
 *
 * ══ IZINNYA `setup.manage` ══════════════════════════════════════════════════
 * Sama dengan wisaya yang memanggilnya. Route ini menulis MASTER DATA (akun +
 * pemetaan posting bawaan), bukan satu baris jurnal pun — dan hanya selama
 * perusahaan belum disiapkan: sesudah `is_setup` menyala, penyalaan modul punya
 * jalurnya sendiri (`PUT /api/company-settings/modules`), yang menyemai akun
 * modul barunya di sana. Karena itu di sini 409, bukan penyemaian diam-diam
 * lewat pintu kedua.
 */
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { seedCoaForModules } from "@/lib/coa-seeding";
import {
  normalizeEnabledModules,
  validateEnabledModules,
  type BusinessModule,
} from "@/lib/business-modules";
import { businessModulesPayloadSchema } from "@/lib/validations/modules";
import { isSetupComplete } from "@/lib/opening-balance";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

export async function POST(request: Request) {
  const result = await requireApiPermission("setup.manage");
  if (!result.authorized) return result.response;

  const { dictionary, t } = await getRequestI18n();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("errors.invalidJson") }, { status: 400 });
  }

  /* Bentuk payload yang SAMA dengan langkah modul di Pengaturan — satu skema,
     jadi dua permukaan tidak bisa menyimpang soal apa itu "himpunan modul". */
  const parsed = businessModulesPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  const errors = validateEnabledModules(parsed.data.modules);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });
  }

  if (await isSetupComplete()) {
    return NextResponse.json(
      { error: t("errors.setupAlreadyDone"), code: "already_setup" },
      { status: 409 }
    );
  }

  const modules = normalizeEnabledModules(parsed.data.modules as BusinessModule[]);
  const seeded = await seedCoaForModules(prisma, modules);

  /*
   * Yang dipulangkan adalah apa yang DIBUTUHKAN LANGKAH BERIKUTNYA, bukan
   * sekadar hitungan hasil semai: wisaya menerima bagan akun ini sebagai state
   * dan tidak memuat ulang halaman, jadi tanpa daftar akun kas/bank di sini
   * pemilihnya tetap kosong sampai orangnya menekan muat-ulang — yaitu buntu
   * yang sama, hanya satu klik lebih jauh.
   */
  const [coaCount, cashAccounts] = await Promise.all([
    prisma.account.count({ where: { isActive: true } }),
    prisma.account.findMany({
      where: { type: "cash_bank", isActive: true },
      select: { id: true, code: true, name: true, currency: true },
      orderBy: { code: "asc" },
    }),
  ]);

  return NextResponse.json({ ...seeded, coaCount, cashAccounts });
}
