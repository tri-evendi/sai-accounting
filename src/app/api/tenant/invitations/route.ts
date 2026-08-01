/**
 * Undangan staf (issue #139) — POST menerbitkan, GET daftar yang menunggu.
 *
 * ══ PENJAGANYA TINGKAT TENANT ═══════════════════════════════════════════════
 * Mengundang orang ke tenant adalah kewenangan TENANT (`tenant.member.invite`,
 * owner/admin — lib/tenant-authz.ts), bukan peran di salah satu PT. PT
 * TUJUANNYA tetap perusahaan yang sedang dibuka pengundang: undangan membawa
 * peran akuntansi untuk PT itu, jadi perusahaan aktif tetap wajib ada — tapi
 * ia dipakai sebagai KONTEKS (validasi peran, jejak audit), bukan sebagai
 * sumber izin.
 *
 * ══ JAWABAN SERAGAM — INTI PERBAIKANNYA ═════════════════════════════════════
 * POST menjawab IDENTIK apa pun keadaan emailnya (belum ada / sudah setenant /
 * milik tenant lain): "undangan sudah dikirim". Yang berbeda hanya isi
 * SURELNYA. Jawaban HTTP yang berbeda ADALAH kebocoran enumerasinya —
 * 409 «nama sudah dipakai» + userId yang lama persis lubang §4.4. Karena itu pula
 * pekerjaan per-email (cari akun, tulis baris, kirim surel) berjalan SETELAH
 * respons, supaya lamanya jawaban pun tidak berteriak.
 *
 * Yang boleh berbeda: validasi bentuk (400), kuota penuh (422), pembatas laju
 * (429) — semuanya diputuskan SEBELUM email dilihat, jadi tidak membocorkan
 * apa pun tentang alamat mana pun.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantApiPermission } from "@/lib/tenant-guard";
import { auth } from "@/lib/auth";
import { controlDb } from "@/lib/control-db";
import {
  issueInvitation,
  pendingInvitationsForCompany,
  tenantSeatCount,
} from "@/lib/invitation-store";
import { userQuotaExceeded } from "@/lib/invitations";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { runWithCompany } from "@/lib/company-context";
import { activeRoleKeys } from "@/lib/roles";
import { sendMail } from "@/lib/mailer";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

const inviteSchema = z.object({
  email: z.email().max(255).trim(),
  /** Peran DI PT yang sedang dibuka — divalidasi ke tabel `roles` PT itu. */
  role: z.string().trim().min(1).max(20),
});

/** Alamat aplikasi untuk tautan surel — sumber yang sama dengan Auth.js. */
function appOrigin(request: Request): string {
  return process.env.AUTH_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
}

/**
 * PT yang sedang dibuka pengundang, DIBUKTIKAN milik tenantnya. Sesi bisa
 * menunjuk perusahaan apa pun; baris registry-lah yang menjawab perusahaan itu
 * bertaut ke tenant siapa — tanpa bukti ini, admin tenant A yang memegang
 * companyId tenant B di sesinya bisa mengundang orang ke PT yang bukan miliknya.
 */
async function companyOfTenant(companyId: number | null | undefined, tenantId: number) {
  if (typeof companyId !== "number") return null;
  const company = await controlDb.company.findUnique({
    where: { id: companyId },
    select: { id: true, slug: true, name: true, databaseName: true, isActive: true, tenantId: true },
  });
  if (!company || !company.isActive || company.tenantId !== tenantId) return null;
  return company;
}

export async function GET() {
  const result = await requireTenantApiPermission("tenant.member.invite");
  if (!result.authorized) return result.response;

  const session = await auth();
  const company = await companyOfTenant(session?.user?.companyId, result.tenant.tenantId);
  if (!company) {
    const { t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("errors.selectCompanyFirst"), code: "company_required" },
      { status: 409 }
    );
  }

  return NextResponse.json(await pendingInvitationsForCompany(company.id));
}

