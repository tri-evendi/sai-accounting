/**
 * PENJAGA: aplikasi tidak lagi menyambung ke PostgreSQL sebagai superuser.
 *
 * Sampai Okt 2026 setiap layanan memakai `sai` — superuser bootstrap. Superuser
 * bisa `COPY … TO PROGRAM` (menjalankan perintah di container `pg`), membaca
 * berkas server, membuat peran, dan mematikan audit. Satu injeksi SQL atau RCE
 * di `app-customer` = seluruh server basis data.
 *
 * Rancangannya tiga peran (`scripts/postgres-roles.py`):
 *   sai_owner  NOSUPERUSER CREATEDB — pemilik; `migrate` + penyediaan PT.
 *   sai_app    DML saja — aplikasi & pekerja, lewat PgBouncer.
 *   sai_backup sai_app + pg_read_all_data — jalur `tenant` (pg_dump).
 *
 * Yang dijaga di sini adalah titik-titik yang, bila menyimpang, membuat PT
 * baru lahir tanpa hak aplikasi (setiap halamannya 42501) atau membuat dua
 * daftar hibah (TS untuk buku baru, Python untuk buku lama) berbeda diam-diam.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { appRoleForNewBook } from "@sai/db/company-url";
import { APP_ROLE_GRANT_TEMPLATE, appRoleGrantSql } from "@sai/db/server";
import { AKAR_REPO, tanpaKomentar } from "./akar-sumber";
import { envMap, loadCompose } from "./compose-yaml";

const baca = (p: string) => readFileSync(join(AKAR_REPO, p), "utf8");
const PY = baca("scripts/postgres-roles.py");

describe("hibah peran aplikasi — satu daftar, dua bahasa", () => {
  it("baris hibah Python SAMA PERSIS dengan `APP_ROLE_GRANT_TEMPLATE`", () => {
    const blok = /APP_ROLE_GRANT_TEMPLATE = \[([\s\S]*?)\n\]/.exec(PY);
    expect(blok, "APP_ROLE_GRANT_TEMPLATE di postgres-roles.py").not.toBeNull();
    const py = [...blok![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(py).toEqual([...APP_ROLE_GRANT_TEMPLATE]);
  });

  it("isinya DML + default privileges — tanpa DDL, tanpa ALL PRIVILEGES", () => {
    const semua = APP_ROLE_GRANT_TEMPLATE.join("\n");
    expect(semua).not.toMatch(/ALL PRIVILEGES|\bCREATE\b|TRUNCATE|REFERENCES|TRIGGER/);
    expect(semua).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES/);
    expect(semua).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES/);
  });

  it("`appRoleGrantSql` menolak nama yang bisa menjadi injeksi", () => {
    expect(appRoleGrantSql("sai_t1_pt", "sai_app")).toContain('TO "sai_app";');
    expect(appRoleGrantSql("sai_t1_pt", "sai_app")).toContain('ON DATABASE "sai_t1_pt"');
    expect(() => appRoleGrantSql("sai_t1_pt", 'x"; DROP ROLE sai; --')).toThrow();
    expect(() => appRoleGrantSql('db"; --', "sai_app")).toThrow();
  });
});

describe("siapa yang dihibahi buku baru", () => {
  const owner = "postgres://sai_owner:o@pgbouncer:5432/sai_control";
  const app = "postgres://sai_app:a@pgbouncer:5432/sai_production";

  it("sebelum peralihan (satu peran untuk semua) → tidak ada hibah", () => {
    const env = { CONTROL_DATABASE_URL: "postgres://sai:x@pgbouncer:5432/sai_control", DATABASE_URL: "postgres://sai:x@pgbouncer:5432/sai_production" };
    expect(appRoleForNewBook(null, env)).toBeNull();
  });

  it("aplikasi: penyedia pemilik, template aplikasi → hibahkan ke aplikasi", () => {
    expect(appRoleForNewBook(null, { PROVISION_DATABASE_URL: owner, CONTROL_DATABASE_URL: app, DATABASE_URL: app })).toBe(
      "sai_app"
    );
  });

  it("`migrate`: template ditimpa ke pemilik, PG_APP_USER yang menentukan", () => {
    expect(
      appRoleForNewBook(null, { PROVISION_DATABASE_URL: owner, COMPANY_DATABASE_URL_TEMPLATE: owner, PG_APP_USER: "sai_app" })
    ).toBe("sai_app");
    expect(appRoleForNewBook(null, { PROVISION_DATABASE_URL: owner, COMPANY_DATABASE_URL_TEMPLATE: owner })).toBeNull();
  });

  it("instans tambahan: template-nya sekaligus penyedianya → tidak ada hibah", () => {
    expect(
      appRoleForNewBook(
        { key: "db2", urlEnvVar: "COMPANY_DB2_DATABASE_URL_TEMPLATE" },
        { COMPANY_DB2_DATABASE_URL_TEMPLATE: owner, PG_APP_USER: "sai_app" }
      )
    ).toBeNull();
  });
});

describe("setiap jalan yang MEMBUAT buku menghibahkannya", () => {
  it("penyediaan PT (`svc-worker`): hibah SEBELUM registry", () => {
    const src = tanpaKomentar(baca("src/lib/company-provisioning.ts"));
    const hibah = src.indexOf("appRoleGrantSql(databaseName, appRole)");
    expect(hibah).toBeGreaterThan(-1);
    expect(src).toContain("appRoleForNewBook(dbInstance)");
    /* Buku yang tidak bisa dibaca aplikasi tidak boleh terdaftar. */
    expect(hibah).toBeLessThan(src.indexOf("controlDb.company.create"));
  });

  it("perkakas `create-company`, `tenant:move`, `tenant:import-onprem` juga", () => {
    for (const f of ["scripts/create-company.ts", "scripts/tenant-move.ts", "scripts/tenant-import-onprem.ts"]) {
      const src = tanpaKomentar(baca(f));
      expect(src, f).toMatch(/appRoleGrantSql\(/);
      expect(src, f).toMatch(/appRoleForNewBook\(/);
    }
  });
});

