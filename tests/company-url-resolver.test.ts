/**
 * PENJAGA penyelesai URL buku PT (`@sai/db/company-url`) — tahap 4, rancangan
 * 09 §9: buku PT dipecah ke beberapa instans `db-postgres`.
 *
 * Tiga hal dijaga, dan urutannya mengikuti harga kegagalannya:
 *
 *   1. Instans yang tak terselesaikan MELEMPAR. Jatuh ke bawaan berarti
 *      membuka basis data bernama SAMA di server bawaan — salinan lama buku PT
 *      yang sudah pindah — dan menulis ke sana tanpa satu galat pun.
 *   2. Pemasangan satu server (keadaan produksi hari ini) mendapat jawaban yang
 *      PERSIS sama dengan sebelum tahap 4.
 *   3. Tidak ada kode di luar penyelesai yang menyusun URL buku PT sendiri.
 *      Delapan salinan rumus "template + ganti pathname" sepakat selama hanya
 *      ada satu server; salinan yang lupa membaca `db_instance_key` adalah
 *      lubang (1) yang tidak terlihat sampai hari PT pertama dipindah.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  COMPANY_DATABASE_TARGET_SELECT,
  DB_INSTANCE_KEY_PATTERN,
  DB_INSTANCE_URL_ENV_PATTERN,
  DbInstanceResolutionError,
  companyDatabaseUrl,
  companyPoolKey,
  companyReadReplicaUrl,
  companyServerConnection,
  findDbInstance,
  instanceServerUrl,
  suggestedUrlEnvVar,
  toCompanyDatabaseTarget,
} from "@sai/db/company-url";
import { AKAR_REPO, berkasSumber, tanpaKomentar } from "./akar-sumber";

const DB2 = { key: "db2", urlEnvVar: "COMPANY_DB2_DATABASE_URL_TEMPLATE" };

describe("instans bawaan — perilaku sebelum tahap 4, tanpa satu perubahan", () => {
  it("rantai template sama persis: COMPANY_DATABASE_URL_TEMPLATE → DATABASE_URL → CONTROL_DATABASE_URL", () => {
    const t = { databaseName: "sai_pt_a", dbInstance: null };
    expect(
      companyDatabaseUrl(t, {
        COMPANY_DATABASE_URL_TEMPLATE: "postgresql://a:x@tpl:5432/x",
        DATABASE_URL: "postgresql://b:x@db:5432/y",
        CONTROL_DATABASE_URL: "postgresql://c:x@ctl:5432/sai_control",
      })
    ).toBe("postgresql://a:x@tpl:5432/sai_pt_a");
    expect(
      companyDatabaseUrl(t, {
        DATABASE_URL: "postgresql://b:x@db:5432/y",
        CONTROL_DATABASE_URL: "postgresql://c:x@ctl:5432/sai_control",
      })
    ).toBe("postgresql://b:x@db:5432/sai_pt_a");
    expect(
      companyDatabaseUrl(t, { CONTROL_DATABASE_URL: "postgresql://c:x@ctl:5432/sai_control" })
    ).toBe("postgresql://c:x@ctl:5432/sai_pt_a");
  });

  it("parameter kueri template ikut terbawa (pgbouncer, sslmode)", () => {
    expect(
      companyDatabaseUrl(
        { databaseName: "sai_pt_a", dbInstance: null },
        { COMPANY_DATABASE_URL_TEMPLATE: "postgresql://a:x@pool:6432/x?pgbouncer=true" }
      )
    ).toBe("postgresql://a:x@pool:6432/sai_pt_a?pgbouncer=true");
  });

  it("server penyediaan bawaan: PROVISION_DATABASE_URL → CONTROL_DATABASE_URL", () => {
    expect(
      instanceServerUrl(null, {
        PROVISION_DATABASE_URL: "postgresql://p:x@db:5432/sai_control",
        CONTROL_DATABASE_URL: "postgresql://c:x@db:5432/sai_control",
      }).username
    ).toBe("p");
    expect(
      instanceServerUrl(null, { CONTROL_DATABASE_URL: "postgresql://c:x@db:5432/sai_control" }).username
    ).toBe("c");
  });

  it("tanpa sumber kredensial apa pun: melempar, bukan menebak", () => {
    expect(() => companyDatabaseUrl({ databaseName: "sai_pt_a", dbInstance: null }, {})).toThrow(
      DbInstanceResolutionError
    );
  });

  it("kunci kolam bawaan tidak bisa bertabrakan dengan instans mana pun", () => {
    expect(companyPoolKey({ databaseName: "sai_pt_a", dbInstance: null })).toBe("/sai_pt_a");
    expect(companyPoolKey({ databaseName: "sai_pt_a", dbInstance: DB2 })).toBe("db2/sai_pt_a");
  });
});

describe("instans tambahan", () => {
  const env = {
    COMPANY_DATABASE_URL_TEMPLATE: "postgresql://a:x@db:5432/x",
    COMPANY_DB2_DATABASE_URL_TEMPLATE: "postgresql://a2:y@db2:5432/x",
    CONTROL_DATABASE_URL: "postgresql://c:x@db:5432/sai_control",
  };

  it("memakai template instansnya sendiri", () => {
    expect(companyDatabaseUrl({ databaseName: "sai_pt_a", dbInstance: DB2 }, env)).toBe(
      "postgresql://a2:y@db2:5432/sai_pt_a"
    );
  });

  it("env var instans tidak diset → MELEMPAR, tidak pernah jatuh ke template bawaan", () => {
    const tanpa: Record<string, string | undefined> = { ...env };
    delete tanpa.COMPANY_DB2_DATABASE_URL_TEMPLATE;
    expect(() => companyDatabaseUrl({ databaseName: "sai_pt_a", dbInstance: DB2 }, tanpa)).toThrow(
      /COMPANY_DB2_DATABASE_URL_TEMPLATE/
    );
  });

  it("nama env var di luar bentuknya ditolak — baris registry tidak bisa menunjuk rahasia lain", () => {
    for (const urlEnvVar of ["CONTROL_DATABASE_URL", "COMPANY_DATABASE_URL_TEMPLATE", "PLATFORM_DATABASE_URL"]) {
      expect(() =>
        companyDatabaseUrl({ databaseName: "sai_pt_a", dbInstance: { key: "db2", urlEnvVar } }, env)
      ).toThrow(DbInstanceResolutionError);
    }
  });

  it("kunci `default` dicadangkan untuk instans bawaan", () => {
    expect(() =>
      companyDatabaseUrl(
        { databaseName: "sai_pt_a", dbInstance: { key: "default", urlEnvVar: "COMPANY_DEFAULT_DATABASE_URL_TEMPLATE" } },
        env
      )
    ).toThrow(DbInstanceResolutionError);
  });

  it("kredensial kendali (`defaultServerUrl`) tidak pernah dipakai untuk instans lain", () => {
    const ctl = "postgresql://c:x@db:5432/sai_control";
    expect(companyServerConnection({ databaseName: "sai_pt_a", dbInstance: null }, ctl, env).serverUrl).toBe(ctl);
    expect(
      new URL(companyServerConnection({ databaseName: "sai_pt_a", dbInstance: DB2 }, ctl, env).serverUrl).hostname
    ).toBe("db2");
  });

  it("replika baca bawaan menolak PT di instans lain", () => {
    expect(() =>
      companyReadReplicaUrl({ databaseName: "sai_pt_a", dbInstance: DB2 }, new URL("postgresql://r@replica/x"))
    ).toThrow(DbInstanceResolutionError);
  });

  it("nama basis data tetap diperiksa", () => {
    expect(() => companyDatabaseUrl({ databaseName: "x; DROP", dbInstance: DB2 }, env)).toThrow(/tidak sah/);
  });

  it("saran nama env var memenuhi bentuknya sendiri", () => {
    expect(suggestedUrlEnvVar("db2")).toBe("COMPANY_DB2_DATABASE_URL_TEMPLATE");
    expect(DB_INSTANCE_URL_ENV_PATTERN.test(suggestedUrlEnvVar("eu_west_1"))).toBe(true);
  });
});

describe("baris registry → target", () => {
  it("db_instance_key NULL = instans bawaan", () => {
    expect(
      toCompanyDatabaseTarget({ databaseName: "sai_pt_a", dbInstanceKey: null, dbInstance: null })
    ).toEqual({ databaseName: "sai_pt_a", dbInstance: null });
  });

  it("kunci terisi tetapi instansnya tidak ikut dimuat → MELEMPAR (bukan bawaan)", () => {
    expect(() =>
      toCompanyDatabaseTarget({ databaseName: "sai_pt_a", dbInstanceKey: "db2", dbInstance: null })
    ).toThrow(/db2/);
  });

  it("kolom tidak ikut di-SELECT (undefined) → MELEMPAR", () => {
    expect(() =>
      toCompanyDatabaseTarget({ databaseName: "sai_pt_a" } as unknown as Parameters<
        typeof toCompanyDatabaseTarget
      >[0])
    ).toThrow(/COMPANY_DATABASE_TARGET_SELECT/);
  });

  it("kunci yang tidak dikenal di daftar instans → MELEMPAR", () => {
    expect(findDbInstance(null, [DB2])).toBeNull();
    expect(findDbInstance("default", [DB2])).toBeNull();
    expect(findDbInstance("db2", [DB2])).toEqual(DB2);
    expect(() => findDbInstance("db3", [DB2])).toThrow(/db3.*tidak dikenal/);
  });

  it("pilihan select memuat kunci DAN relasinya", () => {
    expect(COMPANY_DATABASE_TARGET_SELECT).toEqual({
      databaseName: true,
      dbInstanceKey: true,
      dbInstance: { select: { key: true, urlEnvVar: true } },
    });
  });
});

describe("migration 0009 sepakat dengan penyelesai", () => {
  const sql = readFileSync(
    join(AKAR_REPO, "prisma/postgresql/control/0009_db_instances/migration.sql"),
    "utf8"
  );

  it("CHECK kunci dan env var memakai pola yang sama dengan kode", () => {
    /* Dua pola yang menyimpang = baris yang diterima basis data tapi ditolak
       penyelesai (PT yang tak bisa dibuka), atau sebaliknya. */
    expect(sql).toContain(`'${DB_INSTANCE_KEY_PATTERN.source}'`);
    expect(sql).toContain(`'${DB_INSTANCE_URL_ENV_PATTERN.source}'`);
    expect(sql).toMatch(/"key" <> 'default'/);
  });

  it("expand saja: tidak menyisipkan atau mengubah satu baris pun", () => {
    const kode = sql.replace(/--.*$/gm, "");
    /* Pernyataan yang DIAWALI tulisan data — `ON DELETE RESTRICT` pada FK bukan. */
    expect(kode).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)\b/im);
    expect(kode).toMatch(/ADD COLUMN "db_instance_key" VARCHAR\(32\);/);
  });
});

