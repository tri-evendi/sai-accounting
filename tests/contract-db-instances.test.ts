/**
 * PENJAGA kontrak instans basis data lintas bahasa — `contract/db-instances.yaml`
 * (09 §9, tahap 4).
 *
 * Bentuk penyimpangan yang dijaga tidak menghasilkan satu galat kompilasi pun:
 * pola nama env var yang diterima penyelesai Node (`@sai/db/company-url`) tetapi
 * ditolak jalur `tenant` Go membuat PT di instans itu berjalan normal di
 * aplikasi — dan bukunya TIDAK dicadangkan. Kebalikannya, Go yang lebih longgar
 * membaca env var yang tidak pernah boleh menunjuk buku. Jadi:
 *
 *   1. bangkitan tidak basi, dan YAML = TS;
 *   2. tidak ada pola KEDUA yang ditulis tangan di Go, di penyelesai, atau di
 *      pembukti pemulihan (`scripts/prove-backup-restore.ts`).
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import {
  BACKUP_INSTANCE_OBJECT_PREFIX,
  DB_INSTANCE_KEY_PATTERN,
  DB_INSTANCE_URL_ENV_PATTERN,
  DB_INSTANCE_URL_ENV_PREFIX,
  DB_INSTANCE_URL_ENV_SUFFIX,
  DEFAULT_DB_INSTANCE_LABEL,
} from "@sai/db/db-instances";
import * as companyUrl from "@sai/db/company-url";
import { AKAR_REPO, berkasGo } from "./akar-sumber";

const baca = (...p: string[]) => readFileSync(join(AKAR_REPO, ...p), "utf8");
const GEN_GO = "services/integrator/internal/contract/dbinstances_gen.go";

interface Yaml {
  default_label: string;
  key_pattern: string;
  url_env_var: { prefix: string; suffix: string; pattern: string };
  backup: { instance_object_prefix: string };
}
const y = load(baca("contract", "db-instances.yaml")) as Yaml;

describe("kontrak instans: bangkitan sinkron", () => {
  it("`contract:gen --cek` lolos", () => {
    expect(() =>
      execFileSync("bun", ["scripts/contract-generate.ts", "--cek"], {
        cwd: AKAR_REPO,
        stdio: "pipe",
      })
    ).not.toThrow();
  });

  it("YAML dan bangkitan TS menyatakan hal yang sama", () => {
    expect(DEFAULT_DB_INSTANCE_LABEL).toBe(y.default_label);
    expect(DB_INSTANCE_KEY_PATTERN.source).toBe(y.key_pattern);
    expect(DB_INSTANCE_URL_ENV_PATTERN.source).toBe(y.url_env_var.pattern);
    expect(DB_INSTANCE_URL_ENV_PREFIX).toBe(y.url_env_var.prefix);
    expect(DB_INSTANCE_URL_ENV_SUFFIX).toBe(y.url_env_var.suffix);
    expect(BACKUP_INSTANCE_OBJECT_PREFIX).toBe(y.backup.instance_object_prefix);
  });

  it("bangkitan Go memuat pola yang SAMA byte demi byte (raw string)", () => {
    const go = baca(GEN_GO);
    expect(go).toContain(`DBInstanceKeyPattern = \`${y.key_pattern}\``);
    expect(go).toContain(`DBInstanceURLEnvPattern = \`${y.url_env_var.pattern}\``);
    expect(go).toContain(`DBInstanceDefaultLabel = "${y.default_label}"`);
    expect(go).toContain(`BackupInstanceObjectPrefix = "${y.backup.instance_object_prefix}"`);
  });

  it("penyelesai mengekspor konstanta bangkitan itu sendiri, bukan salinannya", () => {
    expect(companyUrl.DB_INSTANCE_KEY_PATTERN).toBe(DB_INSTANCE_KEY_PATTERN);
    expect(companyUrl.DB_INSTANCE_URL_ENV_PATTERN).toBe(DB_INSTANCE_URL_ENV_PATTERN);
    expect(companyUrl.DEFAULT_DB_INSTANCE_LABEL).toBe(DEFAULT_DB_INSTANCE_LABEL);
    expect(companyUrl.suggestedUrlEnvVar("db2")).toBe(
      `${DB_INSTANCE_URL_ENV_PREFIX}DB2${DB_INSTANCE_URL_ENV_SUFFIX}`
    );
  });
});

describe("kontrak instans: tidak ada pola kedua yang ditulis tangan", () => {
  const POLA = [y.key_pattern, y.url_env_var.pattern];

  it("Go tulisan tangan (bukan tes) tidak memuat pola maupun awalan objeknya", () => {
    const tangan = berkasGo().filter(
      (b) => !b.rel.endsWith("_test.go") && !b.rel.includes("/internal/contract/")
    );
    expect(tangan.length).toBeGreaterThan(0);
    const pelanggar: string[] = [];
    for (const b of tangan) {
      for (const p of POLA) if (b.isi.includes(p)) pelanggar.push(`${b.rel}: ${p}`);
      if (b.isi.includes(`"${y.backup.instance_object_prefix}"`)) {
        pelanggar.push(`${b.rel}: "${y.backup.instance_object_prefix}"`);
      }
    }
    expect(pelanggar).toEqual([]);
  });

  it("penyelesai TS dan pembukti pemulihan tidak menulis polanya sendiri", () => {
    for (const rel of ["packages/db/src/company-url.ts", "scripts/prove-backup-restore.ts"]) {
      const isi = baca(rel);
      for (const p of POLA) expect(isi, `${rel} menulis ${p}`).not.toContain(p);
      /* Bentuk literal regex-nya juga — `/^[a-z][a-z0-9_]{0,31}$/` menulis
         ulang pola yang sama tanpa memuat teks YAML-nya persis. */
      expect(isi, rel).not.toContain(y.key_pattern.slice(1, -1));
    }
  });
});
