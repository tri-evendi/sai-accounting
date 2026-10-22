/**
 * PENJAGA: setiap container menerima HANYA env yang dibaca kodenya — dan
 * rahasia tidak pernah sampai ke layanan yang salah.
 *
 * Sampai Okt 2026 semua layanan memakai `env_file: .env`: `app-customer`
 * (menghadap internet) memegang `OPERATOR_SESSION_SECRET`,
 * `BACKUP_ENCRYPTION_KEY`, kredensial S3, dan sandi superuser PostgreSQL.
 * Penggantinya daftar izin `environment:` per layanan. Tiga aturan:
 *
 *   1. Tidak satu layanan pun (di berkas compose mana pun) memakai `env_file`.
 *   2. DAFTAR TOLAK: rahasia hanya di layanan yang memang memakainya.
 *   3. SETIAP env yang dibaca kode sebuah layanan (graf impor dari titik
 *      masuknya — `scripts/lib/env-inventory.ts`) DISEDIAKAN compose, atau
 *      tercatat di `TIDAK_DISEDIAKAN` beserta alasannya. Yang ketiga ini yang
 *      mencegah outage: daftar izin yang kurang satu nama tidak berbunyi
 *      sampai fitur itu dipakai di produksi.
 *
 * `bun run env:inventory` mencetak tabel yang sama untuk dibaca manusia.
 */
import { describe, expect, it } from "vitest";

import { inventory, serviceSurfaces } from "../scripts/lib/env-inventory";
import { COMPOSE_FILES, envMap, loadCompose } from "./compose-yaml";

const BERKAS = COMPOSE_FILES;
const muat = loadCompose;
const DASAR = muat("docker-compose.yml").services!;

/** Env yang DISEDIAKAN satu layanan di compose dasar. */
const disediakan = (svc: string) => new Set(Object.keys(envMap(DASAR[svc])));

const perintahWorker = DASAR["svc-worker"]?.command;
const SURFACES = serviceSurfaces(Array.isArray(perintahWorker) ? perintahWorker : []);
/** Dihitung SEKALI: penelusuran graf impor seluruh aplikasi butuh beberapa detik. */
const INV = new Map(SURFACES.map((s) => [s.service, inventory(s).reads]));
const dibacaOleh = (svc: string) => INV.get(svc)!;

/**
 * Env yang DIBACA kode tetapi SENGAJA tidak disediakan, per layanan.
 * Setiap baris wajib beralasan, dan baris yang tidak lagi dibaca ditolak
 * (daftar pengecualian yang membusuk menyembunyikan kekurangan berikutnya).
 */