/* ══ PEMINDAI: tidak ada penyusun URL buku PT di luar penyelesai ═══════════ */

const PENYELESAI = "packages/db/src/company-url.ts";

/** `scripts/` + `workers/` — di luar `akarSumber()`, tetapi justru di sanalah
 *  salinan rumus lama paling banyak hidup (fan-out, cron, alat operator). */
function berkasSkrip(): { rel: string; isi: string }[] {
  const out: { rel: string; isi: string }[] = [];
  const jelajah = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const nama of readdirSync(dir)) {
      if (nama === "node_modules") continue;
      const jalur = join(dir, nama);
      if (statSync(jalur).isDirectory()) jelajah(jalur);
      else if (/\.(ts|tsx|mts)$/.test(nama)) {
        out.push({ rel: relative(AKAR_REPO, jalur).split(sep).join("/"), isi: readFileSync(jalur, "utf8") });
      }
    }
  };
  jelajah(join(AKAR_REPO, "scripts"));
  jelajah(join(AKAR_REPO, "workers"));
  return out;
}

function semuaKode(): { rel: string; isi: string }[] {
  const sumber = berkasSumber([".ts", ".tsx"]).map((b) => ({
    rel: relative(AKAR_REPO, b.jalur).split(sep).join("/"),
    isi: b.isi,
  }));
  return [...sumber, ...berkasSkrip()].map((b) => ({ rel: b.rel, isi: tanpaKomentar(b.isi) }));
}

