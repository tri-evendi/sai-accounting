import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { z } from "zod";
import { roleEnum } from "@/lib/validations/common";
import { writeAuditLog } from "@/lib/audit";

const updateUserSchema = z.object({
  name: z.string().max(100).trim().optional(),
  role: roleEnum.optional(),
  password: z.string().min(8).max(128).optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("user.manage");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const body = await request.json();
  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const before = await prisma.user.findUnique({
    where: { id: parseInt(id) },
    select: { username: true, role: true },
  });
  if (!before) {
    return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
  }

  const roleChanged = parsed.data.role !== undefined && parsed.data.role !== before.role;

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.password) {
    data.password = await bcrypt.hash(parsed.data.password, 12);
    data.status = 1; // force password change
    data.passDate = null;
  }
  // audit RBAC fase 3 — ganti peran / reset kata sandi mencabut sesi berjalan
  // pengguna itu: versi sesi naik, revalidasi berkala di lib/auth.ts menolak
  // token lama paling lama SESSION_RECHECK_MS kemudian.
  if (roleChanged || parsed.data.password) {
    data.sessionVersion = { increment: 1 };
  }

  const user = await prisma.user.update({
    where: { id: parseInt(id) },
    data,
    select: { id: true, username: true, name: true, role: true, status: true },
  });

  // audit RBAC fase 3 — mutasi paling ber-privilege kini terekam; kata sandi
  // tidak pernah ikut tercatat, hanya FAKTA bahwa ia di-reset.
  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    role: result.session.user.role,
    action: "user.update",
    entity: "user",
    entityId: user.id,
    details: {
      username: user.username,
      ...(roleChanged ? { roleFrom: before.role, roleTo: user.role } : {}),
      ...(parsed.data.password ? { resetPassword: true } : {}),
      ...(parsed.data.name !== undefined ? { nameChanged: true } : {}),
    },
    request,
  });

  return NextResponse.json(user);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireApiPermission("user.manage");
  if (!result.authorized) return result.response;

  const { id } = await params;
  const userId = parseInt(id);

  // Prevent self-deletion
  if (result.session.user.id === String(userId)) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  try {
    const deleted = await prisma.user.delete({
      where: { id: userId },
      select: { username: true, role: true },
    });
    // audit RBAC fase 3 — penghapusan akun terekam; sesi berjalan pengguna itu
    // tercabut otomatis (barisnya hilang → revalidasi di lib/auth.ts menolak).
    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.name,
      role: result.session.user.role,
      action: "user.delete",
      entity: "user",
      entityId: userId,
      details: { username: deleted.username, role: deleted.role },
      request: _request,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    const code = (e as { code?: string }).code;
    // FK RESTRICT: user pernah mengajukan/memutus persetujuan
    // (approval_requests.requested_by_id / decided_by_id, migrasi 0024). Dulu
    // ini melempar 500 tak tertangani; kini 409 yang bisa ditindaklanjuti.
    if (code === "P2003") {
      return NextResponse.json(
        {
          error:
            "Pengguna ini tidak bisa dihapus karena punya riwayat persetujuan. " +
            "Ubah perannya atau nonaktifkan, jangan hapus.",
          code: "referenced",
        },
        { status: 409 }
      );
    }
    // Sudah terhapus / tidak ada
    if (code === "P2025") {
      return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
    }
    throw e;
  }
}
