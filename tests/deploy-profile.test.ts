/**
 * PENJAGA celah on-premise #1 — profil penyebaran & rumah jejak putaran.
 *
 * Dua hal dijaga di sini, dan keduanya punya bentuk kegagalan yang sama:
 * mereka gagal dengan DIAM.
 *
 *   • Profil yang disimpulkan alih-alih disetel: pemasangan SaaS yang
 *     kehilangan `PLATFORM_DATABASE_URL` akan terbaca sebagai on-premise,
 *     penagihannya berhenti, dan setiap probe tetap hijau.
 *   • Jejak putaran yang kembali ke `sai_platform`: di on-premise basis data
 *     itu tidak dipasang, jadi penjadwal, pemeriksa kesesuaian, dan cadangan
 *     berjalan tanpa bisa menulis maupun membaca jejaknya — dan `/api/health`
 *     kehilangan jawaban atas "apakah cadangan semalam berhasil".
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEPLOY_PROFILE_ENV,
  billingPlaneInstalled,
  deployProfile,
} from "@sai/core/deploy-profile";

const akar = process.cwd();
const baca = (...p: string[]) => readFileSync(join(akar, ...p), "utf8");

describe("profil penyebaran: bawaan dan kosakatanya", () => {
  it("tidak disetel → `saas`, supaya pemasangan yang sudah jalan tidak berubah", () => {
    expect(deployProfile({})).toBe("saas");
    expect(deployProfile({ [DEPLOY_PROFILE_ENV]: "" })).toBe("saas");
    expect(deployProfile({ [DEPLOY_PROFILE_ENV]: "   " })).toBe("saas");
  });

  it("menerima kedua nilai, toleran huruf besar & spasi", () => {
    expect(deployProfile({ [DEPLOY_PROFILE_ENV]: "onprem" })).toBe("onprem");
    expect(deployProfile({ [DEPLOY_PROFILE_ENV]: " ONPREM " })).toBe("onprem");
    expect(deployProfile({ [DEPLOY_PROFILE_ENV]: "SaaS" })).toBe("saas");
  });

  it("nilai asing MELEMPAR — tidak jatuh ke bawaan", () => {
    /* Ini keputusan yang paling mudah dibalik oleh orang berikutnya ("biar
       tidak rewel"), dan akibatnya: pemasangan on-premise yang profilnya salah
       tulis melaporkan penagihannya rusak SELAMANYA, dengan sebab yang tidak
       akan pernah dicari siapa pun di ejaan sebuah variabel. */
    for (const salah of ["on-prem", "premise", "on prem", "true", "1", "local"]) {
      expect(() => deployProfile({ [DEPLOY_PROFILE_ENV]: salah }), salah).toThrow(
        /tidak dikenal/
      );
    }
  });

  it("pesan galatnya menyebut nama variabel DAN nilai yang sah", () => {
    try {
      deployProfile({ [DEPLOY_PROFILE_ENV]: "on-prem" });
      expect.unreachable();
    } catch (e) {
      const pesan = (e as Error).message;
      expect(pesan).toContain(DEPLOY_PROFILE_ENV);
      expect(pesan).toContain("saas");
      expect(pesan).toContain("onprem");
    }
  });

  it("bidang penagihan dipasang di `saas`, tidak di `onprem`", () => {
    expect(billingPlaneInstalled({})).toBe(true);
    expect(billingPlaneInstalled({ [DEPLOY_PROFILE_ENV]: "saas" })).toBe(true);
    expect(billingPlaneInstalled({ [DEPLOY_PROFILE_ENV]: "onprem" })).toBe(false);
  });
});

describe("profil penyebaran: disetel, tidak disimpulkan", () => {
  it("modulnya tidak pernah melihat alamat basis data mana pun", () => {
    // Inti celahnya. Begitu modul ini membaca `PLATFORM_DATABASE_URL`, profil
    // berubah dari konfigurasi menjadi tebakan atas kegagalan.
    const src = baca("packages/core/src/deploy-profile.ts");
    const kode = src
      .split("\n")
      .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
      .join("\n");
    for (const v of ["PLATFORM_DATABASE_URL", "CONTROL_DATABASE_URL", "DATABASE_URL"]) {
      expect(kode, `membaca ${v} — profil jadi tebakan`).not.toContain(v);
    }
  });

  it("MURNI: tanpa Prisma, tanpa `next/*`, tanpa `server-only`", () => {
    // Ia dibaca probe kesehatan DAN skrip di luar Next.
    const src = baca("packages/core/src/deploy-profile.ts");
    for (const t of ["@sai/db", "@prisma", "next/", "server-only"]) {
      expect(src, `mengimpor ${t}`).not.toMatch(new RegExp(`from "${t.replace("/", "\\/")}`));
    }
  });
});

