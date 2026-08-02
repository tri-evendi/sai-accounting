/**
 * Sesi operator (issue #154) — token HMAC bidang terpisah.
 *
 * Yang dibuktikan: token pelanggan/palsu/kedaluwarsa/tanpa-MFA tidak pernah
 * lolos, dan rahasia yang tidak layak membuat SEMUA verifikasi gagal
 * (gagal-tertutup), bukan diloloskan tanpa tanda tangan.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  OPERATOR_SESSION_TTL_MS,
  issueOperatorToken,
  verifyOperatorToken,
} from "@/lib/operator/session";

const ENV = { OPERATOR_SESSION_SECRET: "rahasia-uji-yang-panjangnya-cukup-32-karakter!" };
const NOW = new Date("2026-08-02T10:00:00Z");

describe("issueOperatorToken / verifyOperatorToken", () => {
  it("pulang-pergi: token yang diterbitkan terverifikasi dengan payload utuh", () => {
    const token = issueOperatorToken("vyn", NOW, ENV);
    expect(token).not.toBeNull();
    const payload = verifyOperatorToken(token, NOW, ENV);
    expect(payload).toMatchObject({ sub: "vyn", mfa: true });
    expect(payload!.exp - payload!.iat).toBe(OPERATOR_SESSION_TTL_MS);
  });

  it("kedaluwarsa setelah TTL", () => {
    const token = issueOperatorToken("vyn", NOW, ENV);
    const later = new Date(NOW.getTime() + OPERATOR_SESSION_TTL_MS + 1);
    expect(verifyOperatorToken(token, later, ENV)).toBeNull();
  });

  it("tanda tangan yang diubah → null", () => {
    const token = issueOperatorToken("vyn", NOW, ENV)!;
    const tampered = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
    expect(verifyOperatorToken(tampered, NOW, ENV)).toBeNull();
  });

  it("payload yang diubah (ganti nama operator) → null", () => {
    const token = issueOperatorToken("vyn", NOW, ENV)!;
    const [, sig] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ sub: "attacker", iat: NOW.getTime(), exp: NOW.getTime() + 60_000, mfa: true })
    ).toString("base64url");
    expect(verifyOperatorToken(`${forgedBody}.${sig}`, NOW, ENV)).toBeNull();
  });

  it("token yang ditandatangani rahasia LAIN (mis. bidang pelanggan) → null", () => {
    const other = { OPERATOR_SESSION_SECRET: "rahasia-lain-yang-juga-32-karakter-panjang!!" };
    const token = issueOperatorToken("vyn", NOW, other);
    expect(verifyOperatorToken(token, NOW, ENV)).toBeNull();
  });

  it("token TANPA penanda MFA ditolak — MFA wajib bukan opsi", () => {
    const body = Buffer.from(
      JSON.stringify({ sub: "vyn", iat: NOW.getTime(), exp: NOW.getTime() + 60_000 })
    ).toString("base64url");
    const sig = createHmac("sha256", ENV.OPERATOR_SESSION_SECRET).update(body).digest("base64url");
    expect(verifyOperatorToken(`${body}.${sig}`, NOW, ENV)).toBeNull();
  });

  it("sampah & bentuk aneh → null", () => {
    for (const junk of [null, undefined, "", "abc", "a.b.c", "!!!.???"]) {
      expect(verifyOperatorToken(junk, NOW, ENV)).toBeNull();
    }
  });

  it("GAGAL-TERTUTUP: rahasia tidak diset / terlalu pendek → tidak terbit & tidak terverifikasi", () => {
    const token = issueOperatorToken("vyn", NOW, ENV)!;
    expect(issueOperatorToken("vyn", NOW, {})).toBeNull();
    expect(issueOperatorToken("vyn", NOW, { OPERATOR_SESSION_SECRET: "pendek" })).toBeNull();
    expect(verifyOperatorToken(token, NOW, {})).toBeNull();
    expect(verifyOperatorToken(token, NOW, { OPERATOR_SESSION_SECRET: "pendek" })).toBeNull();
  });
});