describe("compose: peran per layanan", () => {
  const svc = loadCompose("docker-compose.yml").services!;
  const env = (s: string) => envMap(svc[s]);

  it("`migrate` menyambung sebagai PEMILIK (jatuh ke superuser hanya sebelum peralihan)", () => {
    for (const k of ["DATABASE_URL", "CONTROL_DATABASE_URL", "PLATFORM_DATABASE_URL", "COMPANY_DATABASE_URL_TEMPLATE", "PROVISION_DATABASE_URL"]) {
      expect(String(env("migrate")[k]), k).toMatch(/^postgres:\/\/\$\{PG_OWNER_USER:-\$\{PG_USER:-sai\}\}:\$\{PG_OWNER_PASSWORD:-\$\{PG_PASSWORD\}\}@pg:5432\//);
    }
  });

  it("`svc-worker` memegang kredensial pemilik HANYA dari `.env`, tidak dirakit dari `PG_OWNER_*`", () => {
    /* Ia penyedia PT sejak Okt 2026; nilainya diteruskan apa adanya, sama
       seperti dulu di `app-customer`. Merakitnya di compose akan membuat sandi
       pemilik muncul di layanan yang juga menjalankan tiga peran lain. */
    expect(Object.keys(env("svc-worker"))).toContain("PROVISION_DATABASE_URL");
    expect(env("svc-worker").PROVISION_DATABASE_URL ?? null).toBeNull();
    for (const v of Object.values(env("svc-worker"))) expect(String(v)).not.toContain("PG_OWNER_");
  });

  it("pagar `svc-worker` = peran aplikasi; jalur `tenant` = peran cadangan", () => {
    expect(String(env("svc-worker").CONTROL_DATABASE_DIRECT_URL)).toMatch(/^postgres:\/\/\$\{PG_APP_USER:-/);
    expect(String(env("svc-integrator").CONTROL_DATABASE_DIRECT_URL)).toMatch(/^postgres:\/\/\$\{PG_BACKUP_USER:-/);
  });

  it("kredensial pemilik tidak sampai ke layanan yang tidak membuat basis data", () => {
    /* `app-customer` ada di daftar ini sejak Okt 2026: penyediaan PT pindah ke
       `svc-worker` (`company.provision`). Penjaga yang lebih luas — semua
       berkas compose, plus graf impor — di `provisioning-off-app-customer`. */
    for (const s of ["app-customer", "app-operator", "svc-integrator"]) {
      expect(Object.keys(env(s)), s).not.toContain("PROVISION_DATABASE_URL");
      for (const v of Object.values(env(s))) expect(String(v), s).not.toContain("PG_OWNER_");
    }
  });
});

describe("atribut peran di `postgres-roles.py`", () => {
  it("pemilik NOSUPERUSER CREATEDB; aplikasi & cadangan tanpa CREATEDB; tidak satu pun CREATEROLE", () => {
    expect(PY).toMatch(/"owner": "LOGIN NOSUPERUSER CREATEDB NOCREATEROLE/);
    expect(PY).toMatch(/"app": "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE/);
    expect(PY).toMatch(/"backup": "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE/);
    expect(PY).not.toMatch(/WITH [^"]*\bSUPERUSER\b(?<!NOSUPERUSER)/);
  });

  it("cadangan = anggota aplikasi + pg_read_all_data (pg_dump tanpa superuser)", () => {
    expect(PY).toContain("GRANT {ident(names['app'])} TO {ident(names['backup'])};");
    expect(PY).toContain("GRANT pg_read_all_data TO {ident(names['backup'])};");
  });

  it("basis data yang digarap berasal dari REGISTRY, bukan dari seluruh `pg_database`", () => {
    expect(PY).toMatch(/SELECT database_name, COALESCE\(db_instance_key, ''\) FROM companies/);
    expect(PY).toContain("tidak terdaftar (TIDAK disentuh)");
  });
});