export async function POST(request: Request) {
  const result = await requireTenantApiPermission("tenant.member.invite");
  if (!result.authorized) return result.response;
  const { t, dictionary } = await getRequestI18n();

  const session = await auth();
  const company = await companyOfTenant(session?.user?.companyId, result.tenant.tenantId);
  if (!company) {
    return NextResponse.json(
      { error: t("errors.selectCompanyFirst"), code: "company_required" },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(parsed.error, dictionary) },
      { status: 400 }
    );
  }

  const invitedByUserId = Number.parseInt(result.session.user.id, 10);

  /* Pembatas laju per PENGUNDANG — undangan mengirim surel atas nama kita. */
  const limit = checkRateLimit(`invite:user:${invitedByUserId}`, RATE_LIMITS.invitation);
  if (!limit.allowed) {
    return NextResponse.json({ error: t("invitations.tooMany") }, { status: 429 });
  }

  /* Peran harus ada & aktif DI PT TUJUAN (peran = data per perusahaan). */
  const roleKeys = await runWithCompany(
    { companyId: company.id, slug: company.slug, databaseName: company.databaseName },
    () => activeRoleKeys()
  );
  if (!roleKeys.includes(parsed.data.role)) {
    return NextResponse.json({ error: t("errors.roleUnknownOrInactive") }, { status: 400 });
  }

  /*
   * Kuota `max_users` — SEBELUM email dilihat sama sekali, dengan sengaja:
   * kalau kuota hanya berlaku untuk calon akun baru, "422" vs "200" langsung
   * membocorkan apakah alamat itu sudah punya akun (lihat lib/invitations.ts).
   */
  const seats = await tenantSeatCount(result.tenant.tenantId);
  if (userQuotaExceeded(seats)) {
    return NextResponse.json(
      { error: t("invitations.quotaExceeded"), code: "quota_exceeded" },
      { status: 422 }
    );
  }

  const email = parsed.data.email.toLowerCase();
  const origin = appOrigin(request);
  const inviterName = result.session.user.name ?? result.session.user.email ?? "";
  const tenantRole = result.tenant.role;

  /*
   * Kerja per-email berjalan SETELAH respons dan galatnya tidak mengubah
   * jawaban — keberadaan akun tidak boleh terbaca dari status, isi, maupun
   * lamanya respons (pola yang sama dengan forgot-password #136).
   */
  void (async () => {
    try {
      const issued = await issueInvitation({
        tenantId: result.tenant.tenantId,
        companyId: company.id,
        email,
        companyRole: parsed.data.role,
        invitedByUserId,
      });

      if (issued.outcome === "invite_new_user") {
        const link = `${origin}/accept-invitation?token=${issued.token}`;
        await sendMail({
          to: email,
          subject: `Undangan bergabung ke ${company.name} — SAI Accounting`,
          text:
            `Halo,\n\n` +
            `${inviterName} mengundang Anda bergabung ke ${company.name} di SAI Accounting.\n` +
            "Buka tautan berikut untuk MENENTUKAN KATA SANDI ANDA SENDIRI — tidak ada\n" +
            "kata sandi sementara, tidak ada yang perlu dikirim lewat pesan:\n\n" +
            `  ${link}\n\n` +
            "Tautan berlaku 7 hari dan hanya bisa dipakai sekali.\n" +
            "Tidak merasa diundang? Abaikan surel ini.\n\n" +
            "— SAI Accounting",
        });
      } else if (issued.outcome === "add_existing_member") {
        /* Orang setenant: SUDAH ditambahkan (addExistingUserToCompany) —
         * surelnya hanya kabar + pintu masuk, tanpa akun baru. */
        await sendMail({
          to: email,
          subject: `Anda ditambahkan ke ${company.name} — SAI Accounting`,
          text:
            `Halo,\n\n` +
            `${inviterName} menambahkan Anda ke ${company.name}. Akun Anda yang sudah\n` +
            "ada kini mencakup perusahaan itu — masuk seperti biasa, lalu pilih\n" +
            "perusahaannya:\n\n" +
            `  ${origin}/select-company\n\n` +
            "— SAI Accounting",
        });
      } else {
        /*
         * Lintas-tenant: DITOLAK (user milik tepat satu tenant, §2). Yang
         * diberi tahu adalah PEMILIK ALAMATNYA — orang yang memang tahu
         * akunnya sendiri — bukan pengundangnya. Jawaban HTTP di atas tetap
         * "undangan sudah dikirim".
         */
        await sendMail({
          to: email,
          subject: "Undangan tidak dapat diproses — SAI Accounting",
          text:
            "Halo,\n\n" +
            "Seseorang mencoba mengundang alamat ini ke sebuah perusahaan di SAI\n" +
            "Accounting, tetapi alamat ini sudah terpakai pada langganan (tenant)\n" +
            "yang berbeda — satu akun hanya bisa hidup di satu langganan.\n\n" +
            "Bila Anda memang ingin bergabung, minta pengundang memakai alamat\n" +
            "email Anda yang lain.\n\n" +
            "— SAI Accounting",
        });
      }

      /* Jejak audit di PT tujuan — hasil sebenarnya dicatat DI DALAM (audit
       * memang boleh tahu); ke luar jawabannya tetap seragam. */
      await runWithCompany(
        { companyId: company.id, slug: company.slug, databaseName: company.databaseName },
        () =>
          writeAuditLog({
            userId: result.session.user.id,
            username: inviterName,
            role: tenantRole,
            action: "user.invite",
            entity: "invitation",
            details: { email, role: parsed.data.role, outcome: issued.outcome },
            request,
          })
      );
    } catch (error) {
      console.error("[invitations] gagal menerbitkan/mengirim undangan:", error);
    }
  })();

  return NextResponse.json({ ok: true, message: t("invitations.sent") });
}
