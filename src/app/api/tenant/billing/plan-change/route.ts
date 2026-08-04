/**
 * Perpindahan paket ATAS PERMINTAAN PELANGGAN (swalayan).
 *
 * Penjaga tenant `tenant.billing` (owner — kontraktual, bukan peran di sebuah
 * PT). Sampai sekarang perpindahan paket hanya bisa dikerjakan operator; route
 * ini menambahkan jalur pelanggan TANPA membuat mesin kedua — pemasangan
 * paketnya tetap `changeTenantPlan` yang sama, ber-audit, dan aktornya ditandai
 * `self-service:` supaya jejaknya bisa membedakan siapa yang memutuskan.
 *
 * ══ TIGA HASIL, DAN MASING-MASING PUNYA ALASANNYA ══════════════════════════
 *
 *   blocked_over_quota   Kuota paket tujuan lebih kecil dari pemakaian NYATA.
 *                        DITOLAK — bukan "diizinkan dengan peringatan" seperti
 *                        di konsol operator, sebab di sana ada manusia yang
 *                        membaca peringatannya dan tahu buku mana yang boleh
 *                        ditutup. Di sini tidak ada.
 *   apply_immediate      Turun paket (atau naik paket yang selisihnya nol di
 *                        sisa hari): berpindah SEKETIKA, tanpa pengembalian
 *                        uang. Layar konfirmasi yang mengatakannya.
 *   invoice_required     Naik paket: TAGIHAN SELISIH prorata dibuat, dan
 *                        paketnya berpindah setelah tagihan itu LUNAS
 *                        (`platform_invoices.target_plan_id` → webhook).
 *
 * ══ IDEMPOTENSI ════════════════════════════════════════════════════════════
 * Nomor tagihannya DETERMINISTIK — `PUPG-S<langganan>-<paket>-<tanggal>` — dan
 * `number` UNIQUE. Menekan tombol dua kali karena itu menabrak constraint dan
 * mengembalikan tagihan YANG SAMA, bukan menagih dua kali. Ini pola yang sama
 * dengan `invoiceNumberFor` di penjadwal, dan alasannya sama persis.
 *
 * ⚠ Pemakaian dihitung dari BARIS NYATA di basis data kendali, bukan dari
 * `usage_counters` yang bisa tertinggal: angka yang dipakai untuk MENOLAK tidak
 * boleh datang dari penghitung yang boleh basi.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { controlDb } from "@/lib/control-db";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { changeTenantPlan } from "@/lib/operator/writes";
import { platformDb } from "@/lib/platform-db";
import { quotePlanChange } from "@/lib/plan-change";
import { platformInvoiceAmounts } from "@/lib/subscription-lifecycle";
import { requireTenantApiPermission } from "@/lib/tenant-guard";
import { invalidateTenantState } from "@/lib/tenant-state";

const planChangeSchema = z.object({
  planKey: z.string().min(1).max(30),
});

/** Jatuh tempo tagihan selisih. Sama dengan tagihan langganan biasa: pelanggan
 *  ditagih lalu diingatkan, bukan didebit otomatis. */
const DUE_DAYS = 7;

