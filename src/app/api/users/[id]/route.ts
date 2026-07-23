import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { z } from "zod";
import { roleEnum } from "@/lib/validations/common";

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

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.password) {
    data.password = await bcrypt.hash(parsed.data.password, 12);
    data.status = 1; // force password change
    data.passDate = null;
  }

  const user = await prisma.user.update({
    where: { id: parseInt(id) },
    data,
    select: { id: true, username: true, name: true, role: true, status: true },
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
    await prisma.user.delete({ where: { id: userId } });
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