const TIDAK_DISEDIAKAN: Record<string, Record<string, string>> = {
  "*": {
    NEXT_PHASE: "disetel Next sendiri saat build/serve",
    NEXT_RUNTIME: "disetel Next sendiri (nodejs | edge)",
    NEXT_PUBLIC_APP_VERSION: "dipanggang saat build; image juga membawa APP_VERSION",
    APP_VERSION: "ENV image (ARG build) — compose tidak boleh menimpanya",
    GIT_SHA: "ENV image (ARG build)",
    BUILD_TIME: "ENV image (ARG build)",
    USER: "nama pengguna shell pengembang (jejak aktor skrip); container tidak punya",
    HOSTNAME: "disetel Docker (nama container); aplikasi menyetelnya eksplisit",
    NODE_ENV: "ENV image (`NODE_ENV=production` di tahap migrator/runner)",
    APP_DEPLOY_PROFILE: "dinyatakan HANYA oleh override on-premise; tanpa nilai = `saas`",
    CACHE_REDIS_URL: "disetel HANYA oleh override replika; tanpa nilai = tanpa klien Redis",
    WORKER_LEADER_ROLES: "disetel HANYA oleh override HA; compose dasar tidak menyalakan leader election",
  },
  "svc-worker": {
    PROVISION_DATABASE_URL:
      "hanya terimpor lewat `@sai/db/company-url`; tidak satu peran pun membuat basis data — kredensial PEMILIK tidak boleh di sini",
    OPERATOR_TRUSTED_PROXY_HOPS: "`client-ip` terimpor transitif; container ini tidak melayani HTTP",
    PG_APP_USER: "`appRoleForNewBook` terimpor transitif; hanya jalur yang MEMBUAT buku memanggilnya",
  },
  "app-operator": {
    PG_APP_USER: "`appRoleForNewBook` terimpor transitif; konsol tidak membuat buku",
    PROVISION_DATABASE_URL:
      "konsol memanggil `companyServerConnection(c, controlUrl)` dengan URL kendali sebagai bawaan — tidak pernah membuat basis data",
  },
  migrate: {
    OPERATOR_USERS:
      "`operator-code` membaca rahasia TOTP — jalankan dengan `-e OPERATOR_USERS` dari shell, bukan dari compose (PRODUCTION.md §3)",
    OPERATOR_BOOTSTRAP_PASSWORD: "dioper `bootstrap` ke proses anaknya sendiri, bukan dari compose",
    OPERATOR_AUDIT_DIR: "perkakas pindahan sekali-jalan; bawaannya `data/audit`",
    OPERATOR_TRUSTED_PROXY_HOPS: "`client-ip` terimpor transitif; perkakas tidak melayani HTTP",
    SAI_BUNDLE_PASSPHRASE: "sandi bundel on-premise — `-e SAI_BUNDLE_PASSPHRASE` saat `run`, atau ditanya tersembunyi",
    SAI_BUNDLE_PASS_CHILD: "dioper induk ke proses anak (`scripts/lib/bundle-io.ts`)",
  },
  "job-backup": {
    BACKUP_STARTED_AT: "disetel `backup.sh` untuk anak `record-backup-run`",
    DB_HOST: "`backup.sh`: penimpa opsional — bawaannya dari DATABASE_URL",
    DB_PORT: "`backup.sh`: penimpa opsional — bawaannya dari DATABASE_URL",
    DB_USER: "`backup.sh`: penimpa opsional — bawaannya dari DATABASE_URL",
    MIDTRANS_SERVER_KEY:
      "`payment-gateway` terimpor transitif lewat `tenant-onprem-cutover`; perkakas ini tidak menagih siapa pun",
    MIDTRANS_IS_PRODUCTION: "sama — terimpor transitif, tidak dipakai",
    PAYMENT_GATEWAY: "sama — terimpor transitif, tidak dipakai",
    MANUAL_PAYMENT_INSTRUCTIONS: "sama — terimpor transitif, tidak dipakai",
    OPERATOR_TRUSTED_PROXY_HOPS: "`client-ip` terimpor transitif; perkakas tidak melayani HTTP",
    SAI_BUNDLE_PASSPHRASE: "sandi bundel on-premise — `-e SAI_BUNDLE_PASSPHRASE` saat `run`, atau ditanya tersembunyi",
    SAI_BUNDLE_PASS_CHILD: "dioper induk ke proses anak (`scripts/lib/bundle-io.ts`)",
  },
};

/**
 * DAFTAR TOLAK — rahasia (atau pola rahasia) → layanan yang BOLEH menerimanya.
 * Layanan di luar daftar yang menerimanya = merah.
 */
const BOLEH: { pola: RegExp; layanan: string[]; kecuali?: Record<string, string[]> }[] = [
  {
    /* Rahasia konsol: memalsukan sesi operator / login darurat / MFA. */
    pola: /^OPERATOR_/,
    layanan: ["app-operator"],
    kecuali: {
      /* Dipaksa KOSONG — penjaga, bukan rahasia. */
      OPERATOR_HOST: ["app-customer"],
      /* Topologi proxy untuk alamat klien pembatas laju; bukan rahasia. */
      OPERATOR_TRUSTED_PROXY_HOPS: ["app-customer"],
    },
  },
  /* Membuka & menghapus setiap cadangan. */
  { pola: /^BACKUP_/, layanan: ["svc-integrator", "job-backup"] },
  { pola: /^AWS_/, layanan: ["svc-integrator", "job-backup"] },
  /* Menandatangani sesi pelanggan & kunci buku. */
  { pola: /^AUTH_SECRET$/, layanan: ["app-customer"] },
  /* Menagih uang sungguhan. */
  { pola: /^MIDTRANS_SERVER_KEY$/, layanan: ["app-customer", "app-operator", "svc-worker", "migrate"] },
  /* Kredensial PEMILIK (DDL, CREATE DATABASE). */
  { pola: /^PROVISION_DATABASE_URL$/, layanan: ["app-customer", "migrate", "job-backup"] },
  /* Sandi peran — hanya dipakai untuk merakit URL di compose, tidak pernah sebagai env container. */
  { pola: /^PG_(OWNER_|APP_|BACKUP_)?PASSWORD$/, layanan: [] },
];

/** Interpolasi sandi SUPERUSER (`${PG_PASSWORD}` di luar fallback) hanya di layanan ini. */
const SUPERUSER_BOLEH = ["pg", "pgbouncer", "job-backup"];

