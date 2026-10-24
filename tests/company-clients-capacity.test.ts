/**
 * Batas kolam klien perusahaan yang bisa DINAIKKAN saat berjalan — untuk relay
 * outbox, yang menyentuh setiap buku tiap putaran (24 Okt 2026: 17 buku di
 * kolam 4 membuat RSS relay 0,9–1,4 GB karena klien dibuat-dibuang terus).
 * Berkas sendiri: batas yang dinaikkan menetap di modul, dan
 * `company-clients.test.ts` menguji penggusuran pada batas 2.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AKAR_REPO } from "./akar-sumber";

vi.hoisted(() => {
  process.env.COMPANY_CLIENT_POOL_MAX = "2";
  process.env.COMPANY_CLIENT_POOL_CEILING = "6";
  process.env.COMPANY_DATABASE_URL_TEMPLATE = "postgres://user:pass@db:5432/template";
  process.env.POOL_DISCONNECT_GRACE_MS = "1";
});

const created: string[] = [];
const disconnected: string[] = [];

vi.mock("@sai/db/client/company", () => ({
  PrismaClient: class {
    databaseName: string;
    constructor(options: { adapter: { databaseName: string } }) {
      this.databaseName = options.adapter.databaseName;
      created.push(this.databaseName);
    }
    async $disconnect() {
      disconnected.push(this.databaseName);
    }
  },
}));

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class {
    databaseName: string;
    constructor(config: { database: string }) {
      this.databaseName = config.database;
    }
  },
}));

import {
  companyPoolStats,
  disconnectAllCompanyClients,
  ensureCompanyClientCapacity,
  getCompanyClient,
} from "@/lib/company-clients";

const db = (databaseName: string) => ({ databaseName, dbInstance: null });
const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  await disconnectAllCompanyClients();
  created.length = 0;
  disconnected.length = 0;
});

describe("kolam klien perusahaan: kapasitas yang bisa dinaikkan", () => {
  it("bawaan dari COMPANY_CLIENT_POOL_MAX", () => {
    expect(companyPoolStats().max).toBe(2);
  });

  it("dinaikkan: semua buku muat, tidak ada yang tergusur antar putaran", async () => {
    expect(ensureCompanyClientCapacity(5)).toBe(5);
    const buku = ["a", "b", "c", "d", "e"].map((x) => db(`sai_pt_${x}`));
    for (let putaran = 0; putaran < 3; putaran++) for (const b of buku) getCompanyClient(b);
    await tunggu(10);
    expect(created).toHaveLength(5); // dibuat sekali, dipakai ulang tiap putaran
    expect(disconnected).toEqual([]);
  });

  it("tidak pernah turun, dan dibatasi COMPANY_CLIENT_POOL_CEILING", () => {
    ensureCompanyClientCapacity(5);
    expect(ensureCompanyClientCapacity(1)).toBeGreaterThanOrEqual(5);
    expect(ensureCompanyClientCapacity(1000)).toBe(6);
    expect(companyPoolStats().max).toBe(6);
  });

  it("relay outbox menyesuaikan kolam dengan registry setiap kali dibaca ulang", () => {
    const sumber = readFileSync(join(AKAR_REPO, "workers/outbox-relay.ts"), "utf8");
    expect(sumber).toMatch(/buku = await bacaRegistry\(\);[\s\S]{0,400}ensureCompanyClientCapacity\(buku\.length/);
  });
});