export async function POST(request: Request) {
  const auth = await requireTenantApiPermission("tenant.billing");
  if (!auth.authorized) return auth.response;
  const { t, dictionary } = await getRequestI18n();

  const body = await request.json().catch(() => null);
  const parsed = planChangeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  const tenantId = auth.tenant.tenantId;
  const now = new Date();

  const subscription = await platformDb.subscription.findFirst({
    where: { tenantId },
    orderBy: { id: "desc" },
    select: {
      id: true,
      price: true,
      currency: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      plan: { select: { key: true } },
    },
  });
  if (!subscription) {
    return NextResponse.json(
      { error: t("tenantSettings.noSubscription"), code: "no_subscription" },
      { status: 409 }
    );
  }

  const target = await platformDb.plan.findUnique({
    where: { key: parsed.data.planKey },
    select: {
      id: true,
      key: true,
      priceMonthly: true,
      currency: true,
      maxCompanies: true,
      maxUsers: true,
      isActive: true,
      isPublic: true,
      contactOnly: true,
    },
  });
  /* Paket yang sudah ditarik dari penjualan tidak bisa DITUJU — walau pelanggan
   * lain masih berjalan di atasnya. `isPublic` ikut: paket `internal` milik
   * penyedia wajib AKTIF (putaran adopsi yatim #152 membutuhkannya) dan karena
   * itu, tanpa syarat ini, bisa dituju siapa pun yang menebak kuncinya —
   * "Rp 0, 10 PT, 50 pengguna". */
  if (!target || !target.isActive || !target.isPublic) {
    return NextResponse.json(
      { error: t("platform.planChangeUnknownPlan"), code: "plan_not_found" },
      { status: 404 }
    );
  }

  /* ── Paket berharga RUNDINGAN tidak bisa lewat swalayan ──────────────────
   * Harganya tidak dipajang justru karena belum ada; yang tersimpan di kolom
   * harga adalah 0. Membiarkannya masuk ke `quotePlanChange` berarti prorata
   * dihitung dari nol: pelanggan menekan satu tombol dan naik ke paket
   * Enterprise TANPA membayar apa pun, dengan kuotanya ikut naik seketika.
   * Penjaga ini karena itu berdiri SEBELUM kutipan dihitung, bukan sesudahnya,
   * dan kartu "hubungi kami" di halaman harga hanyalah cerminan tampilannya —
   * bukan yang menegakkannya. */
  if (target.contactOnly) {
    return NextResponse.json(
      { error: t("platform.planChangeContactOnly"), code: "contact_only" },
      { status: 409 }
    );
  }

  const [companiesUsed, usersUsed] = await Promise.all([
    controlDb.company.count({ where: { tenantId, isActive: true } }),
    controlDb.user.count({ where: { tenantId } }),
  ]);

  const quote = quotePlanChange({
    currentPlanKey: subscription.plan?.key ?? "",
    currentPrice: Number(subscription.price),
    target: {
      key: target.key,
      priceMonthly: Number(target.priceMonthly),
      maxCompanies: target.maxCompanies,
      maxUsers: target.maxUsers,
    },
    periodStart: subscription.currentPeriodStart,
    periodEnd: subscription.currentPeriodEnd,
    now,
    usage: { companies: companiesUsed, users: usersUsed },
  });

  if (quote.outcome === "same_plan") {
    return NextResponse.json(
      { error: t("platform.planChangeSamePlan"), code: "same_plan" },
      { status: 409 }
    );
  }

  if (quote.outcome === "blocked_over_quota") {
    /* Angkanya IKUT dikembalikan: "kuota tidak cukup" tanpa menyebut berapa
     * yang terpakai membuat pelanggan menebak apa yang harus ia tutup. */
    return NextResponse.json(
      {
        error: t("platform.planChangeOverQuota"),
        code: "over_quota",
        companies: quote.companies,
        users: quote.users,
      },
      { status: 409 }
    );
  }

  if (quote.outcome === "apply_immediate") {
    const result = await changeTenantPlan(
      { platform: platformDb, control: controlDb },
      {
        tenantRef: { id: tenantId },
        planKey: target.key,
        actor: {
          operator: "self-service:plan-change",
          reason: "Turun/ganti paket swalayan tanpa tagihan selisih",
        },
      },
      now
    );
    if (result.outcome !== "changed") {
      return NextResponse.json(
        { error: t("platform.planChangeFailed"), code: result.outcome },
        { status: 409 }
      );
    }
    /* Kuota & status baru harus terasa seketika di penjaga — cache yang tidak
     * dibatalkan berarti pelanggan berpindah paket lalu tetap ditolak kuota
     * lamanya. (Cache-nya per-proses dan tidak berkunci tenant; membersihkan
     * seluruhnya adalah yang tersedia, dan biayanya hanya beberapa pembacaan
     * ulang.) */
    invalidateTenantState();
    return NextResponse.json({ applied: true, planKey: target.key });
  }

  /* ── invoice_required: tagihan selisih prorata ──────────────────────────── */
  const taxable = process.env.PLATFORM_PPN_DISABLED !== "true";
  const amounts = platformInvoiceAmounts(quote.chargeable, taxable);
  const number = `PUPG-S${subscription.id}-${target.id}-${now
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "")}`;

  const dueDate = new Date(now.getTime() + DUE_DAYS * 24 * 60 * 60 * 1000);

  try {
    const invoice = await platformDb.platformInvoice.create({
      data: {
        tenantId,
        subscriptionId: subscription.id,
        number,
        status: "issued",
        issueDate: now,
        dueDate,
        amount: amounts.amount,
        taxAmount: amounts.taxAmount,
        total: amounts.total,
        currency: target.currency,
        /* Niatnya di tagihan: lunas → paket berpindah (webhook). */
        targetPlanId: target.id,
      },
      select: { id: true, number: true, total: true, currency: true },
    });
    return NextResponse.json({
      invoice,
      chargeable: quote.chargeable,
      remainingDays: quote.remainingDays,
      periodDays: quote.periodDays,
    });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    /* Tombol ditekan dua kali: tagihan yang SAMA, bukan tagihan kedua. */
    const existing = await platformDb.platformInvoice.findUnique({
      where: { number },
      select: { id: true, number: true, total: true, currency: true },
    });
    return NextResponse.json({
      invoice: existing,
      chargeable: quote.chargeable,
      remainingDays: quote.remainingDays,
      periodDays: quote.periodDays,
      duplicate: true,
    });
  }
}