describe("daftar izin env per layanan", () => {
  it("permukaan layanan terbaca, dan inventarisnya tidak kosong", () => {
    /* Pemindai yang tidak menemukan apa pun lulus dengan nol pelanggar. */
    expect(SURFACES.map((s) => s.service).sort()).toEqual(
      ["app-customer", "app-operator", "job-backup", "migrate", "svc-integrator", "svc-worker"].sort()
    );
    for (const s of SURFACES) {
      expect(dibacaOleh(s.service).size, `${s.service}: inventaris env kosong`).toBeGreaterThan(5);
    }
    expect(dibacaOleh("app-customer").has("AUTH_SECRET")).toBe(true);
    expect(dibacaOleh("svc-integrator").has("BACKUP_ENCRYPTION_KEY")).toBe(true);
  });

  it("tidak satu layanan pun memakai `env_file` (berkas compose mana pun)", () => {
    const pelanggar: string[] = [];
    for (const f of BERKAS) {
      for (const [n, s] of Object.entries(muat(f).services ?? {})) {
        if (s && "env_file" in s) pelanggar.push(`${f} → ${n}`);
      }
    }
    expect(pelanggar, "`env_file: .env` membawa SELURUH rahasia ke container").toEqual([]);
  });

  it("setiap env yang dibaca kode layanan DISEDIAKAN (atau tercatat sengaja tidak)", () => {
    const kurang: string[] = [];
    for (const s of SURFACES) {
      const ada = disediakan(s.service);
      const lewati = { ...TIDAK_DISEDIAKAN["*"], ...TIDAK_DISEDIAKAN[s.service] };
      for (const [nama, berkas] of dibacaOleh(s.service)) {
        if (ada.has(nama) || nama in lewati) continue;
        kurang.push(`${s.service}: ${nama} (dibaca ${berkas})`);
      }
    }
    expect(kurang, "tambahkan ke `environment:` layanan itu (atau grup x-env), atau catat alasannya").toEqual([]);
  });

  it("pengecualian TIDAK_DISEDIAKAN masih berlaku (tidak membusuk)", () => {
    const basi: string[] = [];
    for (const s of SURFACES) {
      const dibaca = dibacaOleh(s.service);
      for (const nama of Object.keys(TIDAK_DISEDIAKAN[s.service] ?? {})) {
        if (!dibaca.has(nama)) basi.push(`${s.service}: ${nama} tidak lagi dibaca`);
        if (disediakan(s.service).has(nama)) {
          basi.push(`${s.service}: ${nama} tercatat tidak disediakan, padahal disediakan`);
        }
      }
    }
    expect(basi).toEqual([]);
  });

  it("rahasia hanya sampai ke layanan yang memakainya (semua berkas compose)", () => {
    const bocor: string[] = [];
    for (const f of BERKAS) {
      for (const [svc, s] of Object.entries(muat(f).services ?? {})) {
        for (const nama of Object.keys(envMap(s))) {
          for (const aturan of BOLEH) {
            if (!aturan.pola.test(nama)) continue;
            const izin = [...aturan.layanan, ...(aturan.kecuali?.[nama] ?? [])];
            if (!izin.includes(svc)) bocor.push(`${f} → ${svc}: ${nama}`);
          }
        }
      }
    }
    expect(bocor).toEqual([]);
  });

  it("`app-customer` menerima OPERATOR_HOST KOSONG, dan tidak satu rahasia konsol/cadangan pun", () => {
    const env = envMap(DASAR["app-customer"]);
    expect(env.OPERATOR_HOST).toBe("");
    for (const n of Object.keys(env)) {
      expect(n).not.toMatch(/^(OPERATOR_(SESSION_SECRET|USERS|MFA|IP_ALLOWLIST|BOOTSTRAP)|BACKUP_|AWS_)/);
    }
  });

  it("sandi superuser PostgreSQL hanya dirakit untuk layanan yang memang superuser", () => {
    /* `${PG_PASSWORD}` sebagai FALLBACK (`${PG_APP_PASSWORD:-${PG_PASSWORD}}`)
       diizinkan: itu jalan sebelum peralihan hak minimum, dan sesudahnya tidak
       terpakai. Yang ditolak: superuser yang dirakit LANGSUNG. */
    const pelanggar: string[] = [];
    for (const f of BERKAS) {
      for (const [svc, s] of Object.entries(muat(f).services ?? {})) {
        for (const [nama, nilai] of Object.entries(envMap(s))) {
          if (typeof nilai !== "string") continue;
          const langsung = nilai.replace(/\$\{PG_(OWNER|APP|BACKUP)_PASSWORD:-\$\{PG_PASSWORD\}\}/g, "");
          if (/\$\{PG_PASSWORD[:}]/.test(langsung) && !SUPERUSER_BOLEH.includes(svc)) {
            pelanggar.push(`${f} → ${svc}.${nama}`);
          }
        }
      }
    }
    /* Patroni (HA) memegang superuser kluster — memang perannya. */
    expect(pelanggar.filter((p) => !p.includes("db-patroni"))).toEqual([]);
  });
});
