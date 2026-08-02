/**
 * Kredensial operator (issue #154) — penyimpanan kredensial sendiri (env),
 * MFA WAJIB tanpa pengecualian, jawaban gagal seragam.
 */
import { hash } from "bcrypt";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { parseOperatorAccounts, verifyOperatorLogin } from "@/lib/operator/credentials";
import { totpAt } from "@/lib/operator/totp";

const TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const NOW = new Date(1111111111 * 1000);
const CODE_NOW = totpAt(TOTP_SECRET, 1111111111)!; // "050471"

let PASSWORD_HASH: string;
beforeAll(async () => {
  // cost 4: cukup untuk tes; produksi memakai 12 (scripts/operator-credential.ts)
  PASSWORD_HASH = await hash("kata-sandi-operator", 4);
});

describe("parseOperatorAccounts", () => {
  it("mengurai satu dan banyak entri", () => {
    const raw = `vyn:${"$2b$04$abc"}:${TOTP_SECRET}, ops2:${"$2y$12$def"}:SECRET2`;
    const accounts = parseOperatorAccounts(raw);
    expect(accounts.map((a) => a.name)).toEqual(["vyn", "ops2"]);
    expect(accounts[0].totpSecret).toBe(TOTP_SECRET);
  });

  it("kosong/undefined → tanpa akun (gagal-tertutup)", () => {
    expect(parseOperatorAccounts(undefined)).toEqual([]);
    expect(parseOperatorAccounts("")).toEqual([]);
    expect(parseOperatorAccounts("   ")).toEqual([]);
  });

  it("entri TANPA rahasia TOTP dibuang — bukan menjadi akun tanpa MFA", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(parseOperatorAccounts(`vyn:${"$2b$04$abc"}`)).toEqual([]);
      expect(parseOperatorAccounts(`vyn:${"$2b$04$abc"}:`)).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it("hash bukan-bcrypt, nama aneh, kolom berlebih, dan kembar dibuang", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(parseOperatorAccounts(`vyn:plaintext:${TOTP_SECRET}`)).toEqual([]);
      expect(parseOperatorAccounts(`nama yang aneh:$2b$04$abc:${TOTP_SECRET}`)).toEqual([]);
      expect(parseOperatorAccounts(`vyn:$2b$04$abc:${TOTP_SECRET}:extra`)).toEqual([]);
      const twins = parseOperatorAccounts(
        `vyn:$2b$04$abc:${TOTP_SECRET},VYN:$2b$04$def:${TOTP_SECRET}`
      );
      expect(twins).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("verifyOperatorLogin — ketiganya wajib benar sekaligus", () => {
  const raw = () => `vyn:${PASSWORD_HASH}:${TOTP_SECRET}`;

  it("nama + kata sandi + TOTP benar → akun", async () => {
    const account = await verifyOperatorLogin({
      username: "vyn",
      password: "kata-sandi-operator",
      totpCode: CODE_NOW,
      accountsRaw: raw(),
      now: NOW,
    });
    expect(account?.name).toBe("vyn");
  });

  it("kata sandi benar TANPA kode TOTP yang benar → ditolak (MFA wajib)", async () => {
    for (const totpCode of ["", "000000", "123456"]) {
      const account = await verifyOperatorLogin({
        username: "vyn",
        password: "kata-sandi-operator",
        totpCode,
        accountsRaw: raw(),
        now: NOW,
      });
      expect(account).toBeNull();
    }
  });

  it("kata sandi salah → ditolak walau TOTP benar", async () => {
    const account = await verifyOperatorLogin({
      username: "vyn",
      password: "salah",
      totpCode: CODE_NOW,
      accountsRaw: raw(),
      now: NOW,
    });
    expect(account).toBeNull();
  });

  it("akun tidak dikenal → ditolak dengan jawaban yang sama", async () => {
    const account = await verifyOperatorLogin({
      username: "hantu",
      password: "kata-sandi-operator",
      totpCode: CODE_NOW,
      accountsRaw: raw(),
      now: NOW,
    });
    expect(account).toBeNull();
  });

  it("entri tanpa TOTP di env tidak pernah bisa masuk", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const account = await verifyOperatorLogin({
        username: "vyn",
        password: "kata-sandi-operator",
        totpCode: CODE_NOW,
        accountsRaw: `vyn:${PASSWORD_HASH}`,
        now: NOW,
      });
      expect(account).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it("nama tidak peka kapital, sisanya peka", async () => {
    const account = await verifyOperatorLogin({
      username: "  VYN ",
      password: "kata-sandi-operator",
      totpCode: CODE_NOW,
      accountsRaw: raw(),
      now: NOW,
    });
    expect(account?.name).toBe("vyn");
  });
});
