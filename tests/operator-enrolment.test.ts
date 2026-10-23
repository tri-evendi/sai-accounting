/**
 * PEMASANGAN AUTHENTICATOR WAJIB saat masuk konsol operator.
 *
 * Yang dibuktikan:
 *   • mesin keadaan login: belum terkonfirmasi → sesi PEMASANGAN; sudah →
 *     kode wajib; `OPERATOR_MFA=off` → kata sandi saja; konfirmasi basi
 *     (rahasia berganti) → pemasangan; jejak tak terbaca → kode wajib;
 *   • token pemasangan tidak pernah menjadi sesi konsol, dan sebaliknya;
 *     kedaluwarsa 10 menit;
 *   • gerbang proxy: cookie pemasangan hanya membuka halaman pemasangan, dan
 *     penjaga halaman/action/route tidak membaca cookie itu sama sekali;
 *   • action pemasangan: pembatas laju, jejak `enroll.start/confirm/failed`
 *     tanpa rahasia, konfirmasi ditulis SEBELUM sesi terbit.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { hash } from "bcrypt";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/* ── Tiruan untuk action (dideklarasikan sebelum impor modul yang diuji) ── */

const h = vi.hoisted(() => {
  const jar = new Map<string, string>();
  return {
    jar,
    audit: [] as { operator: string; action: string; details?: Record<string, unknown> }[],
    confirmations: [] as { operator: string; fingerprint: string; at: Date }[],
    confirmationsThrow: false,
    auditStrictThrow: false,
    rateAllowed: true,
    rateKeys: [] as { key: string; maxAttempts?: number; windowMs?: number }[],
    db: null as null | {
      id: number;
      name: string;
      role: "viewer";
      passwordHash: string;
      totpSecret: string;
      sessionVersion: number;
    },
  };
});

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "ops.test", "x-forwarded-for": "10.0.0.1" }),
  cookies: async () => ({
    get: (name: string) => (h.jar.has(name) ? { name, value: h.jar.get(name)! } : undefined),
    set: (name: string, value: string, opts?: { maxAge?: number }) => {
      if (opts?.maxAge === 0 || value === "") h.jar.delete(name);
      else h.jar.set(name, value);
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@sai/platform/rate-limit-shared", () => ({
  checkSharedRateLimit: async (key: string, opts: { maxAttempts?: number; windowMs?: number }) => {
    h.rateKeys.push({ key, ...opts });
    return { allowed: h.rateAllowed };
  },
}));
vi.mock("@sai/platform/i18n/server", () => ({ getT: async () => (key: string) => key }));
vi.mock("@sai/core/control-db", () => ({ controlDb: {} }));
vi.mock("@op/lib/operator/guard", () => ({ operatorPlaneViolation: async () => null }));
vi.mock("@op/lib/operator/operator-accounts", () => ({
  TOTP_ISSUER: "SAI Operator",
  findDbOperatorCredential: async (_deps: unknown, name: string) => (h.db && h.db.name === name ? h.db : null),
  recordOperatorLogin: async () => undefined,
}));
vi.mock("@op/lib/operator/audit", () => ({
  AUTHENTICATOR_CONFIRM_ACTIONS: [
    "operator.authenticator.confirm",
    "operator.authenticator.rotate",
    "operator.authenticator.enroll.confirm",
  ],
  readAuthenticatorConfirmationsFor: async (name: string) => {
    if (h.confirmationsThrow) throw new Error("platform mati");
    return h.confirmations.filter((c) => c.operator.toLowerCase() === name.toLowerCase());
  },
  writeOperatorAuditLog: async (e: { operator: string; action: string; details?: Record<string, unknown> }) => {
    h.audit.push(e);
  },
  writeOperatorAuditLogOrThrow: async (e: { operator: string; action: string; details?: Record<string, unknown> }) => {
    if (h.auditStrictThrow) throw new Error("jejak mati");
    h.audit.push(e);
  },
}));

