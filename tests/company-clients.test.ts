/**
 * Kumpulan klien basis data perusahaan (lib/company-clients.ts) — issue #104.
 *
 * Yang dijaga: batas jumlah klien yang hidup bersamaan. Setiap klien memegang
 * pool koneksinya sendiri, jadi tanpa batas ini "sepuluh perusahaan" berarti
 * sepuluh kali `DB_CONNECTION_LIMIT` koneksi yang dipesan permanen — di mesin
 * ~1,9 GB itu kehabisan koneksi, bukan angka teoretis.
 *
 * Dijalankan dengan pool kecil (`COMPANY_CLIENT_POOL_MAX = 2`) supaya penggusuran
 * bisa diuji tanpa membuat sepuluh klien palsu.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Lewat `vi.hoisted`, bukan `vi.stubEnv` biasa: batas pool dibaca SEKALI saat
// modulnya dimuat, dan impor terangkat ke atas berkas — jadi env-nya harus
// sudah berdiri sebelum itu.
vi.hoisted(() => {
  process.env.COMPANY_CLIENT_POOL_MAX = "2";
  process.env.COMPANY_DATABASE_URL_TEMPLATE = "mysql://user:pass@db:3306/template";
  process.env.POOL_DISCONNECT_GRACE_MS = "1";
});

const created: string[] = [];
const disconnected: string[] = [];

vi.mock("@/generated/prisma/client", () => ({
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

vi.mock("@prisma/adapter-mariadb", () => ({
  PrismaMariaDb: class {
    databaseName: string;
    constructor(config: { database: string }) {
      this.databaseName = config.database;
    }
  },
}));

import {
  companyPoolStats,
  disconnectAllCompanyClients,
  getCompanyClient,
} from "@/lib/company-clients";

beforeEach(async () => {
  await disconnectAllCompanyClients();
  created.length = 0;
  disconnected.length = 0;
});

describe("pool klien perusahaan", () => {
  it("membuat satu klien per basis data", () => {
    getCompanyClient("sai_pt_a");
    getCompanyClient("sai_pt_b");
    expect(created).toEqual(["sai_pt_a", "sai_pt_b"]);
  });

  it("memakai ulang klien yang sama untuk perusahaan yang sama", () => {
    const first = getCompanyClient("sai_pt_a");
    const second = getCompanyClient("sai_pt_a");
    expect(second).toBe(first);
    expect(created).toEqual(["sai_pt_a"]);
  });

  it("menggusur yang paling lama tidak dipakai saat melewati batas", () => {
    getCompanyClient("sai_pt_a");
    getCompanyClient("sai_pt_b");
    // Menyentuh A lagi membuat B yang paling lama menganggur.
    getCompanyClient("sai_pt_a");
    getCompanyClient("sai_pt_c");

    const stats = companyPoolStats();
    expect(stats.size).toBe(2);
    expect(stats.databases).toContain("sai_pt_a");
    expect(stats.databases).toContain("sai_pt_c");
    expect(stats.databases).not.toContain("sai_pt_b");
  });

  it("memutus koneksi klien yang tergusur — setelah jeda, bukan seketika", async () => {
    getCompanyClient("sai_pt_a");
    getCompanyClient("sai_pt_b");
    getCompanyClient("sai_pt_c"); // menggusur A

    // Belum diputus pada saat penggusuran: query yang sedang berjalan di klien
    // itu tidak boleh dijatuhkan di tengah jalan.
    expect(disconnected).not.toContain("sai_pt_a");

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(disconnected).toContain("sai_pt_a");
  });

  it("klien yang tergusur digantikan klien BARU, bukan yang sudah diputus", () => {
    const a1 = getCompanyClient("sai_pt_a");
    getCompanyClient("sai_pt_b");
    getCompanyClient("sai_pt_c"); // menggusur A
    const a2 = getCompanyClient("sai_pt_a");
    expect(a2).not.toBe(a1);
  });

  it("menolak nama basis data yang tidak sah", () => {
    expect(() => getCompanyClient("sai; DROP DATABASE x")).toThrow(/tidak sah/i);
    expect(() => getCompanyClient("")).toThrow(/tidak sah/i);
  });
});
