/**
 * Server surel milik tenant — API kartu "Surel Keluar" di `/platform`.
 *
 * GET  → keadaan sekarang (TANPA kata sandi — lihat `tenantMailView`)
 * PUT  → simpan
 * POST → UJI KIRIM ke alamat surel pengguna yang menekannya
 *
 * ══ KENAPA KATA SANDI TIDAK PERNAH IKUT KELUAR ══════════════════════════════
 * Yang dipulangkan GET adalah `hasPassword: boolean`, bukan nilainya. Sebuah
 * form yang menampilkan kembali kata sandi tersimpan berarti kredensial SMTP
 * pelanggan ada di dalam payload HTML setiap kali halamannya dibuka — dan
 * halaman itu dibuka juga oleh anggota tim yang berhak mengatur, bukan hanya
 * oleh yang memasangnya. PUT menerima `password` opsional: tidak dikirim =
 * jangan sentuh, string kosong = hapus.
 *
 * ══ KENAPA UJI KIRIM HANYA KE DIRI SENDIRI ══════════════════════════════════
 * Alamat tujuannya diambil dari SESI, tidak pernah dari badan permintaan.
 * Endpoint uji yang bisa dialamatkan ke mana saja adalah pengirim surel terbuka
 * yang memakai kredensial SMTP pelanggan — dan yang menanggung reputasi
 * domainnya adalah pelanggan itu.
 *
 * Penjaga `tenant.settings` — sekeluarga dengan profil tenant lain; ini
 * pengaturan AKUN, bukan pengaturan satu PT.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantApiPermission } from "@/lib/tenant-guard";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { sendMail } from "@/lib/mailer";
import {
  readTenantMail,
  recordTenantMailTest,
  resolveTenantMailConfig,
  saveTenantMail,
  tenantMailView,
} from "@/lib/tenant-mail-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const trimmedOrNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const settingsSchema = z
  .object({
    transport: z.enum(["file", "smtp"]),
    host: trimmedOrNull(191),
    port: z.number().int().min(1).max(65535).nullable().optional(),
    username: trimmedOrNull(191),
    fromAddress: trimmedOrNull(191),
    archiveAddress: trimmedOrNull(191),
    /** Tidak dikirim = jangan sentuh; "" = hapus. */
    password: z.string().max(191).optional(),
  })
  .refine((v) => v.transport !== "smtp" || Boolean(v.host), {
    /* Pengaturan setengah jadi bukan konfigurasi: `smtp` tanpa host akan
       ditolak `resolveTenantMailConfig` dan diam-diam jatuh ke jalur penyedia,
       sehingga penggunanya mengira sudah mengaturnya padahal belum. */
    path: ["host"],
    message: "tenantMail.hostRequired",
  });

export async function GET() {
  const result = await requireTenantApiPermission("tenant.settings");
  if (!result.authorized) return result.response;
  const row = await readTenantMail(result.tenant.tenantId);
  return NextResponse.json(tenantMailView(row));
}

export async function PUT(request: Request) {
  const result = await requireTenantApiPermission("tenant.settings");
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

  await saveTenantMail(result.tenant.tenantId, {
    transport: parsed.data.transport,
    host: parsed.data.host ?? null,
    port: parsed.data.port ?? null,
    username: parsed.data.username ?? null,
    fromAddress: parsed.data.fromAddress ?? null,
    archiveAddress: parsed.data.archiveAddress ?? null,
    password: parsed.data.password,
    updatedBy: result.session.user.id,
  });

  return NextResponse.json(tenantMailView(await readTenantMail(result.tenant.tenantId)));
}

export async function POST() {
  const result = await requireTenantApiPermission("tenant.settings");
  if (!result.authorized) return result.response;
  const { t } = await getRequestI18n();

  const to = result.session.user.email?.trim();
  if (!to) {
    return NextResponse.json({ error: t("tenantMail.errNoUserEmail") }, { status: 409 });
  }

  const config = await resolveTenantMailConfig(result.tenant.tenantId);
  if (!config) {
    return NextResponse.json({ error: t("tenantMail.errNotConfigured") }, { status: 409 });
  }

  /* Hasilnya DICATAT baik berhasil maupun gagal — termasuk pesan galat dari
     server SMTP-nya, yang hampir selalu menyebut sebabnya jauh lebih tepat
     daripada kalimat apa pun yang bisa kami karang ("bad credentials",
     "relay access denied", "certificate expired"). */
  try {
    const sent = await sendMail(
      {
        to,
        subject: t("tenantMail.testSubject"),
        text: t("tenantMail.testBody"),
      },
      config
    );
    await recordTenantMailTest(result.tenant.tenantId, {
      to,
      ok: true,
      message: sent.detail ?? "",
    });
    /* Tampilan tersimpan disebar DULU, lalu `transport` yang benar-benar
       dipakai menimpanya: yang tersimpan adalah niat, yang ini kenyataan —
       `smtp` di luar produksi tetap ditangkap ke berkas. */
    return NextResponse.json({
      ok: true,
      recipient: to,
      ...tenantMailView(await readTenantMail(result.tenant.tenantId)),
      sentVia: sent.transport,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordTenantMailTest(result.tenant.tenantId, { to, ok: false, message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