import { secretFingerprint, authenticatorReadiness } from "@op/lib/operator/authenticator";
import { confirmEnrolment, decideOperatorLogin, resolveEnrolment, type LoginFlowDeps } from "@op/lib/operator/enrolment";
import { decideConsoleGate, ENROLMENT_PATH, enrolmentCookieName } from "@op/lib/console-gate";
import {
  OPERATOR_ENROLMENT_TTL_MS,
  issueEnrolmentToken,
  issueOperatorToken,
  verifyEnrolmentToken,
  verifyOperatorToken,
} from "@op/lib/operator/session";
import { totpAt } from "@op/lib/operator/totp";
import { operatorLogin } from "@op/app/(operator)/actions";
import { enrolmentConfirm } from "@op/app/(operator)/login/authenticator/actions";

const ENV_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const DB_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const OTHER_SECRET = "MFRGGZDFMZTWQ2LKMFRGGZDFMZTWQ2LK";
const PASSWORD = "kata-sandi-operator";
const SESSION_SECRET = "rahasia-uji-yang-panjangnya-cukup-32-karakter!";
const ENV = { OPERATOR_SESSION_SECRET: SESSION_SECRET };

let HASH: string;
let accountsRaw: string;

beforeAll(async () => {
  HASH = await hash(PASSWORD, 4);
  accountsRaw = `operator:${HASH}:${ENV_SECRET}`;
});

