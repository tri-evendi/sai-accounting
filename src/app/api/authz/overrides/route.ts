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
import { getEnabledModules, invalidateEffectiveMatrix } from "@/lib/authz-effective";
import { overridesPayloadSchema } from "@/lib/validations/authz";
import { getRoles } from "@/lib/roles";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

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
  const [overrides, roles, modules] = await Promise.all([
    prisma.rolePermissionOverride.findMany({
      select: { role: true, permission: true, allowed: true, updatedAt: true },
      orderBy: [{ role: "asc" }, { permission: "asc" }],
    }),
    getRoles(),
    getEnabledModules(),
  ]);
  return {
    baseline: PERMISSION_ROLES,
    overrides,
    effective: applyOverrides(overrides),
    protectedCells: PROTECTED_CELLS,
    // Kolom matriks = peran dari DB (termasuk peran kustom) — bukan enum kode.
    roles: roles.map((r) => ({ key: r.key, label: r.label })),
    /**
     * issue #99 — modul yang aktif. Halaman memakainya untuk MENYEMBUNYIKAN
     * baris izin yang modulnya mati (mencentangnya hanya menjanjikan akses ke
     * halaman yang memang tidak ada). Matriks & override-nya dikirim UTUH:
     * baris yang tersembunyi tetap tersimpan apa adanya, jadi menyalakan
     * modulnya kembali memunculkan persis pengaturan yang dulu.
     */
    enabledModules: [...modules],
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
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.invalidJson") }, { status: 400 });
  }

  const parsed = overridesPayloadSchema.safeParse(body);
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
  await invalidateEffectiveMatrix();

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
