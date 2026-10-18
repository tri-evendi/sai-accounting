/**
 * LOGO PERUSAHAAN — `/api/t/{tenant}/{company}/company-logo`.
 *
 *   GET     semua anggota PT (`settings.view`): gambar logo aktif, atau 404.
 *   POST    pemilik PT (`company_setting.manage`): unggah logo baru (multipart, bidang `file`).
 *   DELETE  pemilik PT (`company_setting.manage`): hapus logo; dokumen kembali tanpa logo.
 *
 * Berlingkup jalur: penjaga menegakkan konteks perusahaan dari slug, jadi
 * `prisma` di `@/lib/company-logo` menunjuk buku PT itu. Validasi isi berkas
 * di `@sai/core/image-file` (PNG/JPEG, ≤ 512 KB, sisi ≥ 64 px).
 */
import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { COMPANY_LOGO_MIN_SIDE, readCompanyLogo, removeCompanyLogo, setCompanyLogo } from "@/lib/company-logo";
import { getRequestI18n } from "@sai/platform/i18n/server";
import { LOGO_MAX_BYTES, type LogoRejection } from "@sai/core/image-file";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import type { TenantScopedParams } from "@sai/core/tenant-routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<TenantScopedParams> };

/** Peta statis alasan → kunci kamus (penjaga kunci yatim membaca teks, bukan templat). */
const ALASAN: Record<LogoRejection, DictionaryKey> = {
  empty: "settings.companyLogo.err.empty",
  too_large: "settings.companyLogo.err.too_large",
  not_image: "settings.companyLogo.err.not_image",
  too_small: "settings.companyLogo.err.too_small",
  too_big_dimensions: "settings.companyLogo.err.too_big_dimensions",
};

export async function GET(request: Request, context: Context) {
  const result = await requireApiPermission("settings.view", await context.params);
  if (!result.authorized) return result.response;

  const logo = await readCompanyLogo();
  if (!logo) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

  const v = new URL(request.url).searchParams.get("v");
  const immutable = v !== null && v.length >= 16 && logo.meta.sha256.startsWith(v);
  return new Response(Buffer.from(logo.content), {
    headers: {
      "Content-Type": logo.meta.mimeType,
      // `private`: milik satu perusahaan, di balik sesi — tidak untuk cache bersama.
      "Cache-Control": immutable ? "private, max-age=31536000, immutable" : "private, max-age=60",
      ETag: `"${logo.meta.sha256.slice(0, 32)}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

export async function POST(request: Request, context: Context) {
  const result = await requireApiPermission("company_setting.manage", await context.params);
  if (!result.authorized) return result.response;
  const { t } = await getRequestI18n();

  // Tolak badan yang jelas kebesaran SEBELUM membacanya (cadangan untuk overhead multipart).
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > LOGO_MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: t(ALASAN.too_large) }, { status: 413 });
  }

  let bytes = new Uint8Array();
  try {
    const file = (await request.formData()).get("file");
    if (file instanceof File) bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: t(ALASAN.not_image) }, { status: 400 });
  }

  const userId = Number.parseInt(result.session.user.id, 10);
  const saved = await setCompanyLogo({ bytes, userId: Number.isFinite(userId) ? userId : null });
  if (saved.outcome !== "ok") {
    return NextResponse.json({ error: t(ALASAN[saved.reason], { min: COMPANY_LOGO_MIN_SIDE }) }, { status: 400 });
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    role: result.session.user.role,
    action: "company_setting.logo.update",
    entity: "company_settings",
    details: { ...saved.meta, bytes: bytes.length },
    request,
  });
  return NextResponse.json({ logo: { ...saved.meta, version: saved.meta.sha256.slice(0, 16) } });
}

export async function DELETE(request: Request, context: Context) {
  const result = await requireApiPermission("company_setting.manage", await context.params);
  if (!result.authorized) return result.response;

  const { deactivated } = await removeCompanyLogo();
  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    role: result.session.user.role,
    action: "company_setting.logo.remove",
    entity: "company_settings",
    details: { deactivated },
    request,
  });
  return NextResponse.json({ logo: null });
}