describe("jejak putaran: rumahnya basis data KENDALI", () => {
  const skemaControl = baca("packages/db/prisma/control/schema.prisma");
  const TABEL = ["scheduler_runs", "conformance_runs", "backup_runs"] as const;

  it("ketiga modelnya ada di skema kendali", () => {
    for (const t of TABEL) {
      expect(skemaControl, `${t} tidak ada di skema kendali`).toContain(`@@map("${t}")`);
    }
  });

  it("migration kendali-nya ada dan membuat ketiganya", () => {
    const sql = baca("prisma/postgresql/control/0005_jejak_putaran/migration.sql");
    for (const t of TABEL) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "${t}"`);
    }
    // `IF NOT EXISTS`: pengangkutan manual boleh sudah membuat tabelnya.
    expect(sql).not.toMatch(/CREATE TABLE "(?!_)/);
  });

  it("TIDAK ada kode yang membaca jejak lewat klien platform", () => {
    /* Yang dicari bukan kata `platform`, melainkan delegate jejak yang dipanggil
       PADA klien platform — satu baris seperti itu mengembalikan celahnya utuh. */
    const berkas = [
      "src/lib/health-report.ts",
      "scripts/prune-run-trails.ts",
      "scripts/record-backup-run.ts",
      "scripts/prove-scheduler-alive.ts",
      "scripts/watch-health.ts",
      "scripts/check-data-conformance.ts",
      "scripts/subscription-scheduler.ts",
      "apps/operator/src/lib/operator/store.ts",
      "apps/operator/src/lib/operator/backups.ts",
    ];
    const pola = /\b(platformDb|platform|deps\.platform)\.(schedulerRun|conformanceRun|backupRun)\b/;
    for (const f of berkas) {
      const kode = baca(f)
        .split("\n")
        .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l));
      const kena = kode.filter((l) => pola.test(l));
      expect(kena, `${f}: jejak dibaca lewat klien platform → ${kena.join(" | ")}`).toHaveLength(0);
    }
  });

  it("pengangkutnya ada, idempoten, dan TIDAK menghapus di platform", () => {
    const src = baca("scripts/move-run-trails.ts");
    // Tanpa `skipDuplicates`, jalan ulang melahirkan riwayat ganda.
    expect(src).toContain("skipDuplicates: true");
    // Tanpa setval, INSERT berikutnya dari aplikasi menabrak PK.
    expect(src).toContain("pg_get_serial_sequence");
    // Expand/contract: penghapusan menyusul di rilis berikutnya.
    const kode = src.split("\n").filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l));
    for (const bahaya of ["deleteMany", "DROP TABLE", "TRUNCATE"]) {
      expect(
        kode.filter((l) => l.includes(bahaya)),
        `pengangkut menghapus (${bahaya}) — rollback kehilangan riwayatnya`
      ).toHaveLength(0);
    }
  });
});

describe("penjadwal: on-premise mencatat putarannya, SaaS yang salah setel tidak", () => {
  const src = readFileSync(join(process.cwd(), "scripts", "subscription-scheduler.ts"), "utf8");

  it("profil onprem menulis baris jejak walau tanpa pekerjaan penagihan", () => {
    /* Tanpa baris ini, `/api/health` melaporkan `scheduler: unknown` selamanya
       dan `watch:health` mengirim surel tiap putaran berbunyi "langganan tidak
       diperbarui" — di mesin yang tidak punya satu pun langganan. Alarm yang
       berbunyi tiap jam tanpa sebab adalah alarm yang dimatikan orang. */
    expect(src).toContain("billingPlaneInstalled");
    const i = src.indexOf("if (!billingPlaneInstalled())");
    expect(i, "cabang profil tidak ada").toBeGreaterThan(-1);
    const cabang = src.slice(i, i + 1600);
    expect(cabang).toContain("control.schedulerRun.create");
    expect(cabang).toMatch(/status: "ok"/);
    expect(cabang).toMatch(/invoicesIssued: 0/);
  });

  it("profil saas tanpa alamat platform TIDAK mencatat apa pun", () => {
    // Di sana ketiadaan alamat memang kerusakan, dan jejak yang kosong itulah
    // yang membuat penjaga berbunyi.
    const i = src.indexOf("PLATFORM_DATABASE_URL belum diset pada profil");
    expect(i, "peringatan khusus profil saas tidak ada").toBeGreaterThan(-1);
    const sisa = src.slice(i, i + 400);
    expect(sisa).not.toContain("schedulerRun.create");
    expect(sisa).toContain("process.exit(0)");
  });
});

describe("pelaporan: `not-installed` bukan `unknown`", () => {
  it("probe platform menjawab `not-installed` bila bidangnya tidak dipasang", () => {
    const src = baca("src/lib/health-report.ts");
    expect(src).toContain("billingPlaneInstalled");
    expect(src).toMatch(/if \(!billingPlaneInstalled\(\)\) return \{ status: "not-installed" \}/);
  });

  it("halaman status tidak menghitung `not-installed` sebagai ketidaktahuan", () => {
    /* Baris yang `unknown` selamanya membuat halaman status berhenti dibaca —
       termasuk pada hari ia kuning karena sebab yang sungguhan. */
    const src = baca("packages/core/src/public-status.ts");
    expect(src).toMatch(/not-installed"\s*\n?\s*\?\s*"operational"/);
  });
});
