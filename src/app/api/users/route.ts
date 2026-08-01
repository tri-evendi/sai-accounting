import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listCompanyUsers } from "@/lib/users-directory";
import { requireApiPermission } from "@/lib/auth-guard";

/*
 * ── POST (buat akun + kata sandi yang diketik admin) DIHAPUS — issue #139 ──
 *
 * Alur "admin mengetik kata sandi staf lalu mengirimkannya lewat WhatsApp"
 * adalah kata sandi yang bocor sebelum dipakai. Penggantinya UNDANGAN:
 * `POST /api/tenant/invitations` (penjaga tenant `tenant.member.invite`) —
 * penerima menentukan kata sandinya SENDIRI di /accept-invitation. Route itu
 * juga menjawab SERAGAM apa pun keadaan emailnya, menutup kebocoran enumerasi
 * yang dulu hidup di 409 `username_taken` + userId di sini (§4.4).
 * Pembuatan akun dari CLI (scripts/create-admin.ts) tidak berubah.
 */

export async function GET() {
  const result = await requireApiPermission("user.manage");
  if (!result.authorized) return result.response;

  // ANGGOTA perusahaan yang sedang dibuka — bukan seluruh pengguna pemasangan
  // (issue #104). Tanpa batas ini, layar Pengguna PT A akan memperlihatkan
  // seluruh karyawan PT B lengkap dengan peran mereka.
  const users = await listCompanyUsers();

  // issue #75 — jumlah izin khusus untuk lencana di baris pengguna. Dihitung
  // dari basis data PERUSAHAAN (di sanalah override hidup), lalu dipasangkan
  // per id: dua basis data berbeda tidak bisa di-JOIN dalam satu query.
  const overrideCounts = await prisma.userPermissionOverride.groupBy({
    by: ["userId"],
    _count: { _all: true },
    where: { userId: { in: users.map((u) => u.id) } },
  });
  const countByUser = new Map(overrideCounts.map((row) => [row.userId, row._count._all]));

  return NextResponse.json(
    users.map((user) => ({ ...user, overrideCount: countByUser.get(user.id) ?? 0 }))
  );
}
