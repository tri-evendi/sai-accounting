/**
 * Bootstrap PEMASANGAN BARU — dari basis data kosong ke keadaan yang bisa dipakai.
 *
 *   bunx tsx scripts/bootstrap.ts --tenant-slug pt-sai --tenant-name "PT Subur Anugerah Indonesia" \
 *        --company-slug pt-sai --company-name "PT Subur Anugerah Indonesia" \
 *        --admin-username evendi --admin-email evendi@example.com --admin-name "Tri Evendi" \
 *        --operator-name evendi
 *
 * ══ Kenapa berkas ini ada ═══════════════════════════════════════════════════
 * Sebelum ini, membawa pemasangan kosong ke keadaan yang bisa dipakai menuntut
 * LIMA perintah yang urutannya tidak tertulis di mana pun — dan kalau salah satu
 * terlewat, tidak ada yang memberi tahu. Yang terjadi di produksi: paket belum
 * di-seed, akun operator NOL, dan SMTP tidak terkonfigurasi; ketiganya diam,
 * dan yang menemukannya adalah orang yang mendaftar lalu menunggu surel yang
 * tidak pernah datang (issue #317).
 *
 * Celah yang paling dalam: **tidak ada jalan membuat tenant untuk pemasangan
 * BARU.** Satu-satunya skrip yang membuat tenant adalah `adopt-tenant.ts` dan
 * `adopt-existing-company.ts` — keduanya untuk MENGADOPSI pemasangan lama, dan
 * keduanya menuntut peta JSON email pengguna yang sudah ada. Pemasangan baru
 * tidak punya pengguna lama, jadi tidak punya jalan masuk. Berkas ini yang
 * menutupnya.
 *
 * ══ Ia MENJALANKAN skrip yang sudah ada, tidak menyalinnya ═════════════════
 * Penyediaan perusahaan, pembuatan admin, dan seed paket sudah punya skripnya
 * masing-masing, lengkap dengan pemeriksaan yang tidak boleh diduplikasi (nama
 * basis data #153, kuota pengguna, checksum migration). Berkas ini
 * MENGURUTKANNYA — ia tidak tahu cara membuat perusahaan, ia tahu perusahaan
 * harus dibuat setelah tenant dan sebelum admin.
 *
 * Satu-satunya yang dikerjakan sendiri adalah TENANT, karena memang tidak ada
 * yang mengerjakannya, dan bentuknya kecil serta seluruhnya di basis data
 * kendali.
 *
 * (Catatan bagi yang tergoda memakai `provisionCompany` dari
 * `src/lib/company-provisioning.ts` langsung: berkas itu diawali
 * `import "server-only"` dan akan meledak di luar Next. Itu sebabnya
 * `create-company.ts` mengulang langkahnya, dan sebabnya berkas ini memanggil
 * skripnya alih-alih pustakanya.)
 *
 * ══ Dua mode, dan bedanya adalah kata sandi ════════════════════════════════
 * BAWAAN (tanpa bendera): kata sandi ditanyakan lewat prompt tersembunyi,
 * tidak pernah lewat argumen — argumen mendarat di `~/.bash_history` dan di
 * daftar proses.
 *
 * `--defaults`: kredensial TETAP yang tertulis di berkas ini, supaya sebuah
 * pemasangan bisa diuji ujung-ke-ujung tanpa satu pun ketikan. Ini permintaan
 * sadar pemilik, dan harganya harus tertulis dengan jujur: **kata sandi yang
 * ada di repositori bukan rahasia.** Siapa pun yang bisa membaca repo ini bisa
 * masuk ke pemasangan mana pun yang di-bootstrap dengan mode itu dan belum
 * memutar kredensialnya. Karena itu mode ini mencetak peringatan dan perintah
 * pemutarnya di akhir, dan `DEFAULT_*` di bawah sengaja ditaruh di satu tempat
 * yang mudah di-grep.
 *
 * Aman dijalankan ULANG: tenant di-upsert, dan skrip di bawahnya sudah
 * idempoten masing-masing (mereka menolak dengan sopan bila sasarannya sudah
 * ada).
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import { PrismaClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { SIGNUP_MAX_COMPANIES, SIGNUP_MAX_USERS } from "../src/lib/registration";

/* ── Argumen ─────────────────────────────────────────────────────────────── */

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i]?.startsWith("--") && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

