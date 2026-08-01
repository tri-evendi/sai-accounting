import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import {
  createCompanyUser,
  findUserByEmail,
  findUserByUsername,
  listCompanyUsers,
} from "@/lib/users-directory";
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
  /** Pengenal login (issue #136) — wajib; unik global, dinormalkan huruf kecil. */
  email: z.email().max(255).trim(),
  password: z.string().min(8).max(128),
  name: z.string().max(100).trim().optional(),
  role: z.string().trim().min(1).max(20).default(ROLES.FINANCE_MANAGER),
});

export async function GET() {
  const result = await requireApiPermission("user.manage");
  if (!result.authorized) return result.response;

  // ANGGOTA perusahaan yang sedang dibuka — bukan seluruh pengguna pemasangan
  // (issue #104). Tanpa batas ini, layar Pengguna PT A akan memperlihatkan
  // seluruh karyawan PT B lengkap dengan peran mereka.
  const users = await listCompanyUsers();

  // issue #75 — jumlah izin khusus untuk lencana di baris pengguna. Dihitung
  // dari basis data PERUSAHAAN (di sanalah override hidup), lalu dipasangkan
  // per id: dua basis data berbeda tidak bisa di-JOIN dalam satu query.
  const overrideCounts = await prisma.userPermissionOverride.groupBy({
    by: ["userId"],
    _count: { _all: true },
    where: { userId: { in: users.map((u) => u.id) } },
  });
  const countByUser = new Map(overrideCounts.map((row) => [row.userId, row._count._all]));

  return NextResponse.json(
    users.map((user) => ({ ...user, overrideCount: countByUser.get(user.id) ?? 0 }))
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

  // Username unik PER TENANT sejak issue #136 (bukan lagi se-pemasangan):
  // satu orang = satu akun, berapa pun PT yang dipegangnya di tenant ini.
  // Kalau namanya sudah dipakai, yang benar bukan membuat akun kedua melainkan
  // menambahkan orang yang sudah ada itu sebagai anggota — pesannya menyebut
  // itu. Pencariannya sudah terkunci ke tenant sendiri, jadi id yang ikut
  // terjawab tidak pernah milik tenant lain (menutup separuh kebocoran §4.4).
  const existing = await findUserByUsername(parsed.data.username);
  if (existing) {
    const { t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("errors.usernameTaken"), code: "username_taken", userId: existing.id },
      { status: 409 }
    );
  }

  /*
   * Email unik GLOBAL (pengenal login). Dua dunia dibedakan dengan sengaja:
   * pemilik SETENANT boleh disebut id-nya (alur "tambahkan orang yang sudah
   * ada", sama seperti username); pemilik BEDA TENANT dijawab tanpa id dan
   * tanpa membenarkan apa pun selain "email tidak bisa dipakai" — kalimat yang
   * sama yang akan keluar untuk email cacat lain. Jawaban yang SEPENUHNYA
   * seragam baru mungkin ketika pembuatan akun berganti menjadi undangan
   * (#139, docs/MULTI-TENANT.md §7.3); route ini masih di belakang
   * `user.manage`, bukan permukaan publik.
   */
  const emailOwner = await findUserByEmail(parsed.data.email);
  if (emailOwner) {
    const { t } = await getRequestI18n();
    return NextResponse.json(
      emailOwner.sameTenant
        ? { error: t("errors.emailTaken"), code: "email_taken", userId: emailOwner.id }
        : { error: t("errors.emailTaken"), code: "email_taken" },
      { status: 409 }
    );
  }

  const hashedPassword = await bcrypt.hash(parsed.data.password, 12);

  const user = await createCompanyUser({
    username: parsed.data.username,
    email: parsed.data.email,
    passwordHash: hashedPassword,
    name: parsed.data.name,
    role: parsed.data.role,
  });

  // audit RBAC fase 3 — pemberian akun (dan perannya) kini terekam.
  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    role: result.session.user.role,
    action: "user.create",
    entity: "user",
    entityId: user.id,
    details: { username: user.username, email: user.email, role: user.role },
    request,
  });

  return NextResponse.json(user, { status: 201 });
}
