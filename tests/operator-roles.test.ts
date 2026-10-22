/**
 * AKUN OPERATOR BERPERAN (migration kendali 0004): matriks izin, setiap
 * action menyebut izinnya, identitas dibaca dari sumbernya, token berversi,
 * login akun basis data, dan aturan anti-terkunci.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compare, hash } from "bcrypt";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { OPERATOR_PERMISSIONS, OPERATOR_ROLES, operatorCan } from "@op/lib/operator/roles";
import { resolveOperatorIdentity, type DbOperatorState } from "@op/lib/operator/identity";
import { issueOperatorToken, verifyOperatorToken } from "@op/lib/operator/session";
import { verifyOperatorLogin, type DbOperatorCredential } from "@op/lib/operator/credentials";
import {
  createOperatorAccount,
  findDbOperatorCredential,
  updateOperatorAccount,
} from "@op/lib/operator/operator-accounts";
import { totpAt } from "@op/lib/operator/totp";

const KEY = "a".repeat(64);
const SECRET_ENV = { OPERATOR_SESSION_SECRET: "s".repeat(40) };

beforeAll(() => {
  process.env.SETTINGS_ENCRYPTION_KEY = KEY;
});

describe("matriks izin operator", () => {
  it("owner memegang SEMUA izin; viewer hanya kredensial miliknya sendiri", () => {
    for (const p of OPERATOR_PERMISSIONS) {
      expect(operatorCan("owner", p), p).toBe(true);
      expect(operatorCan("viewer", p), p).toBe(p === "operator.self");
    }
  });

  it("setiap peran bisa memasang authenticator-nya sendiri (operator.self)", () => {
    for (const role of OPERATOR_ROLES) expect(operatorCan(role, "operator.self"), role).toBe(true);
  });

  it("instruksi transfer (site.settings) & eksekusi hapus hanya milik owner", () => {
    for (const role of OPERATOR_ROLES.filter((r) => r !== "owner")) {
      expect(operatorCan(role, "site.settings"), role).toBe(false);
      expect(operatorCan(role, "tenant.delete"), role).toBe(false);
      expect(operatorCan(role, "operator.accounts"), role).toBe(false);
    }
  });

  it("peran tak dikenal = nol izin, bukan galat", () => {
    expect(operatorCan("admin", "tenant.billing")).toBe(false);
    expect(operatorCan("", "tenant.billing")).toBe(false);
  });

  it("kosakata peran di kode = CHECK constraint di migration", () => {
    const sql = readFileSync(
      join(process.cwd(), "prisma/postgresql/control/0004_operator_accounts/migration.sql"),
      "utf8"
    );
    const m = sql.match(/"role" IN \(([^)]+)\)/);
    expect(m).not.toBeNull();
    const diSql = [...(m?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    expect(diSql).toEqual([...OPERATOR_ROLES].sort());
  });
});

describe("setiap server action operator menyebut izinnya", () => {
  const AKAR = join(process.cwd(), "apps/operator/src/app/(operator)");
  const berkas: string[] = [];
  const telusuri = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) telusuri(p);
      else if (e.name === "actions.ts") berkas.push(p);
    }
  };
  telusuri(AKAR);

  it("ada berkas untuk diperiksa", () => {
    expect(berkas.length).toBeGreaterThanOrEqual(6);
  });

  it("`requireOperatorActionSession(` / `guardAndTranslate(` selalu dengan izin literal yang dikenal", () => {
    const pelanggar: string[] = [];
    for (const f of berkas) {
      const isi = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const m of isi.matchAll(/(requireOperatorActionSession|guardAndTranslate)\(([^)]*)\)/g)) {
        const arg = m[2].trim();
        /* Definisi pembungkus meneruskan parameternya — satu-satunya bentuk
           non-literal yang sah. */
        if (arg === "permission" || arg.startsWith("permission:")) continue;
        const lit = arg.match(/^"([a-z.]+)"$/)?.[1];
        if (!lit || !(OPERATOR_PERMISSIONS as readonly string[]).includes(lit)) {
          pelanggar.push(`${f.split("/operator/").pop()}: ${m[0]}`);
        }
      }
    }
    expect(pelanggar).toEqual([]);
  });

  it("login & logout tidak lewat penjaga izin (memang belum/tidak bersesi)", () => {
    const isi = readFileSync(join(AKAR, "actions.ts"), "utf8");
    expect(isi).not.toMatch(/requireOperatorActionSession\(/);
  });
});

