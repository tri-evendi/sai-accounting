import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { findCompanyUser, removeCompanyUser, updateCompanyUser } from "@/lib/users-directory";
import { requireApiPermission } from "@/lib/auth-guard";
import { z } from "zod";
import { activeRoleKeys } from "@/lib/roles";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

// Peran kini DATA (tabel roles), jadi bentuknya string; keberadaan & keaktifan
// peran divalidasi terhadap DB setelah parse (bukan enum tetap) — sama seperti
// POST /api/users.
const updateUserSchema = z.object({
  name: z.string().max(100).trim().optional(),
  role: z.string().trim().min(1).max(20).optional(),
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
  if (parsed.data.role !== undefined && !(await activeRoleKeys()).includes(parsed.data.role)) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.roleUnknownOrInactive") }, { status: 400 });
  }

  // Hanya ANGGOTA perusahaan ini yang boleh diubah dari sini (issue #104):
  // orang dari PT lain tidak bisa disentuh hanya dengan menebak id di URL.
  const before = await findCompanyUser(parseInt(id));
  if (!before) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.userNotFound") }, { status: 404 });
  }

  const roleChanged = parsed.data.role !== undefined && parsed.data.role !== before.role;

  // `name` & kata sandi menyentuh IDENTITAS (berlaku di semua PT orang itu);
  // `role` hanya keanggotaannya DI SINI. Pencabutan sesi saat peran berganti
  // atau sandi di-reset tetap berlaku — lihat users-directory.
  const user = await updateCompanyUser(parseInt(id), {
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
    ...(parsed.data.password
      ? { passwordHash: await bcrypt.hash(parsed.data.password, 12) }
      : {}),
  });

  if (!user) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.userNotFound") }, { status: 404 });
  }

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
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.cannotDeleteSelf") }, { status: 400 });
  }

  try {
    // Yang dilepas adalah KEANGGOTAANNYA di perusahaan ini, bukan identitasnya
    // (issue #104): orang itu mungkin masih memegang PT lain, dan menghapus
    // akunnya dari layar Pengguna satu perusahaan akan mencabut aksesnya ke
    // perusahaan yang tidak ada hubungannya.
    const deleted = await removeCompanyUser(userId);
    if (!deleted) {
      const { t } = await getRequestI18n();
      return NextResponse.json({ error: t("errors.userNotFound") }, { status: 404 });
    }
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
      const { t } = await getRequestI18n();
      return NextResponse.json(
        { error: t("errors.userHasApprovalHistory"), code: "referenced" },
        { status: 409 }
      );
    }
    // Sudah terhapus / tidak ada
    if (code === "P2025") {
      const { t } = await getRequestI18n();
      return NextResponse.json({ error: t("errors.userNotFound") }, { status: 404 });
    }
    throw e;
  }
}
