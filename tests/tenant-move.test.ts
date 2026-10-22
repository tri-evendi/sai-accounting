/**
 * Aturan `bun run tenant:move` (tahap 4) — `src/lib/tenant-move.ts`.
 *
 * Yang dijaga: pemindahan hanya berjalan pada buku yang tidak bisa ditulis
 * siapa pun, tidak pernah menimpa, dan salinan lamanya diganti nama dengan
 * bentuk yang masih sah sebagai pengenal PostgreSQL.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  countMismatches,
  moveRefusals,
  parseMoveArgs,
  retiredDatabaseName,
  type MoveFacts,
} from "@/lib/tenant-move";
import { SAFE_DATABASE_NAME } from "@sai/db/company-url";
import { AKAR_REPO } from "./akar-sumber";

const SIAP: MoveFacts = {
  company: { slug: "cv-maju", databaseName: "sai_t1_cv_maju", isActive: false, dbInstanceKey: null },
  targetKey: "db2",
  targetKnown: true,
  targetActive: true,
  targetUrlSet: true,
  sourceDatabaseExists: true,
  targetDatabaseExists: false,
  targetDatabaseTables: 0,
};

const kode = (f: Omit<Partial<MoveFacts>, "company"> & { company?: Partial<MoveFacts["company"]> }) =>
  moveRefusals({ ...SIAP, ...f, company: { ...SIAP.company, ...f.company } }).map((r) => r.code);

describe("moveRefusals", () => {
  it("keadaan siap: tidak ada penolakan", () => {
    expect(kode({})).toEqual([]);
  });

  it("PT yang masih AKTIF ditolak — dump harus isi buku, bukan potret yang tertinggal", () => {
    expect(kode({ company: { isActive: true } })).toEqual(["company_active"]);
  });

  it("tujuan = asal ditolak", () => {
    expect(kode({ targetKey: null })).toEqual(["same_instance"]);
  });

  it("instans tak dikenal, nonaktif, atau tanpa URL ditolak", () => {
    expect(kode({ targetKnown: false })).toEqual(["target_unknown"]);
    expect(kode({ targetActive: false })).toEqual(["target_inactive"]);
    expect(kode({ targetUrlSet: false })).toEqual(["target_url_missing"]);
  });

  it("tidak pernah menimpa basis data tujuan yang berisi; yang kosong boleh dipakai", () => {
    expect(kode({ targetDatabaseExists: true, targetDatabaseTables: 3 })).toEqual(["target_not_empty"]);
    expect(kode({ targetDatabaseExists: true, targetDatabaseTables: 0 })).toEqual([]);
  });

  it("registry dan server yang tidak sepakat ditolak", () => {
    expect(kode({ sourceDatabaseExists: false })).toEqual(["source_missing"]);
  });

  it("semua alasan dilaporkan sekaligus", () => {
    expect(kode({ company: { isActive: true }, targetUrlSet: false })).toEqual([
      "company_active",
      "target_url_missing",
    ]);
  });
});

describe("retiredDatabaseName", () => {
  const hari = new Date("2026-10-22T08:00:00Z");

  it("<nama>_moved_<yyyymmdd>", () => {
    expect(retiredDatabaseName("sai_t1_cv_maju", hari)).toBe("sai_t1_cv_maju_moved_20261022");
  });

  it("tetap ≤ 63 karakter dan sah sebagai nama basis data", () => {
    const panjang = `sai_t1_${"x".repeat(57)}`;
    const r = retiredDatabaseName(panjang, hari);
    expect(r.length).toBeLessThanOrEqual(63);
    expect(r.endsWith("_moved_20261022")).toBe(true);
    expect(SAFE_DATABASE_NAME.test(r)).toBe(true);
  });
});

describe("countMismatches", () => {
  it("sama persis → kosong", () => {
    expect(countMismatches({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
  });

  it("selisih jumlah, tabel hilang, dan tabel asing semuanya terlaporkan", () => {
    expect(countMismatches({ a: 1, b: 2 }, { a: 0, c: 5 })).toEqual([
      "a: asal 1 baris, tujuan 0 baris",
      "b: tidak ada di tujuan (asal 2 baris)",
      "c: hanya ada di tujuan (5 baris)",
    ]);
  });
});

describe("parseMoveArgs", () => {
  it("pratinjau secara bawaan", () => {
    expect(parseMoveArgs(["--database", "sai_x", "--to", "db2"])).toEqual({
      databaseName: "sai_x",
      to: "db2",
      apply: false,
      reason: null,
    });
  });

  it("`--to default` = instans bawaan (null); tanpa `--to` = undefined", () => {
    expect(parseMoveArgs(["--database", "sai_x", "--to", "default"]).to).toBeNull();
    expect(parseMoveArgs(["--database", "sai_x"]).to).toBeUndefined();
  });
});

describe("skripnya", () => {
  const isi = readFileSync(join(AKAR_REPO, "scripts/tenant-move.ts"), "utf8");

  it("membalik registry dengan syarat nilai lama MASIH sama dan PT masih nonaktif", () => {
    expect(isi).toMatch(
      /updateMany\(\{\s*where: \{ id: company\.id, dbInstanceKey: company\.dbInstanceKey, isActive: false \}/
    );
  });

  it("registry dibalik SESUDAH pembandingan isi, dan salinan asal tidak di-DROP", () => {
    expect(isi.indexOf("countMismatches(")).toBeLessThan(isi.indexOf("updateMany("));
    expect(isi).not.toMatch(/DROP DATABASE|\.hapus\(/);
  });

  it("terdaftar sebagai `tenant:move` di package.json", () => {
    const pkg = JSON.parse(readFileSync(join(AKAR_REPO, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["tenant:move"]).toBe("tsx scripts/tenant-move.ts");
  });
});