describe("identitas dibaca dari sumbernya pada setiap permintaan", () => {
  const env = [{ name: "vyn", passwordHash: "$2b$x", totpSecret: "X" }];
  const db: DbOperatorState = { id: 3, name: "rina", role: "billing", isActive: true, sessionVersion: 2 };
  const base = { iat: 0, exp: Date.now() + 1e6, mfa: true as const };

  it("token lama tanpa `src` = akun env; akun env yang DIHAPUS berhenti berlaku", async () => {
    const lookupDb = vi.fn();
    expect(await resolveOperatorIdentity({ ...base, sub: "vyn" }, { envAccounts: env, lookupDb })).toEqual({
      name: "vyn",
      role: "owner",
      source: "env",
      id: null,
    });
    expect(await resolveOperatorIdentity({ ...base, sub: "vyn" }, { envAccounts: [], lookupDb })).toBeNull();
    expect(lookupDb).not.toHaveBeenCalled();
  });

  it("akun db: peran dari BARISNYA; versi beda / nonaktif / hilang / kendali mati → ditolak", async () => {
    const tok = { ...base, sub: "rina", src: "db" as const, ver: 2 };
    const ok = await resolveOperatorIdentity(tok, { envAccounts: [], lookupDb: async () => db });
    expect(ok).toEqual({ name: "rina", role: "billing", source: "db", id: 3 });

    const cases: (DbOperatorState | null | "throw")[] = [
      { ...db, sessionVersion: 3 },
      { ...db, isActive: false },
      { ...db, role: "admin" },
      null,
      "throw",
    ];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const c of cases) {
      const lookupDb = async () => {
        if (c === "throw") throw new Error("kendali mati");
        return c;
      };
      expect(await resolveOperatorIdentity(tok, { envAccounts: [], lookupDb })).toBeNull();
    }
    err.mockRestore();
  });
});

describe("token sesi berversi", () => {
  it("token db membawa versi; token db tanpa versi tidak diterbitkan", () => {
    const tok = issueOperatorToken("rina", new Date(), SECRET_ENV, { source: "db", sessionVersion: 4 });
    expect(verifyOperatorToken(tok, new Date(), SECRET_ENV)).toMatchObject({ sub: "rina", src: "db", ver: 4 });
    expect(issueOperatorToken("rina", new Date(), SECRET_ENV, { source: "db", sessionVersion: null })).toBeNull();
  });

  it("bawaan tetap env — pemanggil lama tidak berubah makna", () => {
    const tok = issueOperatorToken("vyn", new Date(), SECRET_ENV);
    expect(verifyOperatorToken(tok, new Date(), SECRET_ENV)).toMatchObject({ sub: "vyn", src: "env" });
  });
});

const TOTP = "JBSWY3DPEHPK3PXP";
const NOW = new Date("2026-10-17T05:00:00Z");
const CODE = totpAt(TOTP, Math.floor(NOW.getTime() / 1000)) as string;