beforeEach(() => {
  h.jar.clear();
  h.audit.length = 0;
  h.confirmations.length = 0;
  h.confirmationsThrow = false;
  h.auditStrictThrow = false;
  h.rateAllowed = true;
  h.rateKeys.length = 0;
  h.db = null;
  vi.stubEnv("OPERATOR_USERS", accountsRaw);
  vi.stubEnv("OPERATOR_SESSION_SECRET", SESSION_SECRET);
  vi.stubEnv("OPERATOR_MFA", "");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const nowCode = (secret: string) => totpAt(secret, Math.floor(Date.now() / 1000))!;

function flowDeps(over: Partial<LoginFlowDeps> = {}): LoginFlowDeps {
  return {
    accountsRaw,
    findDbAccount: async (name) => (h.db && h.db.name === name ? h.db : null),
    readConfirmations: async (name) => {
      if (h.confirmationsThrow) throw new Error("platform mati");
      return h.confirmations.filter((c) => c.operator.toLowerCase() === name.toLowerCase());
    },
    ...over,
  };
}

function confirmEnv(secret = ENV_SECRET) {
  h.confirmations.push({ operator: "operator", fingerprint: secretFingerprint(secret), at: new Date() });
}

function useDbAccount() {
  h.db = { id: 7, name: "rina", role: "viewer", passwordHash: HASH, totpSecret: DB_SECRET, sessionVersion: 3 };
}

/* ── Mesin keadaan login ─────────────────────────────────────────────────── */

describe("decideOperatorLogin", () => {
  it("MFA hidup, belum terkonfirmasi → sesi pemasangan, tanpa kode", async () => {
    const d = await decideOperatorLogin(flowDeps(), { username: "operator", password: PASSWORD, totpCode: "" });
    expect(d).toMatchObject({ kind: "enrol", fingerprint: secretFingerprint(ENV_SECRET) });
  });

  it("MFA hidup, sudah terkonfirmasi → kode wajib; kosong/salah ditolak, benar diterima", async () => {
    confirmEnv();
    const base = { username: "operator", password: PASSWORD };
    expect((await decideOperatorLogin(flowDeps(), { ...base, totpCode: "" })).kind).toBe("denied");
    expect((await decideOperatorLogin(flowDeps(), { ...base, totpCode: "000000" })).kind).toBe("denied");
    const ok = await decideOperatorLogin(flowDeps(), { ...base, totpCode: nowCode(ENV_SECRET) });
    expect(ok).toMatchObject({ kind: "session", account: { name: "operator", source: "env" } });
  });

  it("kata sandi salah → ditolak, baik terkonfirmasi maupun belum", async () => {
    expect((await decideOperatorLogin(flowDeps(), { username: "operator", password: "x", totpCode: "" })).kind).toBe(
      "denied"
    );
    confirmEnv();
    const code = nowCode(ENV_SECRET);
    expect(
      (await decideOperatorLogin(flowDeps(), { username: "operator", password: "x", totpCode: code })).kind
    ).toBe("denied");
  });

  it("konfirmasi BASI (rahasia berganti sejak dikonfirmasi) → pemasangan lagi", async () => {
    confirmEnv(OTHER_SECRET);
    const d = await decideOperatorLogin(flowDeps(), { username: "operator", password: PASSWORD, totpCode: "" });
    expect(d.kind).toBe("enrol");
  });

  it("konfirmasi milik akun LAIN tidak dihitung", async () => {
    h.confirmations.push({ operator: "cadangan", fingerprint: secretFingerprint(ENV_SECRET), at: new Date() });
    const d = await decideOperatorLogin(flowDeps(), { username: "operator", password: PASSWORD, totpCode: "" });
    expect(d.kind).toBe("enrol");
  });

  it("jejak tak terbaca → gagal-tertutup: kode diminta, pemasangan TIDAK ditawarkan", async () => {
    h.confirmationsThrow = true;
    const base = { username: "operator", password: PASSWORD };
    expect((await decideOperatorLogin(flowDeps(), { ...base, totpCode: "" })).kind).toBe("denied");
    expect((await decideOperatorLogin(flowDeps(), { ...base, totpCode: nowCode(ENV_SECRET) })).kind).toBe("session");
  });

  it("OPERATOR_MFA=off → kata sandi saja, juga untuk akun yang belum terkonfirmasi", async () => {
    vi.stubEnv("OPERATOR_MFA", "off");
    const d = await decideOperatorLogin(flowDeps(), { username: "operator", password: PASSWORD, totpCode: "" });
    expect(d.kind).toBe("session");
    expect(
      (await decideOperatorLogin(flowDeps(), { username: "operator", password: "x", totpCode: "" })).kind
    ).toBe("denied");
  });

  it("ejaan lain dari `off` TIDAK mematikan MFA", async () => {
    vi.stubEnv("OPERATOR_MFA", "false");
    const d = await decideOperatorLogin(flowDeps(), { username: "operator", password: PASSWORD, totpCode: "" });
    expect(d.kind).toBe("enrol");
  });

  it("akun basis data yang belum terkonfirmasi → pemasangan dengan id + versi sesinya", async () => {
    useDbAccount();
    const d = await decideOperatorLogin(flowDeps(), { username: "rina", password: PASSWORD, totpCode: "" });
    expect(d).toMatchObject({
      kind: "enrol",
      account: { name: "rina", source: "db", id: 7, sessionVersion: 3 },
      fingerprint: secretFingerprint(DB_SECRET),
    });
  });
});

/* ── Token pemasangan ────────────────────────────────────────────────────── */

describe("token pemasangan ≠ sesi konsol", () => {
  const NOW = new Date("2026-10-23T10:00:00Z");
  const envAccount = { name: "operator", source: "env" as const, id: null, sessionVersion: null };

  it("pulang-pergi, berumur 10 menit, lalu kedaluwarsa", () => {
    const token = issueEnrolmentToken(envAccount, "abcd", NOW, ENV);
    const p = verifyEnrolmentToken(token, NOW, ENV);
    expect(p).toMatchObject({ pur: "enrol", sub: "operator", src: "env", fp: "abcd" });
    expect(p!.exp - p!.iat).toBe(OPERATOR_ENROLMENT_TTL_MS);
    expect(OPERATOR_ENROLMENT_TTL_MS).toBe(10 * 60 * 1000);
    expect(verifyEnrolmentToken(token, new Date(NOW.getTime() + OPERATOR_ENROLMENT_TTL_MS), ENV)).toBeNull();
  });

  it("token pemasangan TIDAK lolos sebagai sesi konsol, dan sebaliknya", () => {
    const enrol = issueEnrolmentToken(envAccount, "abcd", NOW, ENV);
    const session = issueOperatorToken("operator", NOW, ENV);
    expect(verifyOperatorToken(enrol, NOW, ENV)).toBeNull();
    expect(verifyEnrolmentToken(session, NOW, ENV)).toBeNull();
  });

  it("badan yang diubah → null; akun db tanpa id/versi tidak diterbitkan", () => {
    const token = issueEnrolmentToken(envAccount, "abcd", NOW, ENV)!;
    const [body, sig] = token.split(".");
    const forged = JSON.parse(Buffer.from(body, "base64url").toString());
    forged.exp += 60 * 60 * 1000;
    const forgedToken = `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`;
    expect(verifyEnrolmentToken(forgedToken, NOW, ENV)).toBeNull();
    expect(
      issueEnrolmentToken({ name: "rina", source: "db", id: null, sessionVersion: 1 }, "abcd", NOW, ENV)
    ).toBeNull();
  });

  it("rahasia sesi tidak layak → tidak ada token pemasangan (gagal-tertutup)", () => {
    expect(issueEnrolmentToken(envAccount, "abcd", NOW, { OPERATOR_SESSION_SECRET: "pendek" })).toBeNull();
  });
});

/* ── Halaman pemasangan: konteks yang masih berlaku ──────────────────────── */

describe("resolveEnrolment / confirmEnrolment", () => {
  const envPayload = () =>
    verifyEnrolmentToken(
      issueEnrolmentToken(
        { name: "operator", source: "env", id: null, sessionVersion: null },
        secretFingerprint(ENV_SECRET),
        new Date(),
        ENV
      ),
      new Date(),
      ENV
    )!;

  it("sah → konteks dengan rahasia yang berlaku", async () => {
    const ctx = await resolveEnrolment(flowDeps(), envPayload());
    expect(ctx).toMatchObject({ secret: ENV_SECRET, account: { name: "operator", source: "env" } });
  });

  it("rahasia berganti sejak sesi pemasangan terbit → null", async () => {
    const payload = envPayload();
    const ctx = await resolveEnrolment(flowDeps({ accountsRaw: `operator:${HASH}:${OTHER_SECRET}` }), payload);
    expect(ctx).toBeNull();
  });

  it("sudah terkonfirmasi (mis. dari tab lain) → null", async () => {
    const payload = envPayload();
    confirmEnv();
    expect(await resolveEnrolment(flowDeps(), payload)).toBeNull();
  });

  it("jejak tak terbaca → null (rahasia tidak dipajang)", async () => {
    const payload = envPayload();
    h.confirmationsThrow = true;
    expect(await resolveEnrolment(flowDeps(), payload)).toBeNull();
  });

  it("akun env dihapus dari OPERATOR_USERS → null", async () => {
    expect(await resolveEnrolment(flowDeps({ accountsRaw: "" }), envPayload())).toBeNull();
  });

  it("akun db: versi sesi naik (dicabut/diatur ulang) atau nonaktif → null", async () => {
    useDbAccount();
    const payload = verifyEnrolmentToken(
      issueEnrolmentToken(
        { name: "rina", source: "db", id: 7, sessionVersion: 3 },
        secretFingerprint(DB_SECRET),
        new Date(),
        ENV
      ),
      new Date(),
      ENV
    )!;
    expect(await resolveEnrolment(flowDeps(), payload)).not.toBeNull();
    h.db!.sessionVersion = 4;
    expect(await resolveEnrolment(flowDeps(), payload)).toBeNull();
    h.db = null;
    expect(await resolveEnrolment(flowDeps(), payload)).toBeNull();
  });

  it("kode salah → wrong_code; kode benar → confirmed", async () => {
    const payload = envPayload();
    expect((await confirmEnrolment(flowDeps(), payload, "000000")).outcome).toBe("wrong_code");
    expect((await confirmEnrolment(flowDeps(), payload, nowCode(ENV_SECRET))).outcome).toBe("confirmed");
  });

  it("konfirmasi pemasangan terbaca 'Terkonfirmasi' di tabel kesiapan", () => {
    const fp = secretFingerprint(ENV_SECRET);
    const rows = authenticatorReadiness(
      [{ name: "operator", source: "env", fingerprint: fp }],
      [{ operator: "operator", fingerprint: fp, at: new Date() }]
    );
    expect(rows[0].state).toBe("confirmed");
  });
});

/* ── Gerbang: sesi pemasangan tidak membuka rute lain ────────────────────── */

describe("gerbang cookie konsol", () => {
  it("hanya cookie pemasangan: halaman pemasangan saja; rute lain dikembalikan ke sana", () => {
    const enrolOnly = { session: false, enrolment: true };
    expect(decideConsoleGate(ENROLMENT_PATH, enrolOnly)).toEqual({ kind: "next" });
    for (const path of ["/", "/tenants", "/accounts", "/accounts/authenticator", "/audit", "/backup/download"]) {
      expect(decideConsoleGate(path, enrolOnly)).toEqual({ kind: "redirect", to: ENROLMENT_PATH });
    }
  });

  it("tanpa cookie apa pun → /login; dengan sesi konsol, halaman pemasangan pulang ke /", () => {
    expect(decideConsoleGate("/tenants", { session: false, enrolment: false })).toEqual({
      kind: "redirect",
      to: "/login",
    });
    expect(decideConsoleGate(ENROLMENT_PATH, { session: false, enrolment: false })).toEqual({
      kind: "redirect",
      to: "/login",
    });
    expect(decideConsoleGate(ENROLMENT_PATH, { session: true, enrolment: false })).toEqual({
      kind: "redirect",
      to: "/",
    });
    expect(decideConsoleGate("/tenants", { session: true, enrolment: false })).toEqual({ kind: "next" });
  });

  it("proxy memakai gerbang ini", () => {
    const src = readFileSync(join(process.cwd(), "apps/operator/src/proxy.ts"), "utf8");
    expect(src).toContain("decideConsoleGate(");
    expect(src).toContain("enrolmentCookieName(");
  });

  it("penjaga halaman/action/route TIDAK membaca cookie pemasangan — hanya cookie sesi konsol", () => {
    const guard = readFileSync(join(process.cwd(), "apps/operator/src/lib/operator/guard.ts"), "utf8");
    expect(guard).not.toMatch(/enrolment|Enrolment|sai_operator_enrol/);
    expect(guard).toContain("verifyOperatorToken(");
  });

  it("cookie pemasangan hanya dibaca/ditulis di tempat yang disebut", () => {
    const allowed = new Set([
      "apps/operator/src/lib/console-gate.ts",
      "apps/operator/src/lib/operator/session-cookies.ts",
      "apps/operator/src/proxy.ts",
    ]);
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name)) {
          const src = readFileSync(join(process.cwd(), rel), "utf8");
          if (/enrolmentCookieName\(|sai_operator_enrol/.test(src)) found.push(rel);
        }
      }
    };
    walk("apps/operator/src");
    expect(found.filter((f) => !allowed.has(f))).toEqual([]);
  });

  it("nama cookie pemasangan berbeda dari cookie sesi, dengan __Host- di HTTPS", () => {
    expect(enrolmentCookieName(true)).toBe("__Host-sai_operator_enrol");
    expect(enrolmentCookieName(false)).not.toBe("sai_operator");
  });

  it("halaman pemasangan tidak di-cache", () => {
    const cfg = readFileSync(join(process.cwd(), "apps/operator/next.config.ts"), "utf8");
    expect(cfg).toMatch(/source: "\/login\/authenticator",\s*headers: \[\{ key: "Cache-Control", value: "no-store/);
  });
});

/* ── Action: login & konfirmasi pemasangan ───────────────────────────────── */

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

async function expectRedirect(p: Promise<unknown>, to: string) {
  await expect(p).rejects.toThrow(`REDIRECT:${to}`);
}

describe("action login + pemasangan", () => {
  it("belum terkonfirmasi: login menerbitkan cookie PEMASANGAN saja + jejak enroll.start", async () => {
    await expectRedirect(
      operatorLogin({ error: null }, form({ username: "operator", password: PASSWORD, totp: "" })),
      ENROLMENT_PATH
    );
    expect(h.jar.has("sai_operator")).toBe(false);
    expect(h.jar.has("sai_operator_enrol")).toBe(true);
    const start = h.audit.find((a) => a.action === "operator.authenticator.enroll.start");
    expect(start?.details).toMatchObject({ source: "env", fingerprint: secretFingerprint(ENV_SECRET) });
    expect(JSON.stringify(h.audit)).not.toContain(ENV_SECRET);
  });

  it("pemasangan: kode benar → enroll.confirm (bersidik) lalu sesi konsol, cookie pemasangan dibuang", async () => {
    await expectRedirect(
      operatorLogin({ error: null }, form({ username: "operator", password: PASSWORD })),
      ENROLMENT_PATH
    );
    await expectRedirect(enrolmentConfirm({ error: null }, form({ code: nowCode(ENV_SECRET) })), "/");
    expect(h.jar.has("sai_operator_enrol")).toBe(false);
    expect(verifyOperatorToken(h.jar.get("sai_operator"))).toMatchObject({ sub: "operator", mfa: true });

    const actions = h.audit.map((a) => a.action);
    expect(actions).toContain("operator.authenticator.enroll.confirm");
    expect(actions.indexOf("operator.authenticator.enroll.confirm")).toBeLessThan(actions.lastIndexOf("operator.login"));
    expect(h.audit.find((a) => a.action === "operator.authenticator.enroll.confirm")?.details).toMatchObject({
      fingerprint: secretFingerprint(ENV_SECRET),
    });
    expect(JSON.stringify(h.audit)).not.toContain(ENV_SECRET);
  });

  it("kode salah → enroll.failed, tanpa sesi konsol", async () => {
    await expectRedirect(operatorLogin({ error: null }, form({ username: "operator", password: PASSWORD })), ENROLMENT_PATH);
    const r = await enrolmentConfirm({ error: null }, form({ code: "000000" }));
    expect(r.error).toBe("operator.authenticator.errCode");
    expect(h.jar.has("sai_operator")).toBe(false);
    expect(h.audit.at(-1)).toMatchObject({
      action: "operator.authenticator.enroll.failed",
      details: { reason: "wrong_code" },
    });
  });

  it("pembatas laju: ember per akun yang sama dengan /accounts/authenticator; terlampaui → tanpa verifikasi", async () => {
    await expectRedirect(operatorLogin({ error: null }, form({ username: "operator", password: PASSWORD })), ENROLMENT_PATH);
    h.rateAllowed = false;
    const r = await enrolmentConfirm({ error: null }, form({ code: nowCode(ENV_SECRET) }));
    expect(r.error).toBe("operator.login.rateLimited");
    expect(h.jar.has("sai_operator")).toBe(false);
    expect(h.rateKeys.at(-1)).toMatchObject({ key: "operator-authenticator-confirm:operator", maxAttempts: 10 });

    const accountsSrc = readFileSync(
      join(process.cwd(), "apps/operator/src/app/(operator)/accounts/authenticator/actions.ts"),
      "utf8"
    );
    expect(accountsSrc).toContain("authenticatorConfirmBucket(operator.name)");
  });

  it("tanpa cookie pemasangan / kedaluwarsa → expired, tanpa sesi", async () => {
    const r = await enrolmentConfirm({ error: null }, form({ code: "123456" }));
    expect(r).toMatchObject({ expired: true });
    expect(h.jar.has("sai_operator")).toBe(false);
  });

  it("konfirmasi gagal DICATAT → sesi TIDAK terbit", async () => {
    await expectRedirect(operatorLogin({ error: null }, form({ username: "operator", password: PASSWORD })), ENROLMENT_PATH);
    h.auditStrictThrow = true;
    const r = await enrolmentConfirm({ error: null }, form({ code: nowCode(ENV_SECRET) }));
    expect(r.error).toBe("operator.enrol.unavailable");
    expect(h.jar.has("sai_operator")).toBe(false);
  });

  it("sudah terkonfirmasi: login tanpa kode ditolak, dengan kode → sesi konsol langsung", async () => {
    confirmEnv();
    const r = await operatorLogin({ error: null }, form({ username: "operator", password: PASSWORD, totp: "" }));
    expect(r.error).toBe("operator.login.failed");
    expect(h.jar.size).toBe(0);
    await expectRedirect(
      operatorLogin({ error: null }, form({ username: "operator", password: PASSWORD, totp: nowCode(ENV_SECRET) })),
      "/"
    );
    expect(h.jar.has("sai_operator")).toBe(true);
    expect(h.jar.has("sai_operator_enrol")).toBe(false);
  });

  it("OPERATOR_MFA=off: kata sandi saja → sesi konsol, tanpa pemasangan", async () => {
    vi.stubEnv("OPERATOR_MFA", "off");
    await expectRedirect(operatorLogin({ error: null }, form({ username: "operator", password: PASSWORD })), "/");
    expect(h.jar.has("sai_operator")).toBe(true);
    expect(h.audit.some((a) => a.action.startsWith("operator.authenticator.enroll"))).toBe(false);
  });

  it("akun db: sesi yang terbit membawa versi sesi akunnya", async () => {
    useDbAccount();
    await expectRedirect(operatorLogin({ error: null }, form({ username: "rina", password: PASSWORD })), ENROLMENT_PATH);
    await expectRedirect(enrolmentConfirm({ error: null }, form({ code: nowCode(DB_SECRET) })), "/");
    expect(verifyOperatorToken(h.jar.get("sai_operator"))).toMatchObject({ sub: "rina", src: "db", ver: 3 });
  });
});