/**
 * Pembuka sambungan MENTAH ke buku PT (`bukaBasisData`). Setiap pemakai wajib
 * mengambil URL server-nya dari penyelesai — dibuktikan oleh impornya — dan
 * daftarnya ditulis di sini supaya pemakai BARU harus melewati tinjauan.
 */
const PEMBUKA_MENTAH: Record<string, string> = {
  "packages/db/src/server.ts": "definisinya",
  "src/lib/company-provisioning.ts": "penyediaan — instanceServerUrl(instans sasaran)",
  "apps/operator/src/lib/operator/writes.ts": "jangkar retensi — companyServerConnection",
  "apps/operator/src/lib/operator/backups.ts": "versi skema per buku — companyServerConnection",
  /* Hibah peran aplikasi (hak minimum, Okt 2026): dibuka di server yang SAMA
     yang baru saja membuat/memulihkan buku itu, lalu `appRoleForNewBook`. */
  "scripts/create-company.ts": "hibah peran aplikasi — server yang membuat buku (CONTROL di `migrate`)",
  "scripts/tenant-move.ts": "hibah peran aplikasi — instanceServerUrl(instans tujuan)",
  "scripts/tenant-import-onprem.ts": "hibah peran aplikasi — instanceServerUrl(null)",
};

/** `buatAdapter(…, { database: … })` — menimpa basis data di URL. */
const PENIMPA_DATABASE: Record<string, string> = {
  "packages/db/src/adapter.ts": "definisinya",
  "scripts/prove-company-slug-immutable.ts": "basis data KENDALI (bukti MariaDB lama), bukan buku PT",
};

