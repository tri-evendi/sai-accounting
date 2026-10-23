/**
 * REPLIKA BACA (rancangan 09 §9, tahap 3) — `src/lib/read-replica.ts`.
 *
 * Yang dijaga:
 *  1. **Mati secara bawaan.** Tanpa `COMPANY_DATABASE_READ_URL_TEMPLATE`,
 *     `runReadOnly(fn)` adalah `fn()` dan proxy `prisma` memakai primary.
 *  2. **Aturan kesegaran.** Replika dipakai hanya bila ia standby DAN sudah
 *     memutar WAL sampai posisi primary; selain itu — termasuk galat — primary.
 *  3. **Tulisan ditolak** di dalam cakupan, juga saat cakupan jatuh ke primary.
 *  4. **Konteks perusahaan yang hilang tetap MELEMPAR** (#104), dan keputusan
 *     replika dikunci per basis data perusahaan.
 *  5. **Pemanggilnya daftar-izin**, dipindai lewat `akarSumber()` + `workers/`
 *     + `scripts/`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

interface FakeClient {
  name: string;
  calls: string[];
  rawAnswers: Row[][];
  invoice: Record<string, (...a: unknown[]) => Promise<unknown>>;
  $queryRaw: (...a: unknown[]) => Promise<unknown>;
  $executeRaw: (...a: unknown[]) => Promise<unknown>;
}

function fakeClient(name: string): FakeClient {
  const c: FakeClient = {
    name,
    calls: [],
    rawAnswers: [],
    invoice: {},
    $queryRaw: async () => {
      c.calls.push("$queryRaw");
      return c.rawAnswers.shift() ?? [];
    },
    $executeRaw: async () => {
      c.calls.push("$executeRaw");
      return 1;
    },
  };
  for (const m of ["findMany", "create", "update", "deleteMany"]) {
    c.invoice[m] = async () => {
      c.calls.push(`invoice.${m}`);
      return name;
    };
  }
  return c;
}

const state = vi.hoisted(() => ({
  primaries: new Map<string, unknown>(),
  replicas: new Map<string, unknown>(),
  replicaRequests: [] as string[],
  company: { companyId: 1, slug: "pt-a", databaseName: "sai_pt_a", dbInstance: null } as
    | { companyId: number; slug: string; databaseName: string; dbInstance: null }
    | Error,
}));

vi.mock("@/lib/current-company", () => ({
  currentCompany: async () => {
    if (state.company instanceof Error) throw state.company;
    return state.company;
  },
}));

/* Gerbang skema per buku diuji di `tests/company-schema-gate.test.ts`; di sini
   ia akan menambah satu `$queryRaw` ke primary yang dihitung tes routing. */
vi.mock("@/lib/company-schema-gate", () => ({
  assertCompanySchemaServable: async () => {},
}));

vi.mock("@/lib/company-clients", () => ({
  getCompanyClient: ({ databaseName: db }: { databaseName: string }) => state.primaries.get(db),
  getCompanyReadClient: ({ databaseName: db }: { databaseName: string }) => {
    state.replicaRequests.push(db);
    return process.env.COMPANY_DATABASE_READ_URL_TEMPLATE ? state.replicas.get(db) : null;
  },
  readTemplateUrl: () => {
    const raw = process.env.COMPANY_DATABASE_READ_URL_TEMPLATE;
    return raw ? new URL(raw) : null;
  },
}));

import { prisma } from "@/lib/prisma";
import {
  ReadScopeWriteError,
  chooseReadClient,
  inReadScope,
  runReadOnly,
} from "@/lib/read-replica";
import { MissingCompanyContextError } from "@/lib/company-context";
import type { PrismaClient } from "@sai/db/client/company";

import { AKAR_REPO, berkasSumber, tanpaKomentar } from "./akar-sumber";

let primaryA: FakeClient;
let replicaA: FakeClient;

