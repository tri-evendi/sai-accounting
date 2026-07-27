/**
 * Modul per kategori usaha (issue #99) — API bagian "Modul Usaha" di Pengaturan.
 *
 * GET → kategori usaha + himpunan modul yang aktif sekarang.
 * PUT → GANTI seluruh himpunan (bukan patch): payload adalah keadaan akhir yang
 *       diinginkan, divalidasi zod (bentuk) + `validateEnabledModules`
 *       (anti-lockout: modul inti tak bisa dimatikan), lalu dinormalkan —
 *       himpunan lengkap disimpan sebagai NULL, sehingga "kosong = semua aktif"
 *       tetap jujur dan modul yang ditambahkan ke kode belakangan ikut menyala.
 *
 * Penjaga `company_setting.manage`, bukan `authz.manage`: modul menjawab
 * "perusahaan ini bidangnya apa" — profil perusahaan, sekeluarga dengan
 * identitas pajak di route sebelah — bukan "siapa boleh apa". Menyalakan
 * kembali sebuah modul karena itu TIDAK memberi izin kepada siapa pun; ia hanya
 * membuat izin yang memang sudah dimiliki terjangkau lagi.
 *
 * Setiap penyimpanan menginvalidasi cache modul (perubahan terasa seketika di
 * proses ini, paling lama satu TTL di proses lain) dan diaudit beserta aktor +
 * perannya (pola #73). Tidak ada satu baris jurnal pun yang disentuh.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import {
  normalizeEnabledModules,
  parseEnabledModules,
  serializeEnabledModules,
  validateEnabledModules,
  type BusinessModule,
} from "@/lib/business-modules";
import { invalidateEnabledModules } from "@/lib/authz-effective";
import { businessModulesPayloadSchema } from "@/lib/validations/modules";
import { getCompanySettings } from "@/lib/opening-balance";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

async function currentState() {
  const settings = await getCompanySettings();
  return {
    businessCategory: settings?.businessCategory ?? null,
    modules: [...parseEnabledModules(settings?.enabledModules)],
  };
}

export async function GET() {
  const result = await requireApiPermission("company_setting.manage");
  if (!result.authorized) return result.response;

  return NextResponse.json(await currentState());
}

export async function PUT(request: Request) {
  const result = await requireApiPermission("company_setting.manage");
  if (!result.authorized) return result.response;

  const { dictionary, t } = await getRequestI18n();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("errors.invalidJson") }, { status: 400 });
  }

  const parsed = businessModulesPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }

  // Penjaga terakhir ada DI SINI, bukan di checkbox yang di-`disabled`: modul
  // inti memuat /permissions & /users, dan tanpa keduanya tak ada lagi yang bisa
  // memperbaiki konfigurasi yang telanjur salah.
  const errors = validateEnabledModules(parsed.data.modules);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });
  }

  const existing = await getCompanySettings();
  if (!existing) {
    // Belum ada baris perusahaan — wizard penyiapan yang membuatnya (dan di
    // sanalah modul pertama kali dipilih).
    return NextResponse.json(
      { error: t("errors.companyNotSetUp") },
      { status: 409 }
    );
  }

  const modules = normalizeEnabledModules(parsed.data.modules as BusinessModule[]);

  await prisma.companySetting.update({
    where: { id: existing.id },
    data: {
      enabledModules: serializeEnabledModules(modules),
      ...(parsed.data.businessCategory !== undefined
        ? { businessCategory: parsed.data.businessCategory }
        : {}),
    },
  });

  // Pembaca berikutnya (penjaga halaman/API mana pun) merakit ulang dari DB.
  invalidateEnabledModules();

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    role: result.session.user.role,
    action: "company_setting.modules.update",
    entity: "company_settings",
    entityId: existing.id,
    details: {
      businessCategory: parsed.data.businessCategory ?? existing.businessCategory ?? null,
      modules,
      // Apa yang BERUBAH — jejak yang menjawab "sejak kapan menu itu hilang?".
      before: [...parseEnabledModules(existing.enabledModules)],
    },
    request,
  });

  return NextResponse.json(await currentState());
}
