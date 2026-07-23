import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { PERMISSION_ROLES } from "@/lib/authz";
import {
  PROTECTED_CELLS,
  applyOverrides,
  normalizeOverrides,
  validateOverrides,
} from "@/lib/authz-overrides";
import { invalidateEffectiveMatrix } from "@/lib/authz-effective";
import { overridesPayloadSchema } from "@/lib/validations/authz";
import { writeAuditLog } from "@/lib/audit";

/**
 * Konfigurasi matriks izin dari UI (issue #73) — API halaman /permissions.
 *
 * GET  → bawaan + override tersimpan + matriks efektif + sel terlindung.
 * PUT  → GANTI seluruh set override (bukan patch): payload adalah keadaan
 *        akhir yang diinginkan, divalidasi zod (bentuk) + `validateOverrides`
 *        (anti-lockout & delete ⊆ write ⊆ read pada matriks EFEKTIF), lalu
 *        dinormalkan (baris yang sama dengan bawaan dibuang — tabel kosong =
 *        persis bawaan). Daftar kosong = "Reset ke bawaan".
 *
 * Setiap penyimpanan menginvalidasi cache matriks efektif dan diaudit
 * beserta aktor + perannya (pola fase 3); yang dicatat hanya sel izin —
 * tidak pernah ada rahasia.
 */

async function currentState() {
  const overrides = await prisma.rolePermissionOverride.findMany({
    select: { role: true, permission: true, allowed: true, updatedAt: true },
    orderBy: [{ role: "asc" }, { permission: "asc" }],
  });
  return {
    baseline: PERMISSION_ROLES,
    overrides,
    effective: applyOverrides(overrides),
    protectedCells: PROTECTED_CELLS,
  };
}

export async function GET() {
  const result = await requireApiPermission("authz.manage");
  if (!result.authorized) return result.response;

  return NextResponse.json(await currentState());
}

export async function PUT(request: Request) {
  const result = await requireApiPermission("authz.manage");
  if (!result.authorized) return result.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload bukan JSON yang sah." }, { status: 400 });
  }

  const parsed = overridesPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Isian tidak sah.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const errors = validateOverrides(parsed.data.overrides);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });
  }

  // Baris yang tidak menyimpang dari bawaan tidak disimpan — "tabel kosong =
  // bawaan" tetap jujur, dan indikator "diubah" di UI selalu berarti sungguhan.
  const rows = normalizeOverrides(parsed.data.overrides);

  await prisma.$transaction(async (tx) => {
    await tx.rolePermissionOverride.deleteMany({});
    if (rows.length > 0) {
      await tx.rolePermissionOverride.createMany({ data: rows });
    }
  });

  // Pembaca berikutnya (penjaga halaman/API mana pun) merakit ulang dari DB.
  invalidateEffectiveMatrix();

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    role: result.session.user.role,
    action: rows.length === 0 ? "authz.override.reset" : "authz.override.update",
    entity: "role_permission_override",
    details: { count: rows.length, overrides: rows },
    request,
  });

  return NextResponse.json(await currentState());
}