describe("login akun basis data", () => {
  let dbCred: DbOperatorCredential;
  beforeAll(async () => {
    dbCred = {
      id: 5,
      name: "rina",
      role: "support",
      passwordHash: await hash("rahasia-rina", 4),
      totpSecret: TOTP,
      sessionVersion: 7,
    };
  });

  it("nama + sandi + TOTP benar → identitas db berversi", async () => {
    const r = await verifyOperatorLogin({
      username: "Rina",
      password: "rahasia-rina",
      totpCode: CODE,
      accountsRaw: "",
      now: NOW,
      findDbAccount: async (n) => (n === "rina" ? dbCred : null),
    });
    expect(r).toEqual({ name: "rina", role: "support", source: "db", sessionVersion: 7, id: 5 });
  });

  it("TOTP salah → ditolak; pencari yang melempar → ditolak tanpa galat", async () => {
    const salah = await verifyOperatorLogin({
      username: "rina",
      password: "rahasia-rina",
      totpCode: "000000",
      accountsRaw: "",
      now: NOW,
      findDbAccount: async () => dbCred,
    });
    expect(salah).toBeNull();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const mati = await verifyOperatorLogin({
      username: "rina",
      password: "rahasia-rina",
      totpCode: CODE,
      accountsRaw: "",
      now: NOW,
      findDbAccount: async () => {
        throw new Error("kendali mati");
      },
    });
    expect(mati).toBeNull();
    err.mockRestore();
  });

  it("nama env MENANG: basis data tidak ditanya sama sekali", async () => {
    const envHash = await hash("sandi-env", 4);
    const find = vi.fn(async () => dbCred);
    const r = await verifyOperatorLogin({
      username: "rina",
      password: "sandi-env",
      totpCode: CODE,
      accountsRaw: `rina:${envHash}:${TOTP}`,
      now: NOW,
      findDbAccount: find,
    });
    expect(r).toMatchObject({ source: "env", role: "owner" });
    expect(find).not.toHaveBeenCalled();
  });
});

/* ── Fake kendali in-memory untuk operator_accounts ───────────────────────── */
function fakeControl() {
  const rows: Record<string, unknown>[] = [];
  let nextId = 1;
  const match = (r: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === "object" && "not" in (v as object) ? r[k] !== (v as { not: unknown }).not : r[k] === v
    );
  const operatorAccount = {
    findUnique: async ({ where }: { where: Record<string, unknown> }) => rows.find((r) => match(r, where)) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (rows.some((r) => r.name === data.name)) throw Object.assign(new Error("dup"), { code: "P2002" });
      const row = { id: nextId++, isActive: true, sessionVersion: 1, lastLoginAt: null, ...data };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
      const row = rows.find((r) => r.id === where.id) as Record<string, unknown>;
      for (const [k, v] of Object.entries(data)) {
        row[k] = v && typeof v === "object" && "increment" in (v as object)
          ? (row[k] as number) + (v as { increment: number }).increment
          : v;
      }
      return row;
    },
    count: async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => match(r, where)).length,
  };
  return { rows, deps: { control: { operatorAccount } as never } };
}

describe("membuat akun operator", () => {
  it("kredensial yang diterbitkan BISA dipakai masuk; TOTP tersimpan tersegel, bukan polos", async () => {
    const { rows, deps } = fakeControl();
    const r = await createOperatorAccount(deps, { name: "Rina", role: "billing", actor: "vyn", envNames: ["vyn"] });
    expect(r.outcome).toBe("created");
    if (r.outcome !== "created") return;
    expect(rows[0]).toMatchObject({ name: "rina", role: "billing", createdBy: "vyn" });
    expect(JSON.stringify(rows[0])).not.toContain(r.credential.totpSecret);
    expect(JSON.stringify(rows[0])).not.toContain(r.credential.password);
    expect(await compare(r.credential.password, rows[0].passwordHash as string)).toBe(true);
    const cred = await findDbOperatorCredential(deps, "rina");
    expect(cred?.totpSecret).toBe(r.credential.totpSecret);
    expect(r.credential.otpauthUri).toMatch(/^otpauth:\/\/totp\/SAI%20Operator%3Arina\?secret=/);
  });

  it.each([
    ["nama tak sah", { name: "a b", role: "viewer" }, "name_invalid"],
    ["peran asing", { name: "rina", role: "admin" }, "role_invalid"],
    ["nama milik akun env", { name: "VYN", role: "viewer" }, "env_name"],
  ])("%s → ditolak", async (_n, input, outcome) => {
    const { deps } = fakeControl();
    expect((await createOperatorAccount(deps, { ...input, actor: "vyn", envNames: ["vyn"] })).outcome).toBe(outcome);
  });

  it("tanpa kunci enkripsi → ditolak, tidak ada yang disimpan", async () => {
    const { rows, deps } = fakeControl();
    process.env.SETTINGS_ENCRYPTION_KEY = "";
    try {
      expect((await createOperatorAccount(deps, { name: "rina", role: "viewer", actor: "vyn", envNames: [] })).outcome).toBe("key_missing");
      expect(rows).toHaveLength(0);
    } finally {
      process.env.SETTINGS_ENCRYPTION_KEY = KEY;
    }
  });

  it("nama kembar → name_taken", async () => {
    const { deps } = fakeControl();
    await createOperatorAccount(deps, { name: "rina", role: "viewer", actor: "vyn", envNames: [] });
    expect((await createOperatorAccount(deps, { name: "rina", role: "viewer", actor: "vyn", envNames: [] })).outcome).toBe("name_taken");
  });
});

