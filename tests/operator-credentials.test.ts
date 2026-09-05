/**
 * Kredensial operator (issue #154) — penyimpanan kredensial sendiri (env),
 * MFA WAJIB tanpa pengecualian, jawaban gagal seragam.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { hash } from "bcrypt";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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

/* ========================================================================== */
/* Saklar OPERATOR_MFA=off                                                    */
/* ========================================================================== */

describe("saklar OPERATOR_MFA", () => {
  /* FUNGSI, bukan konstanta: badan `describe` dievaluasi SEBELUM `beforeAll`,
   * jadi `PASSWORD_HASH` masih `undefined` di sana dan entrinya lahir salah
   * bentuk — lalu tesnya gagal karena alasan yang sama sekali lain. */
  const raw = () => `vyn:${PASSWORD_HASH}:${TOTP_SECRET}`;

  afterEach(() => {
    delete process.env.OPERATOR_MFA;
  });

  it("bawaannya HIDUP — tanpa env, kode TOTP salah tetap ditolak", async () => {
    expect(
      await verifyOperatorLogin({
        username: "vyn",
        password: "kata-sandi-operator",
        totpCode: "000000",
        accountsRaw: raw(),
      })
    ).toBeNull();
  });

  it("`off` melewatkan TOTP — tapi kata sandi TETAP diperiksa", async () => {
    process.env.OPERATOR_MFA = "off";
    expect(
      await verifyOperatorLogin({
        username: "vyn",
        password: "kata-sandi-operator",
        totpCode: "000000",
        accountsRaw: raw(),
      })
    ).not.toBeNull();
    /* Yang paling mudah salah dibuat: mematikan MFA sekalian mematikan kata
     * sandinya. Kalau baris ini hijau dengan sandi salah, saklarnya bukan
     * "tanpa MFA" melainkan "tanpa autentikasi". */
    expect(
      await verifyOperatorLogin({
        username: "vyn",
        password: "sandi-yang-salah",
        totpCode: "000000",
        accountsRaw: raw(),
      })
    ).toBeNull();
  });

  it("hanya `off` PERSIS yang mematikan — ejaan lain berarti TETAP HIDUP", async () => {
    for (const nilai of ["false", "0", "no", "OFFF", "", " "]) {
      process.env.OPERATOR_MFA = nilai;
      expect(
        await verifyOperatorLogin({
          username: "vyn",
          password: "kata-sandi-operator",
          totpCode: "000000",
          accountsRaw: raw(),
        }),
        `OPERATOR_MFA="${nilai}" tidak boleh mematikan MFA`
      ).toBeNull();
    }
  });

  it("`OFF`/` off ` tetap dikenali — huruf besar & spasi bukan salah ketik", async () => {
    for (const nilai of ["OFF", " off ", "Off"]) {
      process.env.OPERATOR_MFA = nilai;
      expect(
        await verifyOperatorLogin({
          username: "vyn",
          password: "kata-sandi-operator",
          totpCode: "000000",
          accountsRaw: raw(),
        }),
        `OPERATOR_MFA="${nilai}" seharusnya mematikan MFA`
      ).not.toBeNull();
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* Sakelar dan FORMULIR harus sepakat                                        */
/* ────────────────────────────────────────────────────────────────────────── */
describe("OPERATOR_MFA=off — formulirnya ikut, bukan hanya servernya", () => {
  const form = readFileSync(
    join(process.cwd(), "src/app/(app)/(operator)/operator/login/login-form.tsx"),
    "utf8"
  );
  const page = readFileSync(
    join(process.cwd(), "src/app/(app)/(operator)/operator/login/page.tsx"),
    "utf8"
  );

  it("medan TOTP dirender bersyarat, tidak selalu", () => {
    /*
     * Cacat yang ditemukan 5 Sep 2026: sakelar `OPERATOR_MFA=off` melewati
     * verifikasi di SERVER, tetapi medan TOTP tetap `required` +
     * `pattern="[0-9]{6}"` — jadi PERAMBAN menolak mengirim formulirnya
     * sampai enam angka diisi. MFA "sudah dimatikan" dan tetap tidak ada yang
     * bisa masuk, tanpa satu baris pun di log server: permintaannya memang
     * tidak pernah sampai ke sana.
     *
     * Kelas cacatnya umum — penjaga sisi-server dilonggarkan sementara
     * validasi sisi-klien tertinggal — dan sunyi justru karena kedua sisi
     * "benar" menurut dirinya sendiri.
     */
    expect(form).toContain("mfaOff");
    expect(form).toMatch(/\{!mfaOff &&/);
  });

  it("halaman meneruskan keadaan sakelarnya dari server", () => {
    // Tanpa ini medannya bersyarat pada sesuatu yang tak pernah berubah.
    expect(page).toContain("operatorMfaOff");
    expect(page).toMatch(/mfaOff=\{operatorMfaOff\(\)\}/);
  });

  it("sakelarnya dibaca di server — bukan diseberangkan sebagai NEXT_PUBLIC", () => {
    // `NEXT_PUBLIC_` akan menjahit keadaan MFA ke setiap bundel yang dikirim
    // ke SEMUA orang, bukan cuma pengunjung halaman login operator.
    expect(form).not.toContain("NEXT_PUBLIC_OPERATOR");
    expect(form).not.toContain("process.env.OPERATOR_MFA");
  });
});
