/**
 * Penyediaan perusahaan dari aplikasi (issue #104).
 *
 * Dua hal yang diuji di sini punya alasan yang sangat berbeda:
 *
 *  1. **Nama basis data.** Ia tidak bisa diparameterkan dalam `CREATE
 *     DATABASE`, jadi mau tak mau ikut sebagai TEKS ke dalam SQL. Semua tes
 *     bentuk nama di bawah adalah tes keamanan, bukan tes kerapian.
 *
 *  2. **Checksum migration.** Aplikasi menerapkan migration sendiri (image
 *     produksi tidak memuat Prisma CLI), lalu menulis pembukuannya ke
 *     `_prisma_migrations`. Bila rumus checksum-nya meleset, setiap
 *     `prisma migrate deploy` BERIKUTNYA akan menolak basis data itu — dan
 *     baru ketahuan saat rilis, di perusahaan yang sudah dipakai orang.
 *     Nilai di bawah dicocokkan dengan yang ditulis Prisma di produksi.
 *
 * Ditambah satu janji tampilan: kemajuan yang ditampilkan harus SUNGGUHAN.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createHash } from "node:crypto";

import {
  assertSafeDatabaseName,
  COMPANY_DATABASE_PREFIX,
  databaseNameForSlug,
  firstConflict,
  MAX_DATABASE_NAME_LENGTH,
  normalizeSlug,
  ProvisionError,
  resolveDatabaseName,
} from "@/lib/company-provisioning-shared";
import { proveCompanySlugScope } from "@/lib/company-slug-proof";
import { migrationChecksum } from "@/lib/company-provisioning";
import {
  ProvisionProgress,
  PROVISION_STEPS,
  type ProvisionState,
} from "@/app/(tenant)/companies/new/provision-progress";
import { LocaleProvider } from "@/lib/i18n/client";
import { MONEY_TOKENS_LIGHT } from "@/lib/theme/antd-tokens";
import type { Dictionary } from "@/lib/i18n/dictionary";
import id from "@/lib/i18n/dictionaries/id.json";

describe("nama basis data — ini penjaga keamanan, bukan kerapian", () => {
  it("selalu berawalan sai_ (pola yang sama dengan hak akses di server), dengan id tenant di awalan (issue #153)", () => {
    expect(databaseNameForSlug("pt-bumi-baru", 7)).toBe("sai_t7_pt_bumi_baru");
    expect(databaseNameForSlug("pt-bumi-baru", 7).startsWith(COMPANY_DATABASE_PREFIX)).toBe(true);
  });

  it("membuang apa pun yang bisa keluar dari nama di dalam SQL", () => {
    for (const hostile of [
      "pt`; DROP DATABASE sai_production; --",
      "pt' OR '1'='1",
      "pt/../etc",
      "PT Besar   Sekali",
    ]) {
      const name = databaseNameForSlug(hostile, 3);
      expect(name).toMatch(/^[a-z0-9_]+$/);
      expect(() => assertSafeDatabaseName(name)).not.toThrow();
    }
  });

  it("menolak nama yang tidak berawalan sai_", () => {
    expect(() => assertSafeDatabaseName("mysql")).toThrow(ProvisionError);
    expect(() => assertSafeDatabaseName("sai_production_ok")).not.toThrow();
  });

  it("menolak karakter di luar [a-z0-9_] meski awalannya benar", () => {
    expect(() => assertSafeDatabaseName("sai_a`b")).toThrow(ProvisionError);
    expect(() => assertSafeDatabaseName("sai_a;b")).toThrow(ProvisionError);
    expect(() => assertSafeDatabaseName("sai_A")).toThrow(ProvisionError);
  });

  it("menegakkan batas 64 karakter — batas identifier MySQL/MariaDB, bukan pilihan", () => {
    expect(MAX_DATABASE_NAME_LENGTH).toBe(64);
    expect(() => assertSafeDatabaseName("sai_" + "a".repeat(80))).toThrow(ProvisionError);
    expect(() => assertSafeDatabaseName("sai_" + "a".repeat(61))).toThrow(ProvisionError); // 65
    expect(() => assertSafeDatabaseName("sai_" + "a".repeat(60))).not.toThrow(); // tepat 64
    // …dan penurunan dari slug + awalan tenant tidak pernah melewatinya,
    // bahkan dengan id tenant terbesar dan slug terpanjang.
    expect(databaseNameForSlug("x".repeat(200), 2147483647).length).toBeLessThanOrEqual(64);
    expect(() =>
      assertSafeDatabaseName(databaseNameForSlug("x".repeat(200), 2147483647))
    ).not.toThrow();
  });

  it("pemotongan memakan EKOR slug, tidak pernah id tenant di awalan", () => {
    const name = databaseNameForSlug("x".repeat(200), 2147483647);
    expect(name.startsWith("sai_t2147483647_")).toBe(true);
  });

  it("slug dinormalkan sama di formulir dan di server", () => {
    expect(normalizeSlug("  PT Bumi Baru!  ")).toBe("pt-bumi-baru");
  });
});

describe("slug unik per TENANT (issue #153) — bukan lagi se-pemasangan", () => {
  const registry = [
    { tenantId: 1, slug: "cv-maju", databaseName: "sai_cv_maju" }, // warisan, nama lama
    { tenantId: 1, slug: "pt-lama", databaseName: "sai_t1_pt_lama" },
  ];

  it("dua tenant memilih slug sama: keduanya lolos, tiap-tiap ke basis datanya sendiri", () => {
    const a = { tenantId: 1, slug: "pusat", databaseName: databaseNameForSlug("pusat", 1) };
    const b = { tenantId: 2, slug: "pusat", databaseName: databaseNameForSlug("pusat", 2) };
    expect(firstConflict(registry, a)).toBeNull();
    expect(firstConflict([...registry, { ...a }], b)).toBeNull();
    expect(a.databaseName).toBe("sai_t1_pusat");
    expect(b.databaseName).toBe("sai_t2_pusat");
    expect(a.databaseName).not.toBe(b.databaseName);
  });

  it("slug kembar DI DALAM satu tenant ditolak — dengan pesan yang jelas", () => {
    expect(
      firstConflict(registry, {
        tenantId: 1,
        slug: "cv-maju",
        databaseName: databaseNameForSlug("cv-maju", 1),
      })
    ).toBe("slug");
    // Kolasi registry case-insensitive — keputusannya harus ikut.
    expect(
      firstConflict(registry, {
        tenantId: 1,
        slug: "CV-MAJU",
        databaseName: "sai_t1_cv_maju",
      })
    ).toBe("slug");
  });

  it("slug milik TENANT LAIN tak bisa dibedakan dari slug bebas — jawabannya identik", () => {
    // "cv-maju" milik tenant 1. Bagi tenant 2 ia HARUS tampak persis seperti
    // slug yang belum pernah dipakai siapa pun: keputusan yang sama (null),
    // jadi jalur kode, pesan, status, dan waktu responsnya juga sama.
    const takenElsewhere = firstConflict(registry, {
      tenantId: 2,
      slug: "cv-maju",
      databaseName: databaseNameForSlug("cv-maju", 2),
    });
    const genuinelyFree = firstConflict(registry, {
      tenantId: 2,
      slug: "belum-pernah-ada",
      databaseName: databaseNameForSlug("belum-pernah-ada", 2),
    });
    expect(takenElsewhere).toBeNull();
    expect(takenElsewhere).toBe(genuinelyFree);
  });

  it("nama basis data tetap dijaga GLOBAL — ruang nama fisik server", () => {
    expect(
      firstConflict(registry, {
        tenantId: 2,
        slug: "apa-saja",
        databaseName: "sai_cv_maju", // eksplisit, kebetulan milik tenant 1
      })
    ).toBe("database");
  });

  it("nama eksplisit (--database, jalur adopsi) dipakai apa adanya; tanpa itu diturunkan", () => {
    expect(resolveDatabaseName(9, "pt-baru", "sai_warisan_lama")).toBe("sai_warisan_lama");
    expect(resolveDatabaseName(9, "pt-baru", "  sai_warisan_lama  ")).toBe("sai_warisan_lama");
    expect(resolveDatabaseName(9, "pt-baru", undefined)).toBe("sai_t9_pt_baru");
    expect(resolveDatabaseName(9, "pt-baru", "")).toBe("sai_t9_pt_baru");
  });
});

describe("pembuktian lingkup slug (scripts/prove-company-slug-scope.ts) — gerbang migration 0009", () => {
  const clean = [
    { id: 1, slug: "pt-sai", databaseName: "sai_dev", tenantId: 1 },
    { id: 2, slug: "cv-maju", databaseName: "sai_cv_maju", tenantId: 2 },
    // Slug sama di tenant BERBEDA justru keadaan yang disahkan #153.
    { id: 3, slug: "cv-maju", databaseName: "sai_t1_cv_maju", tenantId: 1 },
  ];

  it("data bersih → tanpa cacat (slug kembar lintas tenant BUKAN cacat)", () => {
    expect(proveCompanySlugScope(clean)).toEqual([]);
  });

  it("slug kembar di SATU tenant tertangkap — dan barisnya disebut", () => {
    const failures = proveCompanySlugScope([
      ...clean,
      { id: 4, slug: "pt-sai", databaseName: "sai_t1_pt_sai", tenantId: 1 },
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('slug "pt-sai" kembar di tenant 1');
    expect(failures[0]).toContain("#1");
    expect(failures[0]).toContain("#4");
  });

  it("perusahaan tanpa tenant tertangkap — indeks komposit tidak menjaga NULL", () => {
    const failures = proveCompanySlugScope([
      { id: 9, slug: "yatim", databaseName: "sai_yatim", tenantId: null },
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("tenant_id kosong");
    expect(failures[0]).toContain("#9");
  });

  it("database_name kembar tertangkap — dua baris registry menunjuk buku yang sama", () => {
    const failures = proveCompanySlugScope([
      ...clean,
      { id: 5, slug: "pt-lain", databaseName: "SAI_DEV", tenantId: 2 }, // kolasi ci
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("database_name");
    expect(failures[0]).toContain("#1");
    expect(failures[0]).toContain("#5");
  });
});

describe("checksum migration — kontrak dengan `prisma migrate deploy`", () => {
  it("adalah sha256 heksadesimal atas ISI berkas, apa adanya", () => {
    const sql = "-- contoh\nCREATE TABLE `x` (`id` int);\n";
    expect(migrationChecksum(sql)).toBe(createHash("sha256").update(sql).digest("hex"));
    expect(migrationChecksum(sql)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("Buffer dan string dengan isi sama menghasilkan checksum sama", () => {
    // Berkas dibaca sebagai Buffer; tesnya memakai string. Keduanya harus
    // bertemu di nilai yang sama, atau pembukuannya hanya benar di salah satu.
    const sql = "ALTER TABLE `y` ADD COLUMN `z` int;\n";
    expect(migrationChecksum(Buffer.from(sql, "utf8"))).toBe(migrationChecksum(sql));
  });
});

function render(state: ProvisionState) {
  return renderToStaticMarkup(
    <LocaleProvider locale="id" dictionary={id as unknown as Dictionary}>
      <ProvisionProgress state={state} />
    </LocaleProvider>
  );
}

describe("kemajuan penyediaan: yang ditampilkan harus sungguhan", () => {
  it("SELURUH tahap terlihat sejak awal — bukan tumbuh satu per satu", () => {
    // Daftar yang tumbuh tidak pernah memberi tahu ada berapa tahap, jadi
    // setiap jeda terasa seperti mungkin macet.
    const html = render({ current: "validate", completed: new Set() });
    for (const label of [
      id.companies.stepValidate,
      id.companies.stepDatabase,
      id.companies.stepMigrate,
      id.companies.stepRegister,
    ]) {
      expect(html).toContain(label);
    }
    expect(PROVISION_STEPS).toHaveLength(4);
  });

  it("bilah determinate hanya muncul saat kemajuannya memang dilaporkan", () => {
    const withProgress = render({
      current: "migrate",
      completed: new Set(["validate", "create_database"]),
      migrateProgress: 0.5,
    });
    expect(withProgress).toContain('role="progressbar"');
    expect(withProgress).toContain('aria-valuenow="50"');

    // Tahap yang tidak melaporkan kemajuan TIDAK diberi bilah — bilah yang
    // bergerak berdasarkan jadwal karangan merusak kepercayaan pada indikator.
    const withoutProgress = render({ current: "register", completed: new Set(["validate"]) });
    expect(withoutProgress).not.toContain('role="progressbar"');
  });

  it("daftar tahap TIDAK diumumkan terus-menerus", () => {
    // Tahap migration memperbarui barisnya puluhan kali; menjadikannya live
    // region akan membuat pembaca layar membacakannya tanpa henti.
    const html = render({ current: "migrate", completed: new Set(), migrateProgress: 0.2 });
    expect(html).toContain('aria-live="off"');
  });

  it("tahap yang gagal ditandai, dan yang sudah selesai tetap terbaca selesai", () => {
    const html = render({
      current: "migrate",
      completed: new Set(["validate", "create_database"]),
      failed: true,
    });
    /*
     * Sejak #200 penandanya bukan lagi kelas `text-destructive` melainkan token
     * uang (#186) — dan yang dicocokkan di sini NILAI TOKENNYA, bukan hex yang
     * diketik ulang: kalau paletnya diubah, tes ini ikut bergeser alih-alih
     * gagal karena alasan yang salah. Render tes berjalan di luar
     * `AntdProvider`, jadi `moneyPalette` memakai jalur cadangan tema terang.
     *
     * Warnanya tidak pernah penanda tunggal: ikon tahapnya berganti BENTUK
     * (centang → segitiga peringatan), dan perpindahannya diumumkan
     * `ProvisionAnnouncer`.
     */
    expect(html).toContain(MONEY_TOKENS_LIGHT.colorMoneyNegative);
    expect(html).toContain("lucide-triangle-alert");
    // 2 dari 4 — pengguna tetap tahu sejauh mana ia sampai sebelum gagal.
    expect(html).toContain("2/4");
  });

  it("hitungan tahap memakai tabular-nums supaya barisnya tidak bergeser", () => {
    const html = render({ current: "migrate", completed: new Set(["validate"]) });
    expect(html).toContain("tabular-nums");
  });
});