const USAGE =
  "Pakai: bunx tsx scripts/bootstrap.ts \\\n" +
  '         --tenant-slug <slug> --tenant-name "Nama Tenant" \\\n' +
  '         --company-slug <slug> --company-name "Nama PT" \\\n' +
  '         --admin-username <nama> --admin-email <surel> --admin-name "Nama Lengkap" \\\n' +
  "         [--operator-name <nama>]\n\n" +
  "Kata sandi TIDAK lewat argumen — ia ditanyakan saat berjalan.\n\n" +
  "Atau, untuk pemasangan uji ujung-ke-ujung tanpa ketikan:\n" +
  "  bunx tsx scripts/bootstrap.ts --defaults\n" +
  "(kredensial TETAP yang tertulis di repo — putar sebelum dipakai sungguhan.)";

/* ── Kredensial mode `--defaults` ────────────────────────────────────────── */

/**
 * Nilai TETAP untuk pemasangan uji. Ditaruh di satu tempat supaya bisa
 * di-grep, dan supaya jawaban atas "apa kata sandinya?" tidak pernah menjadi
 * "cari di kode".
 *
 * Kata sandinya ≥12 karakter karena `create-admin` dan `operator-credential`
 * menolak yang lebih pendek — bukan karena panjangnya membuat nilai yang
 * tertulis di repositori menjadi rahasia. Ia tidak.
 */
const DEFAULTS = {
  tenantSlug: "demo",
  tenantName: "Tenant Demo",
  companySlug: "demo",
  companyName: "PT Demo Bootstrap",
  adminUsername: "admin",
  adminEmail: "admin@demo.test",
  adminName: "Administrator Demo",
  adminPassword: "AdminDemo#2026",
  operatorName: "operator",
} as const;

/** Slug: sama dengan yang diterima penyedia web, supaya tidak ada bentuk kedua. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* ── Prompt tersembunyi (pola `operator-credential.ts`) ──────────────────── */

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const stream = rl as unknown as { _writeToOutput?: (s: string) => void };
    process.stdout.write(question);
    stream._writeToOutput = () => {
      /* jangan gemakan kata sandi */
    };
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

/* ── Menjalankan skrip lain ──────────────────────────────────────────────── */

/**
 * Jalankan skrip repo ini dan tunggu. `stdio: "inherit"` disengaja: skrip di
 * bawahnya mencetak kemajuannya sendiri (dan `operator-credential.ts` MEMINTA
 * kata sandi), jadi menangkap keluarannya berarti menyembunyikan prompt dan
 * membuat proses menggantung tanpa penjelasan.
 *
 * Argumen dioper sebagai LARIK, tidak pernah dirangkai jadi satu baris perintah:
 * nama perusahaan mengandung spasi, dan satu tanda kutip yang lupa akan
 * membuat "PT Subur Anugerah" lahir sebagai tiga argumen.
 */