describe("mengubah akun operator — aturan anti-terkunci", () => {
  async function dunia() {
    const w = fakeControl();
    await createOperatorAccount(w.deps, { name: "ani", role: "owner", actor: "x", envNames: [] });
    await createOperatorAccount(w.deps, { name: "budi", role: "billing", actor: "x", envNames: [] });
    return w;
  }

  it("tidak bisa menonaktifkan / menurunkan diri sendiri", async () => {
    const { deps } = await dunia();
    for (const change of [{ kind: "deactivate" as const }, { kind: "role" as const, role: "viewer" as const }]) {
      expect((await updateOperatorAccount(deps, { id: 1, change, actor: "ani", envOwnerCount: 1 })).outcome).toBe("self_lockout");
    }
  });

  it("owner aktif TERAKHIR tidak bisa dihilangkan bila tidak ada akun env", async () => {
    const { deps } = await dunia();
    expect((await updateOperatorAccount(deps, { id: 1, change: { kind: "deactivate" }, actor: "budi", envOwnerCount: 0 })).outcome).toBe("last_owner");
    expect((await updateOperatorAccount(deps, { id: 1, change: { kind: "role", role: "viewer" }, actor: "budi", envOwnerCount: 0 })).outcome).toBe("last_owner");
    /* Dengan satu akun env, owner basis data boleh pergi. */
    expect((await updateOperatorAccount(deps, { id: 1, change: { kind: "deactivate" }, actor: "budi", envOwnerCount: 1 })).outcome).toBe("updated");
  });

  it("cabut sesi & nonaktif menaikkan versi sesi; atur ulang menerbitkan kredensial baru", async () => {
    const { rows, deps } = await dunia();
    await updateOperatorAccount(deps, { id: 2, change: { kind: "revoke" }, actor: "ani", envOwnerCount: 0 });
    expect(rows[1].sessionVersion).toBe(2);
    const lamaHash = rows[1].passwordHash;
    const r = await updateOperatorAccount(deps, { id: 2, change: { kind: "reset" }, actor: "ani", envOwnerCount: 0 });
    expect(r.outcome).toBe("updated");
    expect(r.outcome === "updated" && r.credential?.name).toBe("budi");
    expect(rows[1].passwordHash).not.toBe(lamaHash);
    expect(rows[1].sessionVersion).toBe(3);
    await updateOperatorAccount(deps, { id: 2, change: { kind: "deactivate" }, actor: "ani", envOwnerCount: 0 });
    expect(rows[1]).toMatchObject({ isActive: false, sessionVersion: 4 });
    expect(await findDbOperatorCredential(deps, "budi")).toBeNull();
  });

  it("perubahan yang tidak mengubah apa pun = `unchanged`, bukan tulisan", async () => {
    const { deps } = await dunia();
    expect((await updateOperatorAccount(deps, { id: 2, change: { kind: "role", role: "billing" }, actor: "ani", envOwnerCount: 0 })).outcome).toBe("unchanged");
    expect((await updateOperatorAccount(deps, { id: 2, change: { kind: "activate" }, actor: "ani", envOwnerCount: 0 })).outcome).toBe("unchanged");
  });
});
