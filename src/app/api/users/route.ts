import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { z } from "zod";
import { activeRoleKeys } from "@/lib/roles";
import { ROLES } from "@/lib/constants";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

// Peran kini DATA (tabel roles), jadi bentuknya string; keberadaan & keaktifan
// peran divalidasi terhadap DB setelah parse (bukan enum tetap).
const createUserSchema = z.object({
  username: z.string().min(1).max(50).trim(),
  password: z.string().min(8).max(128),
  name: z.string().max(100).trim().optional(),
  role: z.string().trim().min(1).max(20).default(ROLES.FINANCE_MANAGER),
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
      mustChangePassword: true,
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
    // ── Pola baku jawaban 400 (fase A; disalin ke seluruh route di fase B) ──
    // Skema membawa KUNCI kamus, bukan kalimat (pesan zod dipanggang saat modul
    // dimuat dan tidak bisa ikut berganti bahasa — lihat lib/i18n/validation.ts).
    // Route handler boleh membaca cookie bahasa persis seperti server component,
    // jadi DI SINILAH kunci itu kembali menjadi kalimat, dalam bahasa pengguna.
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  // Peran harus ada & aktif (peran dinamis) — validasi ke DB.
  if (!(await activeRoleKeys()).includes(parsed.data.role)) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.roleUnknownOrInactive") }, { status: 400 });
  }

  // Check username uniqueness
  const existing = await prisma.user.findUnique({ where: { username: parsed.data.username } });
  if (existing) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.usernameTaken") }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(parsed.data.password, 12);

  const user = await prisma.user.create({
    data: {
      username: parsed.data.username,
      password: hashedPassword,
      name: parsed.data.name,
      role: parsed.data.role,
      mustChangePassword: true, // akun baru selalu wajib ganti sandi saat pertama masuk
    },
    select: { id: true, username: true, name: true, role: true, mustChangePassword: true },
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
