/**
 * Bantuan pengguna konsol operator: setiap tindakan hanya menyentuh pengguna /
 * undangan milik tenant di halaman itu, dan surel yang dikirim operator adalah
 * kalimat yang sama dengan surel aplikasi.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { invitationMail, passwordResetMail } from "@/lib/account-mail";
import { invitationOfTenant, revokeUserSessions, userOfTenant } from "@/lib/operator/user-support";
import { operatorCan } from "@/lib/operator/roles";

function fake() {
  const users = [
    { id: 1, tenantId: 7, email: "a@x.id", name: "Ani", username: "ani", sessionVersion: 1 },
    { id: 2, tenantId: 8, email: "b@x.id", name: "Budi", username: "budi", sessionVersion: 1 },
  ];
  const invitations = [
    { id: 10, tenantId: 7, email: "c@x.id", companyId: 3, companyRole: "staff", invitedByUserId: 1, usedAt: null, company: { name: "PT A" } },
    { id: 11, tenantId: 7, email: "d@x.id", companyId: 3, companyRole: "staff", invitedByUserId: 1, usedAt: new Date(), company: { name: "PT A" } },
    { id: 12, tenantId: 8, email: "e@x.id", companyId: 4, companyRole: "staff", invitedByUserId: 2, usedAt: null, company: { name: "PT B" } },
  ];
  const control = {
    user: {
      findUnique: async ({ where }: { where: { id: number } }) => users.find((u) => u.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: number }; data: { sessionVersion: { increment: number } } }) => {
        const u = users.find((x) => x.id === where.id)!;
        u.sessionVersion += data.sessionVersion.increment;
        return u;
      },
    },
    invitation: {
      findUnique: async ({ where }: { where: { id: number } }) => invitations.find((i) => i.id === where.id) ?? null,
    },
  };
  return { users, deps: { control } as never };
}

describe("bantuan pengguna — hanya tenant di halaman itu", () => {
  it("pengguna tenant LAIN tidak ditemukan; sesinya tidak tersentuh", async () => {
    const { users, deps } = fake();
    expect(await userOfTenant(deps, 7, 2)).toBeNull();
    expect(await revokeUserSessions(deps, 7, 2)).toBe("not_found");
    expect(users[1].sessionVersion).toBe(1);
  });

  it("cabut sesi menaikkan versi sesi pengguna yang benar", async () => {
    const { users, deps } = fake();
    expect(await revokeUserSessions(deps, 7, 1)).toBe("revoked");
    expect(users[0].sessionVersion).toBe(2);
  });

  it("undangan: hanya yang terbuka DAN milik tenant ini; nama pengundang ASLI", async () => {
    const { deps } = fake();
    expect(await invitationOfTenant(deps, 7, 10)).toMatchObject({ email: "c@x.id", companyName: "PT A", inviterName: "Ani" });
    expect(await invitationOfTenant(deps, 7, 11)).toBeNull(); // sudah dipakai
    expect(await invitationOfTenant(deps, 7, 12)).toBeNull(); // tenant lain
  });

  it("izin tenant.users: dukungan & owner, bukan penagihan/pengamat", () => {
    expect(operatorCan("support", "tenant.users")).toBe(true);
    expect(operatorCan("owner", "tenant.users")).toBe(true);
    expect(operatorCan("billing", "tenant.users")).toBe(false);
    expect(operatorCan("viewer", "tenant.users")).toBe(false);
  });
});

describe("surel akses akun — satu kalimat untuk aplikasi dan operator", () => {
  it("memuat tautannya dan tidak berbeda antar pemanggil", () => {
    const inv = invitationMail({ companyName: "PT A", inviterName: "Ani", link: "https://app/x?token=t" });
    expect(inv.subject).toBe("Undangan bergabung ke PT A — SAI Accounting");
    expect(inv.text).toContain("  https://app/x?token=t\n");
    expect(passwordResetMail({ name: null, link: "L" }).text).toMatch(/^Halo ,\n/);
  });

  it("rute pelanggan memakai pembangun yang sama, bukan salinan teks", () => {
    for (const f of ["src/app/api/tenant/invitations/route.ts", "src/app/api/auth/forgot-password/route.ts"]) {
      const isi = readFileSync(join(process.cwd(), f), "utf8");
      expect(isi, f).toMatch(/@\/lib\/account-mail/);
      expect(isi, f).not.toMatch(/MENENTUKAN KATA SANDI ANDA SENDIRI|semoga Anda\) meminta/);
    }
  });

  it("tautan operator menuju host PELANGGAN (AUTH_URL), tidak pernah host permintaan", () => {
    const isi = readFileSync(
      join(process.cwd(), "src/app/(app)/(operator)/operator/tenants/[id]/user-actions.ts"),
      "utf8"
    );
    expect(isi).toMatch(/process\.env\.AUTH_URL/);
    expect(isi).not.toMatch(/headers\(\)|request\.url/);
  });
});
