/**
 * PASANG AUTHENTICATOR konsol operator: QR dikodekan di server tanpa URL luar
 * dan tanpa teks rahasia, bukti ulang WAJIB sebelum rahasia dipajang,
 * konfirmasi memverifikasi kode dan hanya mencatat SIDIK, putaran rahasia akun
 * basis data menuntut kode dari rahasia BARU, dan tabel kesiapan membedakan
 * terkonfirmasi / basi / belum.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { hash } from "bcrypt";
import { renderToStaticMarkup } from "react-dom/server";
import { encode } from "uqr";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { QrCode } from "@op/components/operator/qr-code";
import {
  authenticatorReadiness,
  confirmAuthenticator,
  enrolmentFor,
  finishRotation,
  revealAuthenticator,
  ROTATION_TTL_MS,
  secretFingerprint,
  startRotation,
  type AuthenticatorDeps,
} from "@op/lib/operator/authenticator";
import type { DbOperatorCredential } from "@op/lib/operator/credentials";
import { qrSvgData } from "@op/lib/operator/qr";
import { otpauthUri, totpAt } from "@op/lib/operator/totp";
import { openSecret } from "@sai/core/settings-crypto";

const ENV_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const DB_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const T = 1_800_000_000;
const NOW = new Date(T * 1000);
const PASSWORD = "kata-sandi-operator";

let HASH: string;
let accountsRaw: string;

beforeAll(async () => {
  process.env.SETTINGS_ENCRYPTION_KEY = "b".repeat(64);
  HASH = await hash(PASSWORD, 4);
  const otherHash = await hash("sandi-akun-lain", 4);
  accountsRaw = `operator:${HASH}:${ENV_SECRET},cadangan:${otherHash}:${DB_SECRET}`;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const ENV_OP = { name: "operator", source: "env" as const, id: null };
const DB_OP = { name: "rina", source: "db" as const, id: 7 };

function deps(over: Partial<AuthenticatorDeps> = {}): AuthenticatorDeps {
  const db: DbOperatorCredential = {
    id: 7,
    name: "rina",
    role: "viewer",
    passwordHash: HASH,
    totpSecret: DB_SECRET,
    sessionVersion: 1,
  };
  return {
    accountsRaw,
    now: NOW,
    findDbAccount: async (name) => (name === "rina" ? db : null),
    ...over,
  };
}

/* ── QR ─────────────────────────────────────────────────────────────────── */

