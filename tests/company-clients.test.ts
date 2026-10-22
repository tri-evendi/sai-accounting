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
  process.env.COMPANY_DB2_DATABASE_URL_TEMPLATE = "mysql://user2:pass2@db2:3306/template";
  process.env.POOL_DISCONNECT_GRACE_MS = "1";
});

const created: string[] = [];
const disconnected: string[] = [];
/** Host tempat setiap klien dibuat — bukti instans mana yang disambungi. */
const hosts: string[] = [];

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

vi.mock("@prisma/adapter-mariadb", () => ({
  PrismaMariaDb: class {
    databaseName: string;
    constructor(config: { database: string; host: string }) {
      this.databaseName = config.database;
      hosts.push(config.host);
    }
  },
}));

import {
  companyPoolStats,
  disconnectAllCompanyClients,
  getCompanyClient,
  getCompanyReadClient,
} from "@/lib/company-clients";

/** Target di instans BAWAAN — bentuk setiap PT sebelum tahap 4. */
const db = (databaseName: string) => ({ databaseName, dbInstance: null });
const DB2 = { key: "db2", urlEnvVar: "COMPANY_DB2_DATABASE_URL_TEMPLATE" };

beforeEach(async () => {
  await disconnectAllCompanyClients();
  created.length = 0;
  disconnected.length = 0;
  hosts.length = 0;
});

describe("pool klien perusahaan", () => {
  it("membuat satu klien per basis data", () => {
    getCompanyClient(db("sai_pt_a"));
    getCompanyClient(db("sai_pt_b"));
    expect(created).toEqual(["sai_pt_a", "sai_pt_b"]);
  });

  it("memakai ulang klien yang sama untuk perusahaan yang sama", () => {
    const first = getCompanyClient(db("sai_pt_a"));
    const second = getCompanyClient(db("sai_pt_a"));
    expect(second).toBe(first);
    expect(created).toEqual(["sai_pt_a"]);
  });

  it("menggusur yang paling lama tidak dipakai saat melewati batas", () => {
    getCompanyClient(db("sai_pt_a"));
    getCompanyClient(db("sai_pt_b"));
    // Menyentuh A lagi membuat B yang paling lama menganggur.
    getCompanyClient(db("sai_pt_a"));
    getCompanyClient(db("sai_pt_c"));

    const stats = companyPoolStats();
    expect(stats.size).toBe(2);
    expect(stats.databases).toContain("/sai_pt_a");
    expect(stats.databases).toContain("/sai_pt_c");
    expect(stats.databases).not.toContain("/sai_pt_b");
  });

  it("memutus koneksi klien yang tergusur — setelah jeda, bukan seketika", async () => {
    getCompanyClient(db("sai_pt_a"));
    getCompanyClient(db("sai_pt_b"));
    getCompanyClient(db("sai_pt_c")); // menggusur A

    // Belum diputus pada saat penggusuran: query yang sedang berjalan di klien
    // itu tidak boleh dijatuhkan di tengah jalan.
    expect(disconnected).not.toContain("sai_pt_a");

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(disconnected).toContain("sai_pt_a");
  });

  it("klien yang tergusur digantikan klien BARU, bukan yang sudah diputus", () => {
    const a1 = getCompanyClient(db("sai_pt_a"));
    getCompanyClient(db("sai_pt_b"));
    getCompanyClient(db("sai_pt_c")); // menggusur A
    const a2 = getCompanyClient(db("sai_pt_a"));
    expect(a2).not.toBe(a1);
  });

  it("menolak nama basis data yang tidak sah", () => {
    expect(() => getCompanyClient(db("sai; DROP DATABASE x"))).toThrow(/tidak sah/i);
    expect(() => getCompanyClient(db(""))).toThrow(/tidak sah/i);
  });
});

describe("instans basis data (tahap 4, rancangan 09 §9)", () => {
  it("instans bawaan tetap memakai template hari ini", () => {
    getCompanyClient(db("sai_pt_a"));
    expect(hosts).toEqual(["db"]);
  });

  it("PT di instans lain disambungkan ke template instans itu", () => {
    getCompanyClient({ databaseName: "sai_pt_a", dbInstance: DB2 });
    expect(hosts).toEqual(["db2"]);
    expect(created).toEqual(["sai_pt_a"]);
  });

  it("nama basis data yang sama di dua instans = dua klien, tidak pernah dipakai ulang", () => {
    const lama = getCompanyClient(db("sai_pt_a"));
    const baru = getCompanyClient({ databaseName: "sai_pt_a", dbInstance: DB2 });
    expect(baru).not.toBe(lama);
    expect(companyPoolStats().databases).toEqual(["/sai_pt_a", "db2/sai_pt_a"]);
  });

  it("instans yang env var-nya tidak diset MELEMPAR — tidak jatuh ke bawaan", () => {
    expect(() =>
      getCompanyClient({
        databaseName: "sai_pt_a",
        dbInstance: { key: "db3", urlEnvVar: "COMPANY_DB3_DATABASE_URL_TEMPLATE" },
      })
    ).toThrow(/db3/);
    expect(created).toEqual([]);
  });

  it("baris instans yang menunjuk env var di luar bentuknya ditolak", () => {
    expect(() =>
      getCompanyClient({
        databaseName: "sai_pt_a",
        dbInstance: { key: "db2", urlEnvVar: "CONTROL_DATABASE_URL" },
      })
    ).toThrow(/COMPANY_<KUNCI>_DATABASE_URL_TEMPLATE/);
  });

  it("replika baca bawaan tidak pernah melayani PT di instans lain", () => {
    process.env.COMPANY_DATABASE_READ_URL_TEMPLATE = "mysql://ro:ro@replica:3306/template";
    try {
      expect(getCompanyReadClient({ databaseName: "sai_pt_a", dbInstance: DB2 })).toBeNull();
      expect(getCompanyReadClient(db("sai_pt_a"))).not.toBeNull();
      expect(hosts).toEqual(["replica"]);
    } finally {
      delete process.env.COMPANY_DATABASE_READ_URL_TEMPLATE;
    }
  });
});
