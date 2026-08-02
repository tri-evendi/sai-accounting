/**
 * Sambungan basis data alur UNDANGAN (issue #139).
 *
 * Logika keputusannya murni di `invitations.ts`; berkas ini menuliskan
 * keputusan itu ke basis data kendali. Semua fungsi menerima tenant/perusahaan
 * EKSPLISIT — bukan dari konteks: penerbitan berjalan di pekerjaan latar
 * (sesudah respons seragam terkirim) dan penerimaan berjalan di route PUBLIK;
 * keduanya tidak punya konteks perusahaan, dan menebaknya dilarang #104.
 */

import "server-only";

import { randomBytes } from "node:crypto";

import { controlDb } from "@/lib/control-db";
import {
  decideInvitationOutcome,
  hashInvitationToken,
  invitationUsernameCandidates,
  invitationVerdict,
  mintInvitationToken,
  userQuotaExceeded,
  type InvitationOutcome,
} from "@/lib/invitations";
import { addExistingUserToCompany } from "@/lib/users-directory";
import { TENANT_ROLES } from "@/lib/constants";

/** Kursi terpakai sebuah tenant: pengguna hidup + undangan yang masih menunggu. */
export async function tenantSeatCount(
  tenantId: number
): Promise<{ currentUsers: number; pendingInvitations: number; maxUsers: number }> {
  const [tenant, currentUsers, pendingInvitations] = await Promise.all([
    controlDb.tenant.findUnique({ where: { id: tenantId }, select: { maxUsers: true } }),
    controlDb.user.count({ where: { tenantId } }),
    controlDb.invitation.count({
      where: { tenantId, usedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);
  return {
    currentUsers,
    pendingInvitations,
    maxUsers: tenant?.maxUsers ?? 0,
  };
}

export type IssueResult =
  | { outcome: "invite_new_user"; token: string; expiresAt: Date }
  | { outcome: "add_existing_member"; userId: number }
  | { outcome: "reject_cross_tenant" };

/**
 * Terbitkan undangan untuk sebuah email — SETELAH respons HTTP seragam
 * terkirim. Tiga dunianya (`decideInvitationOutcome`) diselesaikan di sini;
 * pemanggil tinggal mengirim surel yang sesuai hasilnya.
 */
export async function issueInvitation(input: {
  tenantId: number;
  companyId: number;
  email: string;
  companyRole: string;
  invitedByUserId: number;
}): Promise<IssueResult> {
  const email = input.email.trim().toLowerCase();

  const owner = await controlDb.user.findUnique({
    where: { email },
    select: { id: true, tenantId: true },
  });
  const outcome: InvitationOutcome = decideInvitationOutcome(
    owner ? { sameTenant: owner.tenantId === input.tenantId } : null
  );

  if (outcome === "reject_cross_tenant") {
    // User milik TEPAT SATU tenant (docs/MULTI-TENANT.md §2) — tidak ada baris,
    // tidak ada keanggotaan, tidak ada jejak apa pun di tenant pengundang.
    return { outcome };
  }

  if (outcome === "add_existing_member") {
    // Orang setenant → langsung ditambahkan ke PT-nya (janji #104 §4.5, kini
    // dari antarmuka). Tanpa baris undangan: tidak ada yang perlu diterima.
    await addExistingUserToCompany(owner!.id, input.companyRole, input.companyId);
    return { outcome, userId: owner!.id };
  }

  const minted = mintInvitationToken();
  await controlDb.$transaction(async (tx) => {
    /*
     * Undangan lama yang belum terpakai untuk email yang sama DI TENANT INI
     * dimatikan — hanya tautan termuda yang hidup, sama seperti token
     * atur-ulang kata sandi. Ditandai `usedAt`, bukan dihapus: barisnya jejak.
     */
    await tx.invitation.updateMany({
      where: { tenantId: input.tenantId, email, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.invitation.create({
      data: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        email,
        companyRole: input.companyRole,
        invitedByUserId: input.invitedByUserId,
        tokenHash: minted.tokenHash,
        expiresAt: minted.expiresAt,
      },
    });
  });

  return { outcome, token: minted.token, expiresAt: minted.expiresAt };
}

export interface PendingInvitation {
  id: number;
  email: string;
  companyRole: string;
  expiresAt: Date;
  createdAt: Date;
}

/** Undangan yang masih menunggu untuk SATU perusahaan — layar /users. */
export async function pendingInvitationsForCompany(
  companyId: number
): Promise<PendingInvitation[]> {
  return controlDb.invitation.findMany({
    where: { companyId, usedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, email: true, companyRole: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Cabut satu undangan yang masih menunggu. `false` = tidak ada yang dicabut. */
export async function revokeInvitation(id: number, companyId: number): Promise<boolean> {
  const result = await controlDb.invitation.updateMany({
    where: { id, companyId, usedAt: null },
    data: { usedAt: new Date() },
  });
  return result.count > 0;
}

export interface InvitationInfo {
  email: string;
  companyName: string;
  companyRole: string;
  expiresAt: Date;
}

/**
 * Isi sebuah undangan bagi PEMEGANG TOKENNYA — untuk halaman penerimaan
 * ("Anda diundang ke PT X sebagai Y"). Token adalah kredensialnya: memegang
 * tautan = menerima surelnya; tidak ada yang bocor ke siapa pun yang lain.
 */
export async function invitationInfoByToken(token: string): Promise<InvitationInfo | null> {
  const row = await controlDb.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      email: true,
      companyRole: true,
      expiresAt: true,
      usedAt: true,
      company: { select: { name: true } },
    },
  });
  if (invitationVerdict(row) !== "valid" || !row) return null;
  return {
    email: row.email,
    companyName: row.company.name,
    companyRole: row.companyRole,
    expiresAt: row.expiresAt,
  };
}

export type AcceptResult =
  | {
      status: "accepted";
      userId: number;
      username: string;
      companyId: number;
      tenantId: number;
      email: string;
      companyRole: string;
    }
  | { status: "not_found" | "used" | "expired" | "email_taken" | "quota_exceeded" };

/**
 * Terima sebuah undangan: buat `User` + `Membership` (PT tujuan) +
 * `TenantMembership` (`member`) + tandai token terpakai — SATU transaksi,
 * supaya dua penerimaan serentak dengan token yang sama tidak pernah
 * dua-duanya berhasil, dan supaya tidak pernah lahir akun tanpa keanggotaan.
 *
 * Kata sandinya DIPILIH penerimanya sendiri → `mustChangePassword: false`;
 * emailnya TERBUKTI miliknya (ia memegang token dari kotak masuk itu) →
 * `emailVerifiedAt` langsung terisi. Username TIDAK ditanya (#159 temuan 4):
 * ia diturunkan dari email undangan — lihat `invitationUsernameCandidates`.
 */
export async function acceptInvitation(
  token: string,
  input: { name?: string | null; passwordHash: string }
): Promise<AcceptResult> {
  const tokenHash = hashInvitationToken(token);

  return controlDb.$transaction(async (tx) => {
    const row = await tx.invitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        tenantId: true,
        companyId: true,
        email: true,
        companyRole: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    const verdict = invitationVerdict(row);
    if (verdict !== "valid" || !row) return { status: verdict as "not_found" | "used" | "expired" };

    /*
     * Kuota diperiksa ULANG di sini: di antara undangan dan penerimaannya,
     * kursi bisa saja terisi jalur lain. Undangan yang menunggu ikut dihitung
     * saat MENERBITKAN; saat MENERIMA, undangan ini sendiri sedang ditukar
     * menjadi pengguna, jadi yang dihitung cukup pengguna yang sudah ada.
     */
    const [tenant, currentUsers] = await Promise.all([
      tx.tenant.findUnique({ where: { id: row.tenantId }, select: { maxUsers: true } }),
      tx.user.count({ where: { tenantId: row.tenantId } }),
    ]);
    if (
      userQuotaExceeded({
        currentUsers,
        pendingInvitations: 0,
        maxUsers: tenant?.maxUsers ?? 0,
      })
    ) {
      return { status: "quota_exceeded" };
    }

    /* Email unik GLOBAL — antara undangan dan penerimaan, alamat ini bisa
     * saja telanjur dipakai akun lain (tenant mana pun). */
    if (await tx.user.findUnique({ where: { email: row.email }, select: { id: true } })) {
      return { status: "email_taken" };
    }
    /*
     * Username diturunkan dari email undangan (#159 temuan 4) — penerima tidak
     * ditanya. Unik PER TENANT (issue #136, ditegakkan lapisan aplikasi):
     * kandidat deterministik dicek sekali, yang pertama bebas dipakai. Cabang
     * `??` praktis tak tergapai — kandidat terakhir berakhiran acak — dan
     * hanya penjaga bila SEMUA kandidat kebetulan terpakai.
     */
    const candidates = invitationUsernameCandidates(row.email);
    const occupied = new Set(
      (
        await tx.user.findMany({
          where: { tenantId: row.tenantId, username: { in: candidates } },
          select: { username: true },
        })
      ).map((u) => u.username)
    );
    const username =
      candidates.find((candidate) => !occupied.has(candidate)) ??
      `${candidates[0]}-${randomBytes(4).toString("hex")}`;

    const user = await tx.user.create({
      data: {
        username,
        name: input.name?.trim() || null,
        email: row.email,
        emailVerifiedAt: new Date(),
        password: input.passwordHash,
        tenantId: row.tenantId,
        mustChangePassword: false,
        passDate: new Date(),
      },
      select: { id: true },
    });
    await tx.membership.create({
      data: { userId: user.id, companyId: row.companyId, role: row.companyRole },
    });
    await tx.tenantMembership.create({
      data: { tenantId: row.tenantId, userId: user.id, role: TENANT_ROLES.MEMBER },
    });
    await tx.invitation.update({ where: { id: row.id }, data: { usedAt: new Date() } });

    return {
      status: "accepted",
      userId: user.id,
      username,
      companyId: row.companyId,
      tenantId: row.tenantId,
      email: row.email,
      companyRole: row.companyRole,
    };
  });
}
