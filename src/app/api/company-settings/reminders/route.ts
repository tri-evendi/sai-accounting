/**
 * Pengingat jatuh tempo ke pelanggan — API kartu "Pengingat" di Pengaturan
 * (issue #467).
 *
 * GET  → keadaan sekarang (nyala/mati, titik yang aktif, kapan kirim-uji terakhir)
 * PUT  → setel nyala/mati + titik
 * POST → KIRIM-UJI ke alamat surel pengguna yang menekannya
 *
 * ══ KENAPA KIRIM-UJI ADA DI ROUTE YANG SAMA ═════════════════════════════════
 * Karena ia bagian dari MENYALAKAN, bukan fitur terpisah. Penjadwal menolak
 * mengirim ke pelanggan mana pun selama `reminderTestedAt` NULL, jadi urutan
 * yang sebenarnya adalah: nyalakan → kirim uji → baru pelanggan menerima.
 * Menaruhnya di route lain akan membuat urutan itu tampak opsional.
 *
 * Penjaga `company_setting.manage` — sekeluarga dengan PPN & modul usaha di
 * route sebelah: ini profil perusahaan, bukan "siapa boleh apa".
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getCompanyIdentity } from "@/lib/company-identity";
import { getLocale, getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { REMINDER_POINTS, serializeReminderPoints } from "@/lib/invoice-reminder";
import { sendReminderTest } from "@/lib/invoice-reminder-mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const settingsSchema = z.object({
  enabled: z.boolean(),
  points: z.array(z.enum(REMINDER_POINTS.map((p) => p.key) as [string, ...string[]])),
});

async function currentState() {
  const row = await prisma.companySetting.findFirst({
    orderBy: { id: "asc" },
    select: { reminderEnabled: true, reminderPoints: true, reminderTestedAt: true },
  });
  return {
    enabled: row?.reminderEnabled ?? false,
    /* Kolom kosong = SEMUA titik (pola `enabled_modules`). Layar menampilkan
       yang berlaku, bukan isi kolomnya apa adanya — kalau tidak, kartu yang
       belum pernah disimpan akan memperlihatkan nol centang padahal ketiganya
       yang akan berjalan. */
    points: (row?.reminderPoints?.trim()
      ? row.reminderPoints.split(",").map((p) => p.trim())
      : REMINDER_POINTS.map((p) => p.key)
    ).filter((p) => REMINDER_POINTS.some((rp) => rp.key === p)),
    testedAt: row?.reminderTestedAt ?? null,
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
  const { t, dictionary } = await getRequestI18n();

  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  await prisma.companySetting.updateMany({
    data: {
      reminderEnabled: parsed.data.enabled,
      reminderPoints: serializeReminderPoints(parsed.data.points),
    },
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    role: result.session.user.role,
    action: "company_setting.reminders.update",
    entity: "company_settings",
    details: {
      reminderEnabled: parsed.data.enabled,
      reminderPoints: serializeReminderPoints(parsed.data.points),
    },
    request,
  });

  return NextResponse.json(await currentState());
}

export async function POST(request: Request) {
  const result = await requireApiPermission("company_setting.manage");
  if (!result.authorized) return result.response;
  const { t } = await getRequestI18n();

  /* Alamatnya diambil dari SESI, tidak pernah dari badan permintaan: kirim-uji
     yang bisa dialamatkan ke mana saja adalah pengirim surel terbuka yang
     memakai nama domain perusahaan pengguna. */
  const to = result.session.user.email?.trim();
  if (!to) {
    return NextResponse.json({ error: t("invoiceReminder.errNoUserEmail") }, { status: 409 });
  }

  const company = await getCompanyIdentity();
  await sendReminderTest({
    to,
    companyName: company.name,
    locale: await getLocale(),
    today: new Date(),
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    role: result.session.user.role,
    action: "company_setting.reminders.test",
    entity: "company_settings",
    details: { reminderTest: to },
    request,
  });

  return NextResponse.json({ ok: true, recipient: to, ...(await currentState()) });
}