describe("tidak ada penyusun URL buku PT di luar @sai/db/company-url", () => {
  const kode = semuaKode();

  it("pemindai benar-benar melihat kode (bukan lulus karena kosong)", () => {
    expect(kode.length).toBeGreaterThan(300);
    expect(kode.some((b) => b.rel === PENYELESAI)).toBe(true);
    expect(kode.some((b) => b.rel.startsWith("scripts/"))).toBe(true);
    expect(kode.some((b) => b.rel.startsWith("apps/operator/"))).toBe(true);
  });

  it("COMPANY_DATABASE_URL_TEMPLATE hanya dibaca penyelesai", () => {
    const pelanggar = kode
      .filter((b) => b.rel !== PENYELESAI && /\bCOMPANY_DATABASE_URL_TEMPLATE\b/.test(b.isi))
      .map((b) => b.rel);
    expect(pelanggar).toEqual([]);
  });

  it("tidak ada `url.pathname = \\`/${…}\\`` (rumus ganti-nama-basis-data) di luar penyelesai", () => {
    const pelanggar = kode
      .filter((b) => b.rel !== PENYELESAI && /\.pathname\s*=\s*`\/\$\{/.test(b.isi))
      .map((b) => b.rel);
    expect(pelanggar).toEqual([]);
  });

  it("bukaBasisData hanya dipanggil pemakai yang terdaftar, dan masing-masing lewat penyelesai", () => {
    const pemakai = kode.filter((b) => /\bbukaBasisData\s*\(/.test(b.isi)).map((b) => b.rel);
    expect(pemakai.filter((r) => !(r in PEMBUKA_MENTAH))).toEqual([]);
    for (const rel of pemakai) {
      if (rel === "packages/db/src/server.ts") continue;
      const isi = kode.find((b) => b.rel === rel)!.isi;
      expect(isi, rel).toMatch(/from "@sai\/db\/company-url"/);
    }
  });

  it("buatAdapter tidak menimpa `database` di luar daftar", () => {
    const pelanggar = kode
      .filter((b) => /buatAdapter\([^;]*?\bdatabase\s*:/.test(b.isi))
      .map((b) => b.rel)
      .filter((r) => !(r in PENIMPA_DATABASE));
    expect(pelanggar).toEqual([]);
  });

  it("pemindah tenant memakai penyelesai, bukan rumusnya sendiri", () => {
    const isi = kode.find((b) => b.rel === "scripts/tenant-move.ts")!.isi;
    expect(isi).toMatch(/instanceServerUrl/);
    expect(isi).toMatch(/toCompanyDatabaseTarget/);
  });
});
