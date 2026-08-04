/**
 * Menerima undangan (issue #139) — PUBLIK, seperti reset-password: penerimanya
 * jelas belum punya sesi. Kredensialnya token sekali-pakai ter-hash dari surel
 * (dilepas proxy lewat `/api/auth/*`; pengecualian beralasan di
 * tests/authz-coverage.test.ts).
 *
 * GET  ?token=…  → isi undangan untuk PEMEGANG TOKEN (nama PT, email, peran) —
 *                  halaman penerimaan menampilkannya. Memegang tautan =
 *                  menerima surelnya, jadi tidak ada yang bocor ke pihak lain;
 *                  semua kegagalan token dijawab SATU bentuk yang sama.
 * POST {token, name?, password}
 *                → buat akun: penerima MENENTUKAN KATA SANDINYA SENDIRI —
 *                  inilah yang mengubur alur "admin mengetik kata sandi lalu
 *                  mengirimnya lewat WhatsApp". User + Membership +
 *                  TenantMembership lahir satu transaksi (invitation-store).
 *                  Username TIDAK ditanya (#159 temuan 4): email sudah jadi
 *                  pengenal (desain #139 §4.3), jadi username diturunkan dari
 *                  email undangan — tabrakan per tenant diselesaikan
 *                  deterministik di invitation-store.
 */
import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { z } from "zod";

import { acceptInvitation, invitationInfoByToken } from "@/lib/invitation-store";
import {
  PERSISTENT_RATE_LIMITS,
  checkPersistentRateLimit,
} from "@/lib/rate-limit-persistent";
import { controlDb } from "@/lib/control-db";
import { runWithCompany } from "@/lib/company-context";
import { tenantPath } from "@/lib/tenant-routes";
import { writeAuditLog } from "@/lib/audit";
import { writeTenantAuditLog } from "@/lib/tenant-audit";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

/* `username` sengaja TIDAK ada di sini (#159 temuan 4) — klien lama yang
 * masih mengirimkannya tetap lolos: kunci tak dikenal dibuang zod. */
const acceptSchema = z.object({
  token: z.string().min(1).max(128),
  name: z.string().max(100).trim().optional(),
  password: z.string().min(8).max(128),
});

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";

  const limit = await checkPersistentRateLimit(
    `invite-info:ip:${clientIp(request)}`,
    PERSISTENT_RATE_LIMITS.invitationAcceptIp
  );
  if (!limit.allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const info = token ? await invitationInfoByToken(token) : null;
  /* Tak dikenal / kedaluwarsa / terpakai — SATU jawaban: membedakannya memberi
   * penebak token informasi gratis tentang token mana yang pernah hidup. */
  if (!info) return NextResponse.json({ ok: false });

  return NextResponse.json({
    ok: true,
    invitation: {
      email: info.email,
      companyName: info.companyName,
      role: info.companyRole,
      expiresAt: info.expiresAt,
    },
  });
}

export async function POST(request: Request) {
  const { t, dictionary } = await getRequestI18n();

  const limit = await checkPersistentRateLimit(
    `invite-accept:ip:${clientIp(request)}`,
    PERSISTENT_RATE_LIMITS.invitationAcceptIp
  );
  if (!limit.allowed) {
    return NextResponse.json({ error: t("invitations.tooMany") }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const result = await acceptInvitation(parsed.data.token, {
    name: parsed.data.name,
    passwordHash,
  });

  switch (result.status) {
    case "accepted":
      break;
    case "not_found":
    case "used":
    case "expired":
      /* Ketiganya SATU kalimat — sama seperti reset-password. */
      return NextResponse.json(
        { error: t("invitations.invalidToken"), code: "invalid_token" },
        { status: 400 }
      );
    case "email_taken":
      /* Di antara undangan dan penerimaan, alamatnya telanjur dipakai akun
       * lain. Pemegang token adalah pemilik alamatnya sendiri — tidak ada
       * enumerasi di sini. */
      return NextResponse.json(
        { error: t("errors.emailTaken"), code: "email_taken" },
        { status: 409 }
      );
    case "quota_exceeded":
      return NextResponse.json(
        { error: t("invitations.quotaExceededAccept"), code: "quota_exceeded" },
        { status: 422 }
      );
  }

  /* Jejak audit di PT tempat akunnya lahir. Kegagalan menulis jejak tidak
   * membatalkan akun yang SUDAH sah dibuat — dicatat ke log server saja. */
  /* Dibaca DI LUAR blok jejak audit: jalurnya ikut ke dalam jawaban, dan
   * kegagalan menulis jejak tidak boleh menghilangkan tujuan yang sudah pasti
   * diketahui. */
  const company = await controlDb.company.findUnique({
    where: { id: result.companyId },
    select: {
      id: true,
      slug: true,
      databaseName: true,
      tenant: { select: { id: true, slug: true } },
    },
  });

  try {
    if (company?.tenant) {
      // Peristiwa TENANT (issue #142): anggota baru bergabung ke tenant.
      await writeTenantAuditLog({
        tenantId: company.tenant.id,
        tenantSlug: company.tenant.slug,
        userId: String(result.userId),
        username: result.username,
        action: "tenant.invitation.accept",
        details: { email: result.email, companySlug: company.slug, role: result.companyRole },
        request,
      });
    }
    if (company) {
      await runWithCompany(
        { companyId: company.id, slug: company.slug, databaseName: company.databaseName },
        () =>
          writeAuditLog({
            userId: String(result.userId),
            username: result.username,
            role: result.companyRole,
            action: "user.invite_accepted",
            entity: "user",
            entityId: result.userId,
            details: { email: result.email, role: result.companyRole },
            request,
          })
      );
    }
  } catch (error) {
    console.error("[accept-invitation] gagal menulis jejak audit:", error);
  }

  /*
   * ══ KE MANA ORANG INI SEHARUSNYA PERGI ═══════════════════════════════════
   * Ia baru saja menerima undangan ke SATU perusahaan. Sampai sekarang layar
   * "berhasil" hanya menautkannya ke /login telanjang — dan sesudah masuk ia
   * mendarat di /platform: panel AKUN, berisi langganan dan daftar PT yang
   * bukan urusannya, untuk akun yang bukan miliknya. Tiga layar sesudah
   * menerima undangan, dan yang di tengah tidak menjawab satu pun pertanyaan
   * yang ia bawa.
   *
   * Tujuannya sudah pasti diketahui di sini, jadi ia diikutkan sebagai
   * `callbackUrl`: sesudah masuk, `resolvePostLoginPath` menghormati jalur
   * relatif dan mengantarnya LANGSUNG ke buku perusahaan yang mengundangnya.
   * Bukan pintasan otentikasi — ia tetap harus masuk; yang dihapus hanyalah
   * persinggahan yang tidak ada gunanya baginya.
   */
  const next =
    company?.tenant && company.slug
      ? tenantPath(company.tenant.slug, company.slug, "/dashboard")
      : null;

  return NextResponse.json({ ok: true, next }, { status: 201 });
}
