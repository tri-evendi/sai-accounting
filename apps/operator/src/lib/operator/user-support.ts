/**
 * BANTUAN PENGGUNA dari konsol operator — daftar pengguna & undangan sebuah
 * tenant, dan tindakan yang membuka kembali jalan masuk TANPA operator pernah
 * memegang rahasia siapa pun.
 *
 * ══ YANG SENGAJA TIDAK BISA DILAKUKAN ═════════════════════════════════════
 * Operator TIDAK menyetel kata sandi pelanggan dan TIDAK pernah melihat token
 * atur-ulang maupun token undangan. Yang bisa ia lakukan hanyalah meminta
 * aplikasi MENGIRIM tautan ke alamat surel pemilik akun — alamat yang sama
 * yang akan dipakai pemiliknya sendiri lewat "lupa kata sandi". Kata sandi
 * yang diketik operator adalah kata sandi yang diketahui dua orang.
 *
 * Tanpa `server-only`, klien disuntik (pola `writes.ts`): aturan
 * "pengguna/undangan milik tenant INI" diuji dengan fake. Pengiriman surel
 * ada di server action (`mailer` ber-`server-only`).
 */
import type { PrismaClient as ControlClient } from "@sai/db/client/control";

type Deps = { control: ControlClient };

export interface TenantUserRow {
  id: number;
  username: string;
  name: string | null;
  email: string | null;
  mustChangePassword: boolean;
  activeMemberships: number;
  createdAt: Date;
}

export interface TenantInvitationRow {
  id: number;
  email: string;
  companyName: string;
  companyRole: string;
  expiresAt: Date;
  createdAt: Date;
  expired: boolean;
}

export async function tenantUsersForOperator(
  deps: Deps,
  tenantId: number,
  now: Date = new Date()
): Promise<{ users: TenantUserRow[]; invitations: TenantInvitationRow[] }> {
  const [users, invitations] = await Promise.all([
    deps.control.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        mustChangePassword: true,
        createdAt: true,
        memberships: { where: { isActive: true }, select: { id: true } },
      },
    }),
    deps.control.invitation.findMany({
      where: { tenantId, usedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        companyRole: true,
        expiresAt: true,
        createdAt: true,
        company: { select: { name: true } },
      },
    }),
  ]);
  return {
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      email: u.email,
      mustChangePassword: u.mustChangePassword,
      activeMemberships: u.memberships.length,
      createdAt: u.createdAt,
    })),
    invitations: invitations.map((i) => ({
      id: i.id,
      email: i.email,
      companyName: i.company.name,
      companyRole: i.companyRole,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
      expired: i.expiresAt.getTime() <= now.getTime(),
    })),
  };
}

/**
 * Pengguna milik tenant INI — atau `null`. Setiap tindakan bantuan melewati
 * ini lebih dulu: id pengguna datang dari formulir, dan formulir di halaman
 * tenant A yang membawa id pengguna tenant B tidak boleh menyentuh B.
 */
export async function userOfTenant(
  deps: Deps,
  tenantId: number,
  userId: number
): Promise<{ id: number; email: string | null; name: string | null; username: string } | null> {
  const user = await deps.control.user.findUnique({
    where: { id: userId },
    select: { id: true, tenantId: true, email: true, name: true, username: true },
  });
  if (!user || user.tenantId !== tenantId) return null;
  return { id: user.id, email: user.email, name: user.name, username: user.username };
}

/** Cabut SEMUA sesi pengguna — `session-guard.ts` menolak token yang versinya tertinggal. */
export async function revokeUserSessions(
  deps: Deps,
  tenantId: number,
  userId: number
): Promise<"revoked" | "not_found"> {
  const user = await userOfTenant(deps, tenantId, userId);
  if (!user) return "not_found";
  await deps.control.user.update({
    where: { id: user.id },
    data: { sessionVersion: { increment: 1 } },
  });
  return "revoked";
}

/** Undangan terbuka milik tenant INI, beserta yang dibutuhkan untuk menerbitkannya ulang. */
export async function invitationOfTenant(
  deps: Deps,
  tenantId: number,
  invitationId: number
): Promise<{
  id: number;
  email: string;
  companyId: number;
  companyName: string;
  companyRole: string;
  invitedByUserId: number;
  inviterName: string;
} | null> {
  const inv = await deps.control.invitation.findUnique({
    where: { id: invitationId },
    select: {
      id: true,
      tenantId: true,
      email: true,
      companyId: true,
      companyRole: true,
      invitedByUserId: true,
      usedAt: true,
      company: { select: { name: true } },
    },
  });
  if (!inv || inv.tenantId !== tenantId || inv.usedAt !== null) return null;
  const inviter = await deps.control.user.findUnique({
    where: { id: inv.invitedByUserId },
    select: { name: true, email: true, username: true },
  });
  return {
    id: inv.id,
    email: inv.email,
    companyId: inv.companyId,
    companyName: inv.company.name,
    companyRole: inv.companyRole,
    invitedByUserId: inv.invitedByUserId,
    /* Nama PENGUNDANG ASLI, bukan operator: surelnya kalimat yang sama dengan
       undangan pertama, dan penerimanya mengenal pengundangnya — bukan kita. */
    inviterName: inviter?.name ?? inviter?.email ?? inviter?.username ?? "",
  };
}
