/**
 * Token atur-ulang kata sandi (issue #136) — sifat yang dikunci:
 *   • token mentah TIDAK PERNAH sama dengan yang disimpan (SHA-256);
 *   • berbatas waktu: lewat `expires_at` = tidak berlaku;
 *   • sekali pakai: `used_at` terisi = tidak berlaku;
 *   • dua token tidak pernah kembar.
 * Logika keputusannya murni (`verdictForToken`) — sambungan basis datanya di
 * `password-reset-store.ts` hanya menuliskan keputusan ini dalam transaksi.
 */
import { describe, expect, it } from "vitest";

import {
  RESET_TOKEN_TTL_MS,
  hashResetToken,
  mintResetToken,
  verdictForToken,
} from "@/lib/password-reset";

describe("mintResetToken", () => {
  it("token mentah 64 hex; yang disimpan hanya hash-nya, dan keduanya BERBEDA", () => {
    const minted = mintResetToken();
    expect(minted.token).toMatch(/^[0-9a-f]{64}$/);
    expect(minted.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(minted.tokenHash).not.toBe(minted.token);
    expect(hashResetToken(minted.token)).toBe(minted.tokenHash);
  });

  it("dua token tidak pernah kembar", () => {
    expect(mintResetToken().token).not.toBe(mintResetToken().token);
  });

  it("kedaluwarsa dijadwalkan TTL dari sekarang (60 menit)", () => {
    const now = new Date("2026-08-01T10:00:00Z");
    const minted = mintResetToken(now);
    expect(minted.expiresAt.getTime() - now.getTime()).toBe(RESET_TOKEN_TTL_MS);
    expect(RESET_TOKEN_TTL_MS).toBe(60 * 60 * 1000);
  });
});

describe("verdictForToken", () => {
  const now = new Date("2026-08-01T10:00:00Z");
  const future = new Date(now.getTime() + 1000);
  const past = new Date(now.getTime() - 1000);

  it("baris tidak ada → not_found (dan pemanggil menjawab SATU kalimat yang sama)", () => {
    expect(verdictForToken(null, now)).toBe("not_found");
  });

  it("sudah dipakai → used, SEKALIPUN belum kedaluwarsa", () => {
    expect(verdictForToken({ expiresAt: future, usedAt: past }, now)).toBe("used");
  });

  it("lewat waktu → expired; tepat di batasnya juga TIDAK berlaku", () => {
    expect(verdictForToken({ expiresAt: past, usedAt: null }, now)).toBe("expired");
    expect(verdictForToken({ expiresAt: now, usedAt: null }, now)).toBe("expired");
  });

  it("belum dipakai dan belum lewat → valid", () => {
    expect(verdictForToken({ expiresAt: future, usedAt: null }, now)).toBe("valid");
  });
});