function run(script: string, args: string[], env?: Record<string, string>): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("bunx", ["tsx", script, ...args], {
      stdio: "inherit",
      cwd: process.cwd(),
      env: env ? { ...process.env, ...env } : process.env,
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

/* ── Preflight ───────────────────────────────────────────────────────────── */

/**
 * Semua env yang hilang dilaporkan SEKALIGUS, bukan satu per satu tiap kali
 * dijalankan ulang. Empat kali gagal berturut-turut karena satu variabel baru
 * ketahuan setiap kali adalah cara termudah membuat orang menyerah di langkah
 * pertama.
 *
 * ⚠ **Yang WAJIB hanyalah yang dipakai lima langkah di bawah** — dan
 * pembedaan itu mahal dipelajari: versi pertama berkas ini menuntut
 * `SETTINGS_ENCRYPTION_KEY` dan `NEXTAUTH_SECRET`, lalu menolak berjalan di
 * pemasangan yang sebenarnya SEHAT. Keduanya keliru dengan cara yang berbeda:
 *
 *  • `SETTINGS_ENCRYPTION_KEY` memang ada dan memang penting — tapi ia milik
 *    pengaturan surel (#169), yang disetel BELAKANGAN lewat `/operator/mail`.
 *    Tidak satu pun dari lima langkah di bawah menyentuhnya.
 *  • `NEXTAUTH_SECRET` **tidak pernah ada di repo ini**; namanya `AUTH_SECRET`.
 *    Nama itu dikarang, dan `grep` seluruh `src/` + `scripts/` hanya menemukan
 *    satu kemunculan: baris yang menuntutnya di sini.
 *
 * Pelajarannya bukan "kurangi pemeriksaan" melainkan **pisahkan dua
 * pertanyaan**: "apakah skrip ini bisa berjalan" (memblokir) dan "apakah
 * pemasangannya siap dipakai" (memberi tahu). Preflight yang mencampur
 * keduanya akan menghentikan pekerjaan yang tidak bergantung padanya.
 */
const REQUIRED_ENV = [
  ["CONTROL_DATABASE_URL", "basis data kendali — tenant, pengguna, daftar perusahaan (#104)"],
  ["DATABASE_URL", "buku besar perusahaan pertama"],
  ["PLATFORM_DATABASE_URL", "paket & langganan (#137)"],
] as const;

/**
 * Dibutuhkan pemasangan yang UTUH, tapi bukan oleh bootstrap. Dilaporkan
 * sebagai peringatan supaya ketiadaannya tetap terlihat — tanpa memblokir.
 */
const RECOMMENDED_ENV = [
  ["AUTH_SECRET", "penandatangan sesi — tanpa ini tidak ada yang bisa MASUK"],
  ["SETTINGS_ENCRYPTION_KEY", "kunci enkripsi pengaturan surel (#169), dipakai /operator/mail"],
] as const;

function missing(vars: readonly (readonly [string, string])[]): string[] {
  return vars
    .filter(([key]) => !process.env[key]?.trim())
    .map(([key, why]) => `  ${key} — ${why}`);
}

/* ── Utama ───────────────────────────────────────────────────────────────── */

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const wajibHilang = missing(REQUIRED_ENV);
  if (wajibHilang.length > 0) {
    console.error(
      "ERROR: bootstrap tidak bisa berjalan — environment belum lengkap:\n" +
        wajibHilang.join("\n") +
        "\n\nCatatan: hostname `db` hanya ada di dalam jaringan compose, jadi di\n" +
        "server produksi jalankan lewat kontainer:\n" +
        "  docker compose run --rm migrate bun run bootstrap -- --defaults"
    );
    process.exit(1);
  }

  const sebaiknyaHilang = missing(RECOMMENDED_ENV);
  if (sebaiknyaHilang.length > 0) {
    console.warn(
      "⚠ Bootstrap tetap berjalan, tapi pemasangannya belum utuh:\n" +
        sebaiknyaHilang.join("\n") +
        "\n"
    );
  }

  /* `--defaults` adalah bendera tanpa nilai, jadi ia dibaca dari argv mentah. */
  const useDefaults = process.argv.includes("--defaults");
  if (useDefaults) {
    console.log(
      "⚠  MODE --defaults: kredensial TETAP yang tertulis di repositori.\n" +
        "   Pemasangan ini bisa dimasuki siapa pun yang membaca repo sampai\n" +
        "   kredensialnya diputar. Perintah pemutarnya dicetak di akhir.\n"
    );
  }

  const tenantSlug = args["tenant-slug"]?.trim() ?? (useDefaults ? DEFAULTS.tenantSlug : undefined);
  const tenantName = args["tenant-name"]?.trim() ?? (useDefaults ? DEFAULTS.tenantName : undefined);
  const companySlug =
    args["company-slug"]?.trim() ?? (useDefaults ? DEFAULTS.companySlug : undefined);
  const companyName =
    args["company-name"]?.trim() ?? (useDefaults ? DEFAULTS.companyName : undefined);
  const adminUsername =
    args["admin-username"]?.trim() ?? (useDefaults ? DEFAULTS.adminUsername : undefined);
  const adminEmail = args["admin-email"]?.trim() ?? (useDefaults ? DEFAULTS.adminEmail : undefined);
  const adminName = args["admin-name"]?.trim() ?? (useDefaults ? DEFAULTS.adminName : undefined);
  const operatorName =
    args["operator-name"]?.trim() ?? (useDefaults ? DEFAULTS.operatorName : undefined);

  if (
    !tenantSlug ||
    !tenantName ||
    !companySlug ||
    !companyName ||
    !adminUsername ||
    !adminEmail ||
    !adminName
  ) {
    console.error(USAGE);
    process.exit(1);
  }
  if (!SLUG.test(tenantSlug) || !SLUG.test(companySlug)) {
    console.error("ERROR: slug hanya huruf kecil, angka, dan tanda hubung (mis. `pt-sai`).");
    process.exit(1);
  }

  /*
   * Kata sandi ditanyakan DI AWAL, sebelum satu baris pun ditulis ke basis
   * data. Menanyakannya di tengah berarti bootstrap yang separuh jalan
   * menggantung menunggu ketikan — dan orang yang menjalankannya lewat `ssh`
   * lalu pergi akan kembali ke pemasangan setengah jadi.
   */
  const adminPassword = useDefaults
    ? DEFAULTS.adminPassword
    : await askHidden(`Kata sandi untuk admin "${adminUsername}": `);
  if (adminPassword.length < 12) {
    console.error("✗ Kata sandi admin minimal 12 karakter.");
    process.exit(1);
  }

  const controlUrl = new URL(process.env.CONTROL_DATABASE_URL!);
  const control = new PrismaClient({
    adapter: new PrismaMariaDb({
      host: controlUrl.hostname,
      port: Number(controlUrl.port) || 3306,
      user: decodeURIComponent(controlUrl.username),
      password: decodeURIComponent(controlUrl.password),
      database: controlUrl.pathname.slice(1),
    }),
  });

  try {
    /* ── 1. Tenant ───────────────────────────────────────────────────────── */
    console.log(`1/5  tenant "${tenantSlug}"`);
    const existingTenant = await control.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, name: true },
    });
    const tenant =
      existingTenant ??
      (await control.tenant.create({
        data: {
          slug: tenantSlug,
          name: tenantName,
          status: "active",
          planKey: "internal",
          /*
           * Kuota DITULIS EKSPLISIT, tidak mengandalkan bawaan kolom — pelajaran
           * `registration-store.ts`: bawaan kolom adalah kuota paket yang lain,
           * dan pemasangan akan menabrak batas yang tidak pernah dijanjikan
           * siapa pun.
           */
          maxCompanies: SIGNUP_MAX_COMPANIES,
          maxUsers: SIGNUP_MAX_USERS,
        },
        select: { id: true, name: true },
      }));
    console.log(existingTenant ? `     sudah ada (id ${tenant.id})` : `     dibuat (id ${tenant.id})`);

    /* ── 2. Paket (basis data platform) ──────────────────────────────────── */
    console.log("2/5  paket langganan");
    const plans = await run("scripts/seed-plans.ts", []);
    if (plans !== 0) {
      console.error("✗ seed paket gagal — hentikan dan perbaiki sebelum melanjutkan.");
      process.exit(1);
    }

    /* ── 3. Perusahaan pertama ───────────────────────────────────────────── */
    console.log(`3/5  perusahaan "${companySlug}"`);
    const company = await run("scripts/create-company.ts", [
      "--slug",
      companySlug,
      "--name",
      companyName,
      "--tenant",
      tenantSlug,
    ]);
    if (company !== 0) {
      console.error(
        "✗ penyediaan perusahaan gagal.\n" +
          "  Penyebab paling sering: pengguna basis data tidak boleh CREATE DATABASE.\n" +
          "  Buat basis datanya manual, lalu ulangi dengan `--database <nama>` di\n" +
          "  scripts/create-company.ts."
      );
      process.exit(1);
    }

    /* ── 4. Administrator ────────────────────────────────────────────────── */
    console.log(`4/5  administrator "${adminUsername}"`);
    const admin = await run("scripts/create-admin.ts", [
      "--username",
      adminUsername,
      "--password",
      adminPassword,
      "--name",
      adminName,
      "--email",
      adminEmail,
      "--company",
      companySlug,
    ]);
    if (admin !== 0) {
      console.error("✗ pembuatan admin gagal.");
      process.exit(1);
    }

    /* ── 5. Operator ─────────────────────────────────────────────────────── */
    if (operatorName) {
      console.log(`5/5  kredensial operator "${operatorName}"`);
      /*
       * Kredensial operator TIDAK ditulis ke basis data mana pun — ia hidup di
       * environment (issue #154). Yang bisa dilakukan bootstrap hanyalah
       * mencetak barisnya; menempelkannya ke `.env` tetap tangan manusia,
       * karena `.env` produksi bukan milik skrip.
       */
      const op = await run(
        "scripts/operator-credential.ts",
        [operatorName],
        useDefaults ? { OPERATOR_BOOTSTRAP_PASSWORD: DEFAULTS.adminPassword } : undefined
      );
      if (op !== 0) console.error("  (pembuatan kredensial operator gagal — ulangi terpisah)");
    } else {
      console.log("5/5  operator DILEWATI (tanpa --operator-name)");
    }

    /* ── Yang tersisa, dan tidak bisa dikerjakan skrip ───────────────────── */
    console.log(
      "\n" +
        "═══ Selesai. Tiga langkah terakhir milik manusia ═══════════════════\n" +
        "\n" +
        "1. Tempel baris OPERATOR_USERS di atas ke `.env` produksi, lalu:\n" +
        "     docker compose up -d --force-recreate web\n" +
        "   (`env_file` hanya dibaca saat kontainer DIBUAT — restart biasa tidak cukup.)\n" +
        "\n" +
        "2. PINDAI URI otpauth:// ke aplikasi authenticator SEBELUM langkah 1.\n" +
        "   MFA operator wajib; entri tanpa rahasia TOTP dibuang sebagai salah\n" +
        "   bentuk, bukan diperlakukan sebagai akun tanpa MFA.\n" +
        "\n" +
        "3. Setel SMTP di /operator/mail dan tekan UJI KIRIM.\n" +
        "   Tanpa itu, setiap pendaftaran akan menjawab \"cek email Anda\" sambil\n" +
        "   menulis surelnya ke cakram, tanpa satu galat pun (issue #317).\n" +
        (useDefaults
          ? "\n" +
            "⚠  KREDENSIAL BAWAAN TERPASANG — putar sebelum dipakai sungguhan:\n" +
            `     admin    : ${DEFAULTS.adminUsername} / ${DEFAULTS.adminPassword}\n` +
            `     operator : ${DEFAULTS.operatorName} / ${DEFAULTS.adminPassword} + TOTP di atas\n` +
            "   Memutarnya:\n" +
            `     bunx tsx scripts/create-admin.ts --username ${DEFAULTS.adminUsername} \\\n` +
            `       --password '<sandi-baru>' --company ${companySlug}\n` +
            `     bunx tsx scripts/operator-credential.ts ${DEFAULTS.operatorName}\n`
          : "")
    );
  } finally {
    await control.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
