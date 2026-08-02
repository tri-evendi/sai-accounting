/**
 * TOTP operator (issue #154) — divalidasi terhadap vektor uji RESMI
 * RFC 6238 Appendix B (SHA-1): rahasia ASCII "12345678901234567890"
 * (base32: GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ). Nilai rujukan RFC adalah kode
 * 8 digit; kode 6 digit kami adalah `nilai mod 10^6` — enam digit terakhirnya.
 */
import { describe, expect, it } from "vitest";

import { decodeBase32, totpAt, verifyTotp } from "@/lib/operator/totp";

const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("decodeBase32", () => {
  it("mendekode vektor RFC", () => {
    expect(decodeBase32(RFC_SECRET)?.toString("ascii")).toBe("12345678901234567890");
  });

  it("abai kapitalisasi, spasi, dan padding", () => {
    expect(decodeBase32("gezdgnbv gy3tqojq GEZDGNBVGY3TQOJQ==")?.toString("ascii")).toBe(
      "12345678901234567890"
    );
  });

  it("karakter asing / kosong → null", () => {
    expect(decodeBase32("NOT!VALID")).toBeNull();
    expect(decodeBase32("")).toBeNull();
    expect(decodeBase32("189")).toBeNull(); // 1, 8, 9 bukan huruf base32
  });
});

describe("totpAt — vektor RFC 6238 Appendix B (SHA-1, 6 digit)", () => {
  const vectors: [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];

  for (const [time, expected] of vectors) {
    it(`T=${time} → ${expected}`, () => {
      expect(totpAt(RFC_SECRET, time)).toBe(expected);
    });
  }
});

describe("verifyTotp", () => {
  it("menerima kode langkah kini dan toleransi ±1 langkah", () => {
    const now = new Date(1111111111 * 1000);
    expect(verifyTotp(RFC_SECRET, "050471", now)).toBe(true); // langkah ini
    expect(verifyTotp(RFC_SECRET, "081804", now)).toBe(true); // langkah sebelumnya (T=…109)
  });

  it("menolak kode langkah yang jauh", () => {
    const now = new Date(1111111111 * 1000);
    expect(verifyTotp(RFC_SECRET, "287082", now)).toBe(false); // T=59
    expect(verifyTotp(RFC_SECRET, "005924", now)).toBe(false); // T=1234567890
  });

  it("menolak bentuk kode yang salah", () => {
    const now = new Date(1111111111 * 1000);
    expect(verifyTotp(RFC_SECRET, "50471", now)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "0504711", now)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "05047a", now)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "", now)).toBe(false);
  });

  it("rahasia rusak selalu ditolak — bukan diverifikasi sebagian", () => {
    expect(verifyTotp("NOT!VALID", "050471", new Date(1111111111 * 1000))).toBe(false);
  });
});
