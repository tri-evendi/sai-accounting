import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { PROTECTED_CELLS } from "@/lib/authz-overrides";
import {
  applyUserOverrides,
  normalizeUserOverrides,
  rolePermissionSet,
  validateUserOverrides,
} from "@/lib/authz-user-overrides";
import { getEffectiveMatrix, invalidateUserOverrides } from "@/lib/authz-effective";
import { userOverridesPayloadSchema } from "@/lib/validations/authz";
import { writeAuditLog } from "@/lib/audit";

/**
 * Izin khusus per pengguna (issue #75) — API panel "Izin Khusus" di halaman
 * manajemen pengguna. Penjaga `authz.manage` (bukan `user.manage`): ini
 * mengubah OTORISASI, kewenangan yang sama dengan /permissions (#73).
 *
 * GET  → peran + izin efektif PERANNYA + override tersimpan + set izin FINAL
 *        pengguna + izin yang terkunci anti-lockout.
 * PUT  → GANTI seluruh set override pengguna itu (bukan patch): payload
 *        adalah keadaan akhir yang diinginkan, divalidasi zod (bentuk) +
 *        `validateUserOverrides` (anti-lockout bos & delete ⊆ write ⊆ read
 *        pada set FINAL pengguna), lalu dinormalkan (baris yang sama dengan
 *        nilai efektif perannya dibuang — tanpa baris = ikuti peran).
 *        Daftar kosong = "Ikuti peran sepenuhnya".
 *
 * Setiap penyimpanan menginvalidasi cache override PENGGUNA itu dan diaudit
 * beserta aktor + perannya (pola #73). `session_version` SENGAJA tidak
 * dinaikkan: izin tidak hidup di JWT — penegakan membaca cache per-pengguna
 * ber-TTL 60 dtk yang sama dengan revalidasi sesi fase 3, jadi menaikkan
 * versi hanya akan memaksa login ulang tanpa mempercepat apa pun.
 */

async function currentState(user: { id: number; username: string; name: string | null; role: string }) {
  const matrix = await getEffectiveMatrix();
  const roleSet = rolePermissionSet(matrix, user.role);
  const overrides = await prisma.userPermissionOverride.findMany({
    where: { userId: user.id },
    select: { permission: true, allowed: true, updatedAt: true },
    orderBy: { permission: "asc" },
  });
  return {
    user,
    /** Izin yang dimiliki PERAN pengguna ini (matriks efektif #73). */
    roleEffective: [...roleSet],
    overrides,
    /** Set izin FINAL pengguna: efektif peran + override pengguna. */
    effective: applyUserOverrides(roleSet, overrides),
    /** Izin yang tak boleh dicabut dari pengguna ini (anti-lockout). */
    lockedPermissions: PROTECTED_CELLS.filter((c) => c.role === user.role).map(
      (c) => c.permission
    ),
  };
}

async function findTargetUser(rawId: string) {
  if (!/^\d+$/.test(rawId)) return null;
  return prisma.user.findUnique({
    where: { id: Number.parseInt(rawId, 10) },
    select: { id: true, username: true, name: true, role: true },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("authz.manage");
  if (!result.authorized) return result.response;

  const user = await findTargetUser((await params).id);
  if (!user) {
    return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json(await currentState(user));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("authz.manage");
  if (!result.authorized) return result.response;

  const user = await findTargetUser((await params).id);
  if (!user) {
    return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload bukan JSON yang sah." }, { status: 400 });
  }

  const parsed = userOverridesPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Isian tidak sah.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const roleSet = rolePermissionSet(await getEffectiveMatrix(), user.role);
  const errors = validateUserOverrides(user.role, parsed.data.overrides, roleSet);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });
  }

  // Baris yang sama dengan nilai efektif perannya tidak disimpan — "tanpa
  // baris = ikuti peran" tetap jujur, dan indikator "izin khusus" di UI
  // selalu berarti penyimpangan sungguhan.
  const rows = normalizeUserOverrides(roleSet, parsed.data.overrides);

  await prisma.$transaction(async (tx) => {
    await tx.userPermissionOverride.deleteMany({ where: { userId: user.id } });
    if (rows.length > 0) {
      await tx.userPermissionOverride.createMany({
        data: rows.map((row) => ({ userId: user.id, ...row })),
      });
    }
  });

  // Pembaca berikutnya untuk PENGGUNA ini membaca DB lagi; pengguna lain utuh.
  invalidateUserOverrides(user.id);

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    role: result.session.user.role,
    action: rows.length === 0 ? "user.authz.override.reset" : "user.authz.override.update",
    entity: "user_permission_override",
    entityId: user.id,
    details: { username: user.username, role: user.role, count: rows.length, overrides: rows },
    request,
  });

  return NextResponse.json(await currentState(user));
}
