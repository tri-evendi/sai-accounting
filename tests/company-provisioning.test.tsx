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
  normalizeSlug,
  ProvisionError,
} from "@/lib/company-provisioning-shared";
import { migrationChecksum } from "@/lib/company-provisioning";
import {
  ProvisionProgress,
  PROVISION_STEPS,
  type ProvisionState,
} from "@/app/(dashboard)/companies/new/provision-progress";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionary";
import id from "@/lib/i18n/dictionaries/id.json";

describe("nama basis data — ini penjaga keamanan, bukan kerapian", () => {
  it("selalu berawalan sai_ (pola yang sama dengan hak akses di server)", () => {
    expect(databaseNameForSlug("pt-bumi-baru")).toBe("sai_pt_bumi_baru");
    expect(databaseNameForSlug("pt-bumi-baru").startsWith(COMPANY_DATABASE_PREFIX)).toBe(true);
  });

  it("membuang apa pun yang bisa keluar dari nama di dalam SQL", () => {
    for (const hostile of [
      "pt`; DROP DATABASE sai_production; --",
      "pt' OR '1'='1",
      "pt/../etc",
      "PT Besar   Sekali",
    ]) {
      const name = databaseNameForSlug(hostile);
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

  it("menolak nama yang terlalu panjang", () => {
    expect(() => assertSafeDatabaseName("sai_" + "a".repeat(80))).toThrow(ProvisionError);
    // …dan penurunan dari slug tidak pernah menghasilkan yang terlalu panjang.
    expect(databaseNameForSlug("x".repeat(200)).length).toBeLessThanOrEqual(60);
  });

  it("slug dinormalkan sama di formulir dan di server", () => {
    expect(normalizeSlug("  PT Bumi Baru!  ")).toBe("pt-bumi-baru");
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
    expect(html).toContain("text-destructive");
    // 2 dari 4 — pengguna tetap tahu sejauh mana ia sampai sebelum gagal.
    expect(html).toContain("2/4");
  });

  it("hitungan tahap memakai tabular-nums supaya barisnya tidak bergeser", () => {
    const html = render({ current: "migrate", completed: new Set(["validate"]) });
    expect(html).toContain("tabular-nums");
  });
});
