/**
 * Kelola peran — ubah label / aktif-nonaktif (PATCH) & hapus (DELETE), by KEY.
 * Di-gate `authz.manage`. Peran SISTEM (bos/core/ptg) tak bisa dinonaktifkan
 * maupun dihapus; peran yang masih dipakai pengguna tak bisa dihapus.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { canDeactivateRole, roleDeletionBlock, validateRoleLabel } from "@/lib/roles-admin";
import { invalidateEffectiveMatrix } from "@/lib/authz-effective";
import { writeAuditLog } from "@/lib/audit";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const result = await requireApiPermission("authz.manage");
  if (!result.authorized) return result.response;

  const { key } = await params;
  const role = await prisma.role.findUnique({ where: { key } });
  if (!role) return NextResponse.json({ error: "Peran tidak ditemukan." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload bukan JSON yang sah." }, { status: 400 });
  }
  const b = (body ?? {}) as { label?: unknown; isActive?: unknown };

  const data: { label?: string; isActive?: boolean } = {};

  if (b.label !== undefined) {
    const valid = validateRoleLabel(b.label);
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
    data.label = valid.label;
  }

  if (typeof b.isActive === "boolean") {
    if (!b.isActive && !canDeactivateRole(role)) {
      return NextResponse.json({ error: "Peran sistem tak bisa dinonaktifkan." }, { status: 403 });
    }
    data.isActive = b.isActive;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Tidak ada yang diubah." }, { status: 400 });
  }

  const updated = await prisma.role.update({ where: { key }, data });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    role: result.session.user.role,
    action: "role.update",
    entity: "role",
    details: { key: role.key, changes: data },
    request,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const result = await requireApiPermission("authz.manage");
  if (!result.authorized) return result.response;

  const { key } = await params;
  const role = await prisma.role.findUnique({ where: { key } });
  if (!role) return NextResponse.json({ error: "Peran tidak ditemukan." }, { status: 404 });

  const usersWithRole = await prisma.user.count({ where: { role: role.key } });
  const block = roleDeletionBlock(role, usersWithRole);
  if (block) return NextResponse.json({ error: block }, { status: 409 });

  // Hapus peran + baris override izinnya (agar tak ada baris yatim).
  await prisma.$transaction(async (tx) => {
    await tx.rolePermissionOverride.deleteMany({ where: { role: role.key } });
    await tx.role.delete({ where: { key } });
  });

  // Baris override peran ini lenyap → matriks efektif dirakit ulang.
  invalidateEffectiveMatrix();

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    role: result.session.user.role,
    action: "role.delete",
    entity: "role",
    details: { key: role.key, label: role.label },
    request,
  });

  return NextResponse.json({ ok: true });
}