describe("QR otpauth dikodekan di server — hanya geometri", () => {
  const uri = otpauthUri("SAI Operator", "operator", ENV_SECRET);
  const qr = qrSvgData(uri);

  it("matriksnya = pengodean uqr atas URI, dengan zona tenang 4 modul", () => {
    const ref = encode(uri, { ecc: "M", border: 4 });
    expect(qr.size).toBe(ref.size);
    /* Pola pencari kiri-atas: deret gelap 7 modul mulai (4,4). */
    expect(qr.path.startsWith("M4 4h7v1h-7z")).toBe(true);
    /* Hitung modul gelap dari jalur = hitungan matriks rujukan. */
    const fromPath = [...qr.path.matchAll(/h(\d+)v1/g)].reduce((n, m) => n + Number(m[1]), 0);
    const fromRef = ref.data.flat().filter(Boolean).length;
    expect(fromPath).toBe(fromRef);
  });

  it("jalur hanya perintah SVG — tanpa rahasia, tanpa URI, tanpa URL", () => {
    expect(qr.path).toMatch(/^[Mhvz0-9 -]+$/);
    expect(JSON.stringify(qr)).not.toContain(ENV_SECRET);
    expect(JSON.stringify(qr)).not.toContain("otpauth");
  });

  it("SVG yang dirender: sebaris, tanpa <image>/href/URL, dan rahasianya tidak tertulis", () => {
    const html = renderToStaticMarkup(<QrCode qr={qr} label="QR operator" />);
    expect(html.startsWith("<svg")).toBe(true);
    expect(html).toContain('role="img"');
    expect(html).not.toMatch(/<image|<img|href|https?:|url\(|<script|<foreignObject/i);
    expect(html).not.toContain(ENV_SECRET);
    expect(html).not.toContain("otpauth");
  });

  it("tidak ada layanan QR luar di sumber mana pun yang menggambar QR", () => {
    for (const f of [
      "apps/operator/src/lib/operator/qr.ts",
      "apps/operator/src/components/operator/qr-code.tsx",
      "apps/operator/src/components/operator/authenticator-setup.tsx",
      "apps/operator/src/components/operator/operator-accounts.tsx",
    ]) {
      /* Komentar dibuang: kepala berkas memang MENYEBUT pola yang dilarang. */
      const src = readFileSync(join(process.cwd(), f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/https?:\/\/|<img\b|chart\.googleapis|qrserver|quickchart/i);
    }
  });

  it("kredensial yang diterbitkan untuk akun basis data membawa QR dari URI-nya", () => {
    const enrolment = enrolmentFor("operator", ENV_SECRET);
    expect(enrolment.otpauthUri).toBe(uri);
    expect(enrolment.qr).toEqual(qr);
    expect(enrolment.secretGrouped.replace(/ /g, "")).toBe(ENV_SECRET);
  });

  it("uqr dipatok versi PERSIS di manifes konsol", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "apps/operator/package.json"), "utf8"));
    expect(pkg.dependencies.uqr).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

/* ── Bukti ulang ─────────────────────────────────────────────────────────── */

describe("rahasia hanya dipajang sesudah bukti ulang", () => {
  const code = (s: string) => totpAt(s, T)!;

  it("MFA hidup: kata sandi SAJA ditolak; kata sandi + kode berlaku membuka QR", async () => {
    expect(await revealAuthenticator(deps(), ENV_OP, { password: PASSWORD, code: "" })).toEqual({
      outcome: "denied",
    });
    expect(
      await revealAuthenticator(deps(), ENV_OP, { password: PASSWORD, code: "000000" === code(ENV_SECRET) ? "111111" : "000000" })
    ).toEqual({ outcome: "denied" });
    const ok = await revealAuthenticator(deps(), ENV_OP, { password: PASSWORD, code: code(ENV_SECRET) });
    expect(ok.outcome).toBe("revealed");
    if (ok.outcome === "revealed") {
      expect(ok.enrolment.otpauthUri).toContain(`secret=${ENV_SECRET}`);
      expect(ok.fingerprint).toBe(secretFingerprint(ENV_SECRET));
    }
  });

  it("kata sandi salah ditolak bahkan saat MFA mati; kata sandi benar cukup saat MFA mati", async () => {
    vi.stubEnv("OPERATOR_MFA", "off");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await revealAuthenticator(deps(), ENV_OP, { password: "salah", code: "" })).toEqual({
      outcome: "denied",
    });
    expect(await revealAuthenticator(deps(), ENV_OP, { password: "", code: "" })).toEqual({ outcome: "denied" });
    expect((await revealAuthenticator(deps(), ENV_OP, { password: PASSWORD, code: "" })).outcome).toBe("revealed");
  });

  it("kata sandi akun LAIN tidak membuka QR akun yang sedang masuk", async () => {
    vi.stubEnv("OPERATOR_MFA", "off");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await revealAuthenticator(deps(), ENV_OP, { password: "sandi-akun-lain", code: "" })).toEqual({
      outcome: "denied",
    });
  });

  it("akun basis data: rahasianya dari pencari, bukan dari env", async () => {
    const ok = await revealAuthenticator(deps(), DB_OP, { password: PASSWORD, code: code(DB_SECRET) });
    expect(ok.outcome).toBe("revealed");
    if (ok.outcome === "revealed") expect(ok.enrolment.otpauthUri).toContain(`secret=${DB_SECRET}`);
  });
});

