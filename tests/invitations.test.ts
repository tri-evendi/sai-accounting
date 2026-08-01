/**
 * Undangan staf (issue #139) — sifat yang dikunci:
 *   • token: ter-hash, berbatas waktu (7 hari), sekali pakai, tak pernah kembar;
 *   • TIGA dunia email → SATU jawaban keluar: keputusan `decideInvitationOutcome`
 *     murni, dan bentuk respons HTTP-nya diuji SERAGAM lewat sumber route-nya;
 *   • lintas-tenant DITOLAK — user milik tepat satu tenant (§2);
 *   • kuota `max_users` dihitung SEBELUM email dilihat, termasuk undangan yang
 *     masih menunggu.
 * Sambungan basis datanya (`invitation-store.ts`) hanya menuliskan keputusan
 * ini dalam transaksi — pola yang sama dengan password-reset (#136).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  INVITATION_TTL_MS,
  decideInvitationOutcome,
  hashInvitationToken,
  invitationVerdict,
  mintInvitationToken,
  userQuotaExceeded,
} from "@/lib/invitations";

describe("mintInvitationToken", () => {
  it("token mentah 64 hex; yang disimpan hanya hash-nya, dan keduanya BERBEDA", () => {
    const minted = mintInvitationToken();
    expect(minted.token).toMatch(/^[0-9a-f]{64}$/);
    expect(minted.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(minted.tokenHash).not.toBe(minted.token);
    expect(hashInvitationToken(minted.token)).toBe(minted.tokenHash);
  });

  it("dua token tidak pernah kembar", () => {
    expect(mintInvitationToken().token).not.toBe(mintInvitationToken().token);
  });

  it("kedaluwarsa dijadwalkan 7 hari dari sekarang — undangan menunggu orang cuti", () => {
    const now = new Date("2026-08-01T10:00:00Z");
    const minted = mintInvitationToken(now);
    expect(minted.expiresAt.getTime() - now.getTime()).toBe(INVITATION_TTL_MS);
    expect(INVITATION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("invitationVerdict — siklus hidup token", () => {
  const now = new Date("2026-08-01T10:00:00Z");
  const future = new Date(now.getTime() + 1000);
  const past = new Date(now.getTime() - 1000);

  it("baris tidak ada → not_found", () => {
    expect(invitationVerdict(null, now)).toBe("not_found");
  });

  it("sekali pakai: used_at terisi → used, SEKALIPUN belum kedaluwarsa", () => {
    expect(invitationVerdict({ expiresAt: future, usedAt: past }, now)).toBe("used");
  });

  it("berbatas waktu: lewat (atau tepat di batas) → expired", () => {
    expect(invitationVerdict({ expiresAt: past, usedAt: null }, now)).toBe("expired");
    expect(invitationVerdict({ expiresAt: now, usedAt: null }, now)).toBe("expired");
  });

  it("belum dipakai dan belum lewat → valid", () => {
    expect(invitationVerdict({ expiresAt: future, usedAt: null }, now)).toBe("valid");
  });
});

describe("decideInvitationOutcome — tiga dunia, dan yang mana ditolak", () => {
  it("email belum punya akun → undang sebagai pengguna baru", () => {
    expect(decideInvitationOutcome(null)).toBe("invite_new_user");
  });

  it("akun SETENANT → tambahkan ke PT-nya (addExistingUserToCompany), tanpa akun baru", () => {
    expect(decideInvitationOutcome({ sameTenant: true })).toBe("add_existing_member");
  });

  it("akun TENANT LAIN → DITOLAK: user milik tepat satu tenant (§2)", () => {
    expect(decideInvitationOutcome({ sameTenant: false })).toBe("reject_cross_tenant");
  });
});

describe("kuota max_users — dihitung sebelum email dilihat", () => {
  it("undangan yang menunggu ikut dihitung sebagai kursi terpakai", () => {
    expect(userQuotaExceeded({ currentUsers: 2, pendingInvitations: 1, maxUsers: 3 })).toBe(true);
    expect(userQuotaExceeded({ currentUsers: 2, pendingInvitations: 0, maxUsers: 3 })).toBe(false);
  });

  it("tepat penuh = penuh; kuota nol menolak semuanya", () => {
    expect(userQuotaExceeded({ currentUsers: 3, pendingInvitations: 0, maxUsers: 3 })).toBe(true);
    expect(userQuotaExceeded({ currentUsers: 0, pendingInvitations: 0, maxUsers: 0 })).toBe(true);
  });
});

/*
 * ── Jawaban SERAGAM — dibuktikan dari SUMBER route-nya ──────────────────────
 *
 * Sifat anti-enumerasinya struktural: SATU pernyataan `return` sukses untuk
 * ketiga dunia, dan seluruh kerja per-email berjalan SETELAH respons di dalam
 * `void (async () => …)`. Tes ini menjaga strukturnya supaya refactor yang
 * menambahkan cabang jawaban per-keadaan-email langsung merah, tanpa harus
 * membangun seluruh tumpukan Next di unit test.
 */
describe("POST /api/tenant/invitations — struktur anti-enumerasi", () => {
  const src = readFileSync(
    join(__dirname, "..", "src", "app", "api", "tenant", "invitations", "route.ts"),
    "utf8"
  );

  it("kerja per-email (cari akun, tulis, kirim surel) berjalan SETELAH respons", () => {
    expect(src).toContain("void (async () => {");
    // Penerbitan (yang membaca keadaan email) hidup DI DALAM blok latar itu.
    const backgroundBlock = src.slice(src.indexOf("void (async () => {"));
    expect(backgroundBlock).toContain("issueInvitation(");
    expect(backgroundBlock).toContain("sendMail(");
  });

  it("jawaban suksesnya SATU untuk semua dunia email — tidak ada cabang per-outcome sebelum respons", () => {
    const beforeBackground = src.slice(0, src.indexOf("void (async () => {"));
    // Sebelum respons, keadaan email TIDAK pernah dibaca (impor di atas tidak
    // dihitung — yang dicari PEMANGGILANNYA).
    expect(beforeBackground).not.toContain("findUserByEmail(");
    expect(beforeBackground).not.toContain("await issueInvitation(");
    // Kebocoran lama §4.4 tidak boleh lahir kembali dalam bentuk apa pun.
    expect(src).not.toContain("username_taken");
    expect(src).not.toContain("email_taken");
  });

  it("kuota & pembatas laju diputuskan SEBELUM email dilihat (tidak membocorkan alamat)", () => {
    const idxQuota = src.indexOf("userQuotaExceeded(");
    const idxBackground = src.indexOf("void (async () => {");
    expect(idxQuota).toBeGreaterThan(-1);
    expect(idxQuota).toBeLessThan(idxBackground);
  });
});

describe("penerimaan undangan — kegagalan token dijawab satu kalimat", () => {
  const src = readFileSync(
    join(__dirname, "..", "src", "app", "api", "auth", "accept-invitation", "route.ts"),
    "utf8"
  );

  it("not_found / used / expired jatuh ke SATU jawaban yang sama", () => {
    // Ketiga case bertumpuk pada satu blok return (fallthrough switch).
    expect(src).toMatch(/case "not_found":\s*\n\s*case "used":\s*\n\s*case "expired":/);
  });

  it("route-nya dibatasi laju per-IP — token 256-bit tidak boleh jadi sasaran tebak murah", () => {
    expect(src).toContain("checkRateLimit(");
    expect(src).toContain("invitationAccept");
  });
});
