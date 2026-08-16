/**
 * Pajak perusahaan (issue #368, temuan F-12) — API kartu "PPN" di Pengaturan.
 *
 * GET    → penanda PKP + seluruh baris tarif, terbaru lebih dulu.
 * PUT    → setel penanda PKP.
 * POST   → tambah/ubah tarif yang berlaku sejak sebuah tanggal.
 * DELETE → hapus satu baris tarif (`?id=`).
 *
 * ══ KENAPA INI ADA ═════════════════════════════════════════════════════════
 * Tarif PPN dulu konstanta kompilasi. Mengubahnya menuntut redeploy sepuluh
 * menit untuk satu angka yang berubah karena Peraturan Menteri, dan pelanggan
 * NON-PKP mendapat bawaan 11% yang salah sejak faktur pertamanya.
 *
 * ══ APA YANG TIDAK BISA DIUBAH DARI SINI ═══════════════════════════════════
 * Dokumen yang sudah tersimpan. Faktur membawa `tax_rate`-nya SENDIRI dan mesin
 * posting membaca kolom itu, jadi menambah tarif baru tidak menyentuh satu pun
 * angka yang sudah terbit di laporan. Yang diubah layar ini hanyalah BAWAAN
 * yang ditawarkan formulir berikutnya.
 *
 * Penjaga `company_setting.manage` — sekeluarga dengan identitas pajak dan modul
 * usaha di route sebelah, dan bukan `authz.manage`: ini profil perusahaan, bukan
 * "siapa boleh apa". Setiap perubahan diaudit beserta aktor + perannya.
 */
import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { companyPkpSchema, taxRateInputSchema } from "@/lib/validations/tax";
import {
  deleteTaxRate,
  listTaxRates,
  readCompanyTaxProfile,
  setCompanyPkp,
  upsertTaxRate,
} from "@/lib/tax-rates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function currentState() {
  const [profile, rates] = await Promise.all([readCompanyTaxProfile(), listTaxRates()]);
  return { isPkp: profile.isPkp, rates };
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

  const parsed = companyPkpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  const before = await readCompanyTaxProfile();
  const saved = await setCompanyPkp(parsed.data.isPkp);
  if (!saved) {
    // Belum ada baris perusahaan — wisaya penyiapan yang membuatnya, berikut
    // jawaban PKP-nya. Sama seperti route modul di sebelah.
    return NextResponse.json({ error: t("errors.companyNotSetUp") }, { status: 409 });
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    role: result.session.user.role,
    action: "company_setting.tax.pkp",
    entity: "company_settings",
    details: { before: before.isPkp, after: parsed.data.isPkp },
    request,
  });

  return NextResponse.json(await currentState());
}

export async function POST(request: Request) {
  const result = await requireApiPermission("company_setting.manage");
  if (!result.authorized) return result.response;

  const { dictionary, t } = await getRequestI18n();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("errors.invalidJson") }, { status: 400 });
  }

  const parsed = taxRateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  await upsertTaxRate(parsed.data);

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    role: result.session.user.role,
    action: "company_setting.tax.rate.upsert",
    entity: "tax_rates",
    details: {
      rate: parsed.data.rate,
      effectiveFrom: parsed.data.effectiveFrom,
      note: parsed.data.note ?? null,
    },
    request,
  });

  return NextResponse.json(await currentState());
}

export async function DELETE(request: Request) {
  const result = await requireApiPermission("company_setting.manage");
  if (!result.authorized) return result.response;

  const { t } = await getRequestI18n();
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: t("validation.invalidInput") }, { status: 400 });
  }

  /*
   * Baris TERAKHIR tidak boleh dihapus. Tabel yang kosong akan disemai ulang
   * `ensureTaxRates` pada pembacaan berikutnya — jadi menghapus baris terakhir
   * bukan "menghilangkan tarif" melainkan "diam-diam mengembalikannya ke 11%",
   * yang persis kebalikan dari maksud orang yang menekannya.
   */
  const rates = await listTaxRates();
  if (rates.length <= 1) {
    return NextResponse.json({ error: t("errors.taxRateLastRow") }, { status: 409 });
  }

  await deleteTaxRate(id);

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.name,
    role: result.session.user.role,
    action: "company_setting.tax.rate.delete",
    entity: "tax_rates",
    entityId: id,
    details: { removed: rates.find((r) => r.id === id) ?? null },
    request,
  });

  return NextResponse.json(await currentState());
}
