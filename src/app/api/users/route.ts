import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { z } from "zod";
import { roleEnum } from "@/lib/validations/common";
import { writeAuditLog } from "@/lib/audit";

const createUserSchema = z.object({
  username: z.string().min(1).max(50).trim(),
  password: z.string().min(8).max(128),
  name: z.string().max(100).trim().optional(),
  role: roleEnum.default("core"),
});

export async function GET() {
  const result = await requireApiPermission("user.manage");
  if (!result.authorized) return result.response;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
      // issue #75 — jumlah izin khusus, untuk lencana di baris pengguna.
      _count: { select: { permissionOverrides: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    users.map(({ _count, ...user }) => ({ ...user, overrideCount: _count.permissionOverrides }))
  );
}

export async function POST(request: Request) {
  const result = await requireApiPermission("user.manage");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Check username uniqueness
  const existing = await prisma.user.findUnique({ where: { username: parsed.data.username } });
  if (existing) {
    return NextResponse.json({ error: "Username already exists" }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(parsed.data.password, 12);

  const user = await prisma.user.create({
    data: {
      username: parsed.data.username,
      password: hashedPassword,
      name: parsed.data.name,
      role: parsed.data.role,
      status: 1, // force password change on first login
    },
    select: { id: true, username: true, name: true, role: true, status: true },
  });

  // audit RBAC fase 3 — pemberian akun (dan perannya) kini terekam.
  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    role: result.session.user.role,
    action: "user.create",
    entity: "user",
    entityId: user.id,
    details: { username: user.username, role: user.role },
    request,
  });

  return NextResponse.json(user, { status: 201 });
}
