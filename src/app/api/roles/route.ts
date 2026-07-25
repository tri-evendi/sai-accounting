/**
 * Kelola peran (peran dinamis) — daftar & buat. Di-gate `authz.manage` (sama
 * dengan /permissions: mengelola peran = mengelola hak akses). Peran baru lahir
 * TANPA izin; izinnya diatur di /permissions (role_permission_overrides).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { getRoles } from "@/lib/roles";
import { validateNewRole } from "@/lib/roles-admin";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  const result = await requireApiPermission("authz.manage");
  if (!result.authorized) return result.response;
  return NextResponse.json(await getRoles());
}

export async function POST(request: Request) {
  const result = await requireApiPermission("authz.manage");
  if (!result.authorized) return result.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload bukan JSON yang sah." }, { status: 400 });
  }

  const b = (body ?? {}) as { key?: unknown; label?: unknown };
  const valid = validateNewRole(b.key, b.label);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

  const existing = await prisma.role.findUnique({ where: { key: valid.value.key } });
  if (existing) {
    return NextResponse.json({ error: `Kunci "${valid.value.key}" sudah dipakai.` }, { status: 409 });
  }

  const role = await prisma.role.create({
    data: { key: valid.value.key, label: valid.value.label, isSystem: false, isActive: true },
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    role: result.session.user.role,
    action: "role.create",
    entity: "role",
    details: { key: role.key, label: role.label },
    request,
  });

  return NextResponse.json(role, { status: 201 });
}