/* ── Konfirmasi ──────────────────────────────────────────────────────────── */

describe("konfirmasi", () => {
  it("kode yang benar terkonfirmasi dengan SIDIK — sidik bukan rahasianya", async () => {
    const ok = await confirmAuthenticator(deps(), ENV_OP, totpAt(ENV_SECRET, T)!);
    expect(ok).toEqual({ outcome: "confirmed", fingerprint: secretFingerprint(ENV_SECRET) });
    if (ok.outcome === "confirmed") {
      expect(ok.fingerprint).toMatch(/^[0-9a-f]{16}$/);
      expect(ok.fingerprint).not.toContain(ENV_SECRET.toLowerCase());
    }
  });

  it("kode salah / kode untuk rahasia lain ditolak", async () => {
    expect(await confirmAuthenticator(deps(), ENV_OP, "12345")).toEqual({ outcome: "wrong_code" });
    expect(await confirmAuthenticator(deps(), ENV_OP, totpAt(DB_SECRET, T)!)).toEqual({ outcome: "wrong_code" });
  });

  it("akun env yang hilang dari OPERATOR_USERS → unavailable, bukan terkonfirmasi", async () => {
    expect(await confirmAuthenticator(deps({ accountsRaw: "" }), ENV_OP, "123456")).toEqual({
      outcome: "unavailable",
    });
  });
});

/* ── Putaran rahasia akun basis data ────────────────────────────────────── */

describe("putar rahasia (akun basis data saja)", () => {
  function fakeControl() {
    const updateMany = vi.fn(async (_args: unknown) => ({ count: 1 }));
    return { control: { operatorAccount: { updateMany } } as never, updateMany };
  }

  it("akun env tidak bisa diputar dari konsol", async () => {
    expect(await startRotation(deps(), ENV_OP, { password: PASSWORD, code: totpAt(ENV_SECRET, T)! })).toEqual({
      outcome: "env_account",
    });
    const { control } = fakeControl();
    expect(await finishRotation({ control, now: NOW }, ENV_OP, { ticket: "x.y.z", code: "123456" })).toEqual({
      outcome: "env_account",
    });
  });

  it("mulai menuntut bukti ulang", async () => {
    expect(await startRotation(deps(), DB_OP, { password: "salah", code: totpAt(DB_SECRET, T)! })).toEqual({
      outcome: "denied",
    });
  });

  it("rahasia baru menggantikan yang lama HANYA sesudah kode darinya diterima", async () => {
    const started = await startRotation(deps(), DB_OP, { password: PASSWORD, code: totpAt(DB_SECRET, T)! });
    expect(started.outcome).toBe("started");
    if (started.outcome !== "started") return;
    const newSecret = started.enrolment.secretGrouped.replace(/ /g, "");
    expect(newSecret).not.toBe(DB_SECRET);
    /* Tiket tersegel: rahasia barunya tidak terbaca dari tiketnya. */
    expect(started.ticket).not.toContain(newSecret);

    const { control, updateMany } = fakeControl();
    /* Satu karakter ciphertext diganti — segel GCM wajib menolaknya. */
    const tamper = (ticket: string) => (ticket[0] === "A" ? "B" : "A") + ticket.slice(1);

    /* Kode dari rahasia LAMA tidak menyelesaikan putaran. */
    expect(
      await finishRotation({ control, now: NOW }, DB_OP, { ticket: started.ticket, code: totpAt(DB_SECRET, T)! })
    ).toEqual({ outcome: "wrong_code" });
    expect(updateMany).not.toHaveBeenCalled();

    /* Tiket milik akun lain / kedaluwarsa / diubah → ditolak. */
    expect(
      await finishRotation({ control, now: NOW }, { ...DB_OP, id: 8 }, { ticket: started.ticket, code: totpAt(newSecret, T)! })
    ).toEqual({ outcome: "ticket_invalid" });
    const later = new Date(NOW.getTime() + ROTATION_TTL_MS + 1000);
    expect(
      await finishRotation({ control, now: later }, DB_OP, {
        ticket: started.ticket,
        code: totpAt(newSecret, later.getTime() / 1000)!,
      })
    ).toEqual({ outcome: "ticket_invalid" });
    expect(
      await finishRotation({ control, now: NOW }, DB_OP, { ticket: tamper(started.ticket), code: totpAt(newSecret, T)! })
    ).toEqual({ outcome: "ticket_invalid" });
    expect(updateMany).not.toHaveBeenCalled();

    const done = await finishRotation({ control, now: NOW }, DB_OP, {
      ticket: started.ticket,
      code: totpAt(newSecret, T)!,
    });
    expect(done).toEqual({ outcome: "rotated", fingerprint: secretFingerprint(newSecret) });
    expect(updateMany).toHaveBeenCalledTimes(1);
    const args = updateMany.mock.calls[0][0] as {
      where: { id: number; name: string; isActive: boolean };
      data: { totpCiphertext: string; totpIv: string; totpTag: string };
    };
    expect(args.where).toEqual({ id: 7, name: "rina", isActive: true });
    expect(openSecret({ ciphertext: args.data.totpCiphertext, iv: args.data.totpIv, tag: args.data.totpTag })).toBe(
      newSecret
    );
  });
});

