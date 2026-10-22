/**
 * PENJAGA bentuk tahap 2 di compose: OPT-IN, dan produksi satu-replika tidak
 * berubah.
 *
 * Yang paling mudah rusak diam-diam di sini bukan override-nya, melainkan
 * compose DASAR: satu baris `CACHE_REDIS_URL` di `environment:` `app-customer`,
 * atau `cache-redis` yang kehilangan `profiles:`, dan produksi menyalakan mode
 * replika pada `up -d` berikutnya — tanpa satu tes pun yang merah.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AKAR_REPO } from "./akar-sumber";

const read = (rel: string) => readFileSync(join(AKAR_REPO, rel), "utf8");
const code = (text: string) =>
  text
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

/** Blok satu layanan (berbasis indentasi dua spasi). */
function block(text: string, service: string): string {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l === `  ${service}:`);
  if (i < 0) return "";
  const end = lines.findIndex((l, j) => j > i && /^ {0,2}\S/.test(l));
  return lines.slice(i, end < 0 ? undefined : end).join("\n");
}

const base = code(read("docker-compose.yml"));
const replika = code(read("docker-compose.replika.yml"));

describe("compose DASAR: produksi satu-replika tidak berubah", () => {
  it("`cache-redis` ada, tetapi di belakang profile `replika`", () => {
    const b = block(base, "cache-redis");
    expect(b).not.toBe("");
    expect(b).toContain('profiles: ["replika"]');
  });

  it("tak satu layanan pun di compose dasar menyetel CACHE_REDIS_URL", () => {
    expect(base).not.toContain("CACHE_REDIS_URL");
  });

  it("Redis tanpa persistensi — isinya hanya yang boleh hilang (09 §3.4)", () => {
    const b = block(base, "cache-redis");
    expect(b).toMatch(/--save\n\s+- ""/);
    expect(b).toMatch(/--appendonly\n\s+- "no"/);
    expect(b).toContain("allkeys-lru");
    expect(b).not.toMatch(/volumes:/);
  });

  it("image Redis dipatok, bukan `latest`", () => {
    expect(block(base, "cache-redis")).toMatch(/image: redis:\d+\.\d+-alpine/);
  });

  it("`app-customer` dasar tetap SATU container bernama tetap", () => {
    const b = block(base, "app-customer");
    expect(b).toContain("container_name: sai-app-customer");
    expect(b).not.toMatch(/replicas:/);
  });
});

describe("override replika", () => {
  it("`app-customer` melepas nama tetap dan berreplika, dengan Redis yang tidak wajib", () => {
    const b = block(replika, "app-customer");
    expect(b).toContain("container_name: !reset null");
    expect(b).toMatch(/replicas: \$\{APP_CUSTOMER_REPLICAS:-2\}/);
    expect(b).toContain("CACHE_REDIS_URL: redis://cache-redis:6379/0");
    expect(b).toContain("required: false");
  });

  it("hanya `app-customer` yang direplikasi — penjadwal & pelari jalur tunggal-instans", () => {
    const services = [...replika.matchAll(/^ {2}([a-z][a-z0-9-]*):\s*$/gm)].map((m) => m[1]);
    expect(services.length).toBeGreaterThanOrEqual(5);
    const replicated = services.filter((name) => /^ {4}deploy:/m.test(block(replika, name)));
    expect(replicated).toEqual(["app-customer"]);
  });

  it("primary: WAL untuk standby + batas slot supaya standby mati tidak memenuhi disk", () => {
    const b = block(replika, "pg");
    for (const s of ["wal_level=replica", "max_wal_senders=", "max_replication_slots=", "max_slot_wal_keep_size="]) {
      expect(b).toContain(s);
    }
  });

  it("standby bernama menurut jenisnya (`db-`) dan di belakang profile", () => {
    const b = block(replika, "db-postgres-standby");
    expect(b).not.toBe("");
    expect(b).toContain('profiles: ["replika"]');
    expect(b).toContain("pg_standby_data:");
    expect(b).toMatch(/PG_REPLICATION_PASSWORD: \$\{PG_REPLICATION_PASSWORD:\?/);
  });

  it("PgBouncer mendapat batas GLOBAL (per pengguna), bukan hanya per basis data", () => {
    expect(block(replika, "pgbouncer")).toMatch(/MAX_USER_CONNECTIONS: \$\{PGBOUNCER_MAX_USER_CONNECTIONS:-\d+\}/);
  });

  it("skrip replikasi ada dan bisa dieksekusi", () => {
    for (const rel of ["scripts/replika/pg-primary-prepare.sh", "scripts/replika/pg-standby-entrypoint.sh"]) {
      const p = join(AKAR_REPO, rel);
      expect(existsSync(p), rel).toBe(true);
      expect(statSync(p).mode & 0o111, `${rel} tanpa bit eksekusi`).not.toBe(0);
    }
  });

  it("pg_hba replikasi hanya untuk peran replikasi, bukan `all`", () => {
    const s = code(read("scripts/replika/pg-primary-prepare.sh"));
    expect(s).toContain('LINE="host replication ${ROLE} ${CIDR} scram-sha-256"');
    expect(s).not.toMatch(/host replication all/);
  });
});