beforeEach(() => {
  primaryA = fakeClient("primary-a");
  replicaA = fakeClient("replica-a");
  state.primaries.clear();
  state.replicas.clear();
  state.replicaRequests.length = 0;
  state.primaries.set("sai_pt_a", primaryA);
  state.replicas.set("sai_pt_a", replicaA);
  state.company = { companyId: 1, slug: "pt-a", databaseName: "sai_pt_a", dbInstance: null };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const asClient = (c: FakeClient) => c as unknown as PrismaClient;
const quietDeps = (now: () => number = () => 0) => ({
  sleep: async () => {},
  now,
  log: () => {},
});

describe("mati secara bawaan", () => {
  it("tanpa COMPANY_DATABASE_READ_URL_TEMPLATE: tanpa cakupan, primary, tulisan tidak ditolak", async () => {
    vi.stubEnv("COMPANY_DATABASE_READ_URL_TEMPLATE", "");
    const hasil = await runReadOnly(async () => {
      expect(inReadScope()).toBe(false);
      await prisma.invoice.create({ data: {} } as never);
      return prisma.invoice.findMany();
    });
    expect(hasil).toBe("primary-a");
    expect(primaryA.calls).toEqual(["invoice.create", "invoice.findMany"]);
    expect(replicaA.calls).toEqual([]);
    expect(state.replicaRequests).toEqual([]);
  });

  it("template `mysql://` GAGAL KERAS — MariaDB sudah dicabut (#636)", async () => {
    /* Dulu template MariaDB diam-diam mematikan replika. Sejak Fase E tidak ada
       mesin kedua: URL semacam itu salah konfigurasi, dan mendiamkannya berarti
       pemasangan yang yakin punya replika padahal tidak. */
    vi.stubEnv("COMPANY_DATABASE_READ_URL_TEMPLATE", "mysql://u:p@replica:3306/template");
    await expect(runReadOnly(async () => inReadScope())).rejects.toThrow(/MariaDB sudah dicabut/);
  });
});

describe("aturan kesegaran", () => {
  it("standby yang sudah memutar WAL sampai posisi primary → replika", async () => {
    primaryA.rawAnswers.push([{ lsn: "0/3000060" }]);
    replicaA.rawAnswers.push([{ standby: true, caught: true }]);
    const c = await chooseReadClient("sai_pt_a", asClient(primaryA), asClient(replicaA), quietDeps());
    expect(c).toBe(asClient(replicaA));
  });

  it("menunggu replika menyusul, lalu memakainya", async () => {
    primaryA.rawAnswers.push([{ lsn: "0/3000060" }]);
    replicaA.rawAnswers.push([{ standby: true, caught: false }], [{ standby: true, caught: true }]);
    const c = await chooseReadClient("sai_pt_a", asClient(primaryA), asClient(replicaA), quietDeps());
    expect(c).toBe(asClient(replicaA));
  });

  it("tak menyusul dalam batas tunggu → primary", async () => {
    let t = 0;
    primaryA.rawAnswers.push([{ lsn: "0/3000060" }]);
    for (let i = 0; i < 50; i++) replicaA.rawAnswers.push([{ standby: true, caught: false }]);
    const c = await chooseReadClient(
      "sai_pt_a",
      asClient(primaryA),
      asClient(replicaA),
      quietDeps(() => (t += 1000)),
      5_000
    );
    expect(c).toBe(asClient(primaryA));
  });

  it("replika yang BUKAN standby (dipromosikan / salah konfigurasi) → primary", async () => {
    primaryA.rawAnswers.push([{ lsn: "0/3000060" }]);
    replicaA.rawAnswers.push([{ standby: false, caught: true }]);
    const c = await chooseReadClient("sai_pt_a", asClient(primaryA), asClient(replicaA), quietDeps());
    expect(c).toBe(asClient(primaryA));
  });

  it("replika tak terjangkau → primary, bukan ekspor yang gagal", async () => {
    primaryA.rawAnswers.push([{ lsn: "0/3000060" }]);
    replicaA.$queryRaw = async () => {
      throw new Error("ECONNREFUSED");
    };
    const c = await chooseReadClient("sai_pt_a", asClient(primaryA), asClient(replicaA), quietDeps());
    expect(c).toBe(asClient(primaryA));
  });
});

describe("di dalam cakupan (replika terpasang)", () => {
  beforeEach(() => {
    vi.stubEnv("COMPANY_DATABASE_READ_URL_TEMPLATE", "postgres://u:p@pg:5433/template");
  });

  it("bacaan lewat proxy `prisma` mendarat di replika yang segar", async () => {
    primaryA.rawAnswers.push([{ lsn: "0/1" }]);
    replicaA.rawAnswers.push([{ standby: true, caught: true }]);
    const hasil = await runReadOnly(() => prisma.invoice.findMany());
    expect(hasil).toBe("replica-a");
    expect(primaryA.calls).toEqual(["$queryRaw"]); // hanya posisi WAL
  });

  it("tulisan DITOLAK sebelum klien dipilih — tidak ada klien yang disentuh", async () => {
    await runReadOnly(async () => {
      await expect(prisma.invoice.create({ data: {} } as never)).rejects.toBeInstanceOf(
        ReadScopeWriteError
      );
      await expect(prisma.invoice.deleteMany()).rejects.toBeInstanceOf(ReadScopeWriteError);
      await expect(prisma.$executeRaw`DELETE FROM invoices`).rejects.toBeInstanceOf(
        ReadScopeWriteError
      );
    });
    expect(primaryA.calls).toEqual([]);
    expect(replicaA.calls).toEqual([]);
  });

  it("konteks perusahaan yang hilang tetap MELEMPAR, tidak jatuh ke mana pun", async () => {
    state.company = new MissingCompanyContextError("tes");
    await runReadOnly(async () => {
      await expect(prisma.invoice.findMany()).rejects.toBeInstanceOf(MissingCompanyContextError);
    });
    expect(state.replicaRequests).toEqual([]);
  });

  it("keputusan dikunci per basis data perusahaan, sekali per cakupan", async () => {
    const primaryB = fakeClient("primary-b");
    const replicaB = fakeClient("replica-b");
    state.primaries.set("sai_pt_b", primaryB);
    state.replicas.set("sai_pt_b", replicaB);
    primaryA.rawAnswers.push([{ lsn: "0/1" }]);
    replicaA.rawAnswers.push([{ standby: true, caught: true }]);
    primaryB.rawAnswers.push([{ lsn: "0/1" }]);
    replicaB.rawAnswers.push([{ standby: false, caught: false }]);

    await runReadOnly(async () => {
      expect(await prisma.invoice.findMany()).toBe("replica-a");
      expect(await prisma.invoice.findMany()).toBe("replica-a");
      state.company = { companyId: 2, slug: "pt-b", databaseName: "sai_pt_b", dbInstance: null };
      expect(await prisma.invoice.findMany()).toBe("primary-b");
    });
    expect(state.replicaRequests).toEqual(["sai_pt_a", "sai_pt_b"]);
  });

  it("di luar cakupan tetap primary walau replika terpasang", async () => {
    expect(await prisma.invoice.findMany()).toBe("primary-a");
    expect(state.replicaRequests).toEqual([]);
  });
});

describe("pemanggil replika adalah daftar-izin", () => {
  const semua = () => [
    ...berkasSumber([".ts", ".tsx"]),
    ...["workers", "scripts"].flatMap((dir) =>
      readdirSync(join(AKAR_REPO, dir))
        .filter((f) => f.endsWith(".ts"))
        .map((f) => ({ rel: `${dir}/${f}`, isi: readFileSync(join(AKAR_REPO, dir, f), "utf8") }))
    ),
  ];

  /**
   * Setiap pemakai baru WAJIB jalur baca murni: tidak memposting, tidak
   * menutup periode, tidak menghitung angka yang lalu ditulis. Menambah baris
   * di sini adalah keputusan itu, dan alasannya ditulis di sebelahnya.
   */
  const PEMANGGIL_RUN_READ_ONLY = new Set([
    // Ekspor laporan berantre: membaca buku, menulis berkas hasil (bukan buku).
    "workers/interactive.ts",
  ]);

  it("`runReadOnly(` hanya dipanggil dari jalur baca yang disebut", () => {
    const pemakai = semua()
      .filter((b) => b.rel !== "src/lib/read-replica.ts")
      .filter((b) => /\brunReadOnly\s*\(/.test(tanpaKomentar(b.isi)))
      .map((b) => b.rel);
    expect(pemakai).toEqual(expect.arrayContaining([...PEMANGGIL_RUN_READ_ONLY]));
    expect(pemakai.filter((rel) => !PEMANGGIL_RUN_READ_ONLY.has(rel))).toEqual([]);
  });

  it("klien replika tidak pernah diambil langsung — hanya lewat aturan kesegarannya", () => {
    const pemakai = semua()
      .filter((b) => /\bgetCompanyReadClient\s*\(/.test(tanpaKomentar(b.isi)))
      .map((b) => b.rel)
      .sort();
    expect(pemakai).toEqual(["src/lib/company-clients.ts", "src/lib/read-replica.ts"].sort());
  });
});