/* ── Kesiapan ────────────────────────────────────────────────────────────── */

describe("kesiapan MFA", () => {
  it("terkonfirmasi / basi (rahasia berganti) / belum", () => {
    const fpEnv = secretFingerprint(ENV_SECRET);
    const at = new Date("2026-10-20T03:00:00Z");
    const rows = authenticatorReadiness(
      [
        { name: "operator", source: "env", fingerprint: fpEnv },
        { name: "rina", source: "db", fingerprint: secretFingerprint(DB_SECRET) },
        { name: "budi", source: "db", fingerprint: secretFingerprint("AAAA") },
      ],
      [
        { operator: "Operator", fingerprint: fpEnv, at },
        { operator: "rina", fingerprint: "0000000000000000", at },
      ]
    );
    expect(rows.map((r) => [r.name, r.state])).toEqual([
      ["operator", "confirmed"],
      ["rina", "stale"],
      ["budi", "missing"],
    ]);
    expect(rows[0].confirmedAt).toEqual(at);
  });
});

/* ── Permukaan ───────────────────────────────────────────────────────────── */

describe("permukaan /accounts/authenticator", () => {
  const AKAR = join(process.cwd(), "apps/operator/src/app/(operator)/accounts/authenticator");

  it("action: penjaga operator.self, pembatas laju, lalu bukti ulang", () => {
    const src = readFileSync(join(AKAR, "actions.ts"), "utf8");
    expect(src).toContain('requireOperatorActionSession("operator.self")');
    expect(src.match(/checkSharedRateLimit\(/g)?.length).toBe(2);
    /* Pembatas laju berjalan SEBELUM verifikasi apa pun. */
    expect(src.indexOf("checkSharedRateLimit(")).toBeLessThan(src.indexOf("revealAuthenticator("));
  });

  it("jejak audit tidak pernah membawa rahasia, URI, atau QR", () => {
    const src = readFileSync(join(AKAR, "actions.ts"), "utf8");
    for (const m of src.matchAll(/writeOperatorAuditLog\(\{([\s\S]*?)\}\);/g)) {
      expect(m[1]).not.toMatch(/secret|enrolment|otpauth|ticket:|\.qr\b/i);
    }
  });

  it("halaman dinamis + Cache-Control no-store di konfigurasi", () => {
    expect(readFileSync(join(AKAR, "page.tsx"), "utf8")).toContain('export const dynamic = "force-dynamic"');
    const config = readFileSync(join(process.cwd(), "apps/operator/next.config.ts"), "utf8");
    expect(config).toMatch(/source: "\/accounts\/authenticator",\s*headers: \[\{ key: "Cache-Control", value: "no-store/);
  });
});
