/**
 * Setup wizard + Saldo Awal API (issue #20).
 *
 * GET  — everything the wizard needs in one call: whether setup is already done
 *        (and, if so, a read-only summary), plus the pickers (cash/bank accounts,
 *        customers, suppliers) and defaults.
 * POST — run the wizard once: post the balanced opening journal and mark the
 *        company set up. `setup.manage` only — it seeds the entire ledger.
 *
 * The opening journal is posted through the normal ledger primitive, so
 * `assertBalanced` and the period lock (#13) apply. Run-once is enforced
 * server-side in `applyOpeningBalances`; a second POST is a 409, not a duplicate.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { seedCoaForModules } from "@/lib/coa-seeding";
import { bookActivity, seedSampleBook, type SampleBookResult } from "@/lib/demo-seed";
import { setupSchema } from "@/lib/validations/setup";
import { handlePostingError } from "@/lib/api-errors";
import { writeAuditLog } from "@/lib/audit";
import {
  applyOpeningBalances,
  getCompanySettings,
  OpeningBalanceError,
  type OpeningBalancesInput,
} from "@/lib/opening-balance";
import { CURRENCIES } from "@/lib/constants";
import { getCompanyIdentity } from "@/lib/company-identity";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import {
  BUSINESS_MODULES,
  normalizeEnabledModules,
  serializeEnabledModules,
  validateEnabledModules,
  type BusinessModule,
} from "@/lib/business-modules";
import { invalidateEnabledModules } from "@/lib/authz-effective";

export async function GET() {
  const result = await requireApiPermission("setup.manage");
  if (!result.authorized) return result.response;

  const settings = await getCompanySettings();

  const [coaCount, cashAccounts, customers, suppliers] = await Promise.all([
    prisma.account.count({ where: { isActive: true } }),
    prisma.account.findMany({
      where: { type: "cash_bank", isActive: true },
      select: { id: true, code: true, name: true, currency: true },
      orderBy: { code: "asc" },
    }),
    prisma.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // Identitas perusahaan AKTIF (setting → nama registry PT ini), bukan
  // konstanta pemasang pertama — lihat catatan di halaman wizard.
  const identity = await getCompanyIdentity();

  // On a completed setup, hand back the opening journal for the read-only summary.
  let openingJournal = null;
  if (settings?.isSetup && settings.openingJournalId) {
    openingJournal = await prisma.journal.findUnique({
      where: { id: settings.openingJournalId },
      include: { lines: { include: { account: true } } },
    });
  }

  return NextResponse.json({
    isSetup: !!settings?.isSetup,
    settings,
    openingJournal,
    defaults: {
      name: settings?.name ?? identity.name,
      address: settings?.address ?? identity.address,
      baseCurrency: settings?.baseCurrency ?? "IDR",
    },
    currencies: CURRENCIES,
    coaCount,
    cashAccounts,
    customers,
    suppliers,
  });
}

export async function POST(request: Request) {
  const result = await requireApiPermission("setup.manage");
  if (!result.authorized) return result.response;

  const body = await request.json();
  const parsed = setupSchema.safeParse(body);
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

  const { company, cash, receivables, payables, inventory } = parsed.data;

  /*
   * Modul per kategori usaha (issue #99). Wizard boleh menyertakan himpunan
   * modul; penjaga terakhirnya tetap di server — modul inti tidak bisa dimatikan
   * bahkan pada permintaan pertama seumur pemasangan, kalau tidak wizard yang
   * dipanggil langsung bisa menutup /permissions & /users sejak menit nol.
   * Tidak menyebut modul sama sekali = kolomnya NULL = semua modul aktif.
   */
  if (company.modules) {
    const moduleErrors = validateEnabledModules(company.modules);
    if (moduleErrors.length > 0) {
      return NextResponse.json(
        { error: moduleErrors.join(" "), errors: moduleErrors },
        { status: 400 }
      );
    }
  }
  /*
   * Dua bentuk dari satu pilihan: himpunan modul untuk menyemai bagan akun,
   * dan bentuk terserialisasi untuk disimpan. `null` berarti "semua aktif"
   * (konvensi kolom `enabled_modules`), jadi penyemaiannya pun semua.
   */
  const moduleSet = company.modules
    ? normalizeEnabledModules(company.modules as BusinessModule[])
    : [...BUSINESS_MODULES];
  const enabledModules = company.modules ? serializeEnabledModules(moduleSet) : null;

  // Partner names for the AR/AP line memos come from the DB, not the client.
  // Nama barang untuk gerakan stok pembuka (#379) mengikuti aturan yang sama:
  // apa pun yang muncul di buku ditulis dari baris yang benar-benar ada, bukan
  // dari teks kiriman peramban.
  const [customers, suppliers, items] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, name: true } }),
    prisma.supplier.findMany({ select: { id: true, name: true } }),
    prisma.item.findMany({ select: { id: true, name: true } }),
  ]);
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const itemName = new Map(items.map((i) => [i.id, i.name]));

  for (const r of receivables) {
    if (!customerName.has(r.partnerId)) {
      const { t } = await getRequestI18n();
      return NextResponse.json(
        { error: t("errors.setupCustomerNotFound", { id: r.partnerId }) },
        { status: 400 }
      );
    }
  }
  for (const p of payables) {
    if (!supplierName.has(p.partnerId)) {
      const { t } = await getRequestI18n();
      return NextResponse.json(
        { error: t("errors.setupSupplierNotFound", { id: p.partnerId }) },
        { status: 400 }
      );
    }
  }

  /* Barang yang tidak ada ditolak SEBELUM transaksi dibuka — sebuah gerakan
     stok pembuka yang gagal di tengah akan meninggalkan jurnal pembuka yang
     sudah terbit tanpa buku pembantunya, yaitu persis keadaan yang #379
     diperbaiki. */
  for (const row of inventory) {
    if (!itemName.has(row.itemId)) {
      const { t } = await getRequestI18n();
      return NextResponse.json(
        { error: t("errors.setupItemNotFound", { id: row.itemId }) },
        { status: 400 }
      );
    }
  }

  const input: OpeningBalancesInput = {
    company: {
      name: company.name,
      address: company.address ?? null,
      baseCurrency: company.baseCurrency,
      fiscalYearStart: new Date(company.fiscalYearStart),
      npwp: company.npwp ?? null,
      taxName: company.taxName ?? null,
      taxAddress: company.taxAddress ?? null,
      businessCategory: company.businessCategory ?? null,
      enabledModules,
    },
    cash: cash.map((c) => ({
      accountId: c.accountId,
      currency: c.currency,
      amount: c.amount,
      rate: c.rate,
    })),
    receivables: receivables.map((r) => ({
      partnerId: r.partnerId,
      partnerName: customerName.get(r.partnerId)!,
      currency: r.currency,
      amount: r.amount,
      rate: r.rate,
    })),
    payables: payables.map((p) => ({
      partnerId: p.partnerId,
      partnerName: supplierName.get(p.partnerId)!,
      currency: p.currency,
      amount: p.amount,
      rate: p.rate,
    })),
    inventory: inventory.map((row) => ({
      itemId: row.itemId,
      itemName: itemName.get(row.itemId)!,
      quantity: row.quantity,
      unitCost: row.unitCost,
    })),
  };

  try {
    /*
     * BAGAN AKUN DISEMAI DI SINI, sebelum saldo awal (issue #99/#104).
     *
     * Urutannya tidak bisa dibalik: saldo awal memposting jurnal, dan jurnal
     * menuntut akun beserta slot mapping-nya sudah ada. Sebelum ini penyemaian
     * hanya ada sebagai perintah baris perintah, sehingga perusahaan yang
     * dibuat lewat halaman "Tambah Perusahaan" tiba di wizard tanpa satu akun
     * pun — dan langkah saldo awal berhenti tanpa bisa dijelaskan penggunanya.
     *
     * Yang disemai MENGIKUTI MODUL yang dipilih di wizard: perusahaan jasa
     * tidak lagi mendapat akun persediaan dan HPP yang selamanya nol. Sifatnya
     * idempoten — akun yang kodenya sudah ada tidak disentuh sama sekali, jadi
     * pemasangan lama yang bagan akunnya sudah disesuaikan tidak berubah.
     */
    const seeded = await seedCoaForModules(prisma, moduleSet);

    const applied = await applyOpeningBalances(input);

    /*
     * ── BUKU BARU TIDAK LAGI LAHIR KOSONG (lanjutan issue #355) ─────────────
     *
     * Temuan audit yang melahirkan #355 berbunyi: perusahaan baru punya bagan
     * akun dan NOL transaksi, jadi setiap laporan berbunyi "Rp 0" — dan
     * pengguna awam akuntansi tidak bisa membedakan laporan yang BEKERJA dari
     * laporan yang RUSAK, sebab keduanya terlihat persis sama di hari pertama.
     * #355 menjawabnya dengan perusahaan CONTOH terpisah; pemilik memutuskan
     * (14 Agustus 2026) buku setiap pengguna baru ikut diisi.
     *
     * ── DI SINI, BUKAN DI `provisionCompany` ───────────────────────────────
     * Penyediaan hanya membuat basis data + skema: pada saat itu belum ada satu
     * akun pun, apalagi pemetaannya, jadi tidak ada yang bisa diposting. Momen
     * paling awal yang mungkin adalah SETELAH baris di atas — bagan akun sudah
     * disemai, pemetaan sudah ada, saldo awal sudah terposting.
     *
     * ── `is_demo` TETAP FALSE, DAN ITU BUKAN KELALAIAN ─────────────────────
     * Bendera itu menyalakan gerbang tulis di kedua penjaga (`page-auth`,
     * `auth-guard`). Menyalakannya di sini akan membuat buku milik pelanggan
     * sendiri MENOLAK setiap tulisan — perusahaan yang baru saja mereka siapkan
     * seketika jadi hanya-baca. Yang menandai isinya di sini hanyalah awalan
     * `[CONTOH]` pada setiap baris, dan itu memang disengaja: bukunya milik
     * mereka, boleh ditulisi, dan barisnya boleh dihapus.
     *
     * ── KEGAGALANNYA TIDAK PERNAH MENJATUHKAN PENYIAPAN ────────────────────
     * `try` sendiri, sengaja terpisah dari `try` besar di luar. Penyiapan yang
     * berhasil lalu dilaporkan gagal hanya karena data HIASAN tidak jadi ditulis
     * adalah pertukaran yang salah arah: perusahaannya sudah tersiapkan, saldo
     * awalnya sudah terposting, dan tak satu pun dari itu boleh dibatalkan oleh
     * contoh yang tidak esensial.
     */
    let sample: SampleBookResult | null = null;
    try {
      /* Buku yang entah bagaimana sudah berisi transaksi tidak pernah disentuh —
         pagar yang sama dengan skrip CLI, hitungan yang sama persis. */
      if ((await bookActivity()).total === 0) {
        sample = await seedSampleBook({ today: new Date() });
      }
    } catch (error) {
      console.error("[setup] data contoh tidak jadi diisi:", error);
    }

    // Sebelum ini pemuat modul mungkin sempat mengingat "belum ada baris
    // perusahaan" (= semua modul aktif). Pilihan wizard harus berlaku pada
    // permintaan berikutnya, bukan setelah satu TTL.
    await invalidateEnabledModules();

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.name,
      action: "setup.create",
      entity: "company_settings",
      entityId: applied.settingId,
      details: {
        coaCreated: seeded.created,
        coaExisting: seeded.existing,
        journalNumber: applied.journalNumber,
        equityPlug: applied.equityPlug,
        fiscalYearStart: company.fiscalYearStart,
        businessCategory: company.businessCategory ?? null,
        // NULL di sini berarti "semua modul aktif" — jejaknya sengaja jujur.
        enabledModules,
        /* Data contoh masuk ke jejak audit: seseorang yang kelak bertanya
           "faktur INV-CONTOH-001 ini dari mana" harus bisa menemukan
           jawabannya, bukan menyimpulkan bukunya pernah dibobol. */
        sampleData: sample,
      },
      request,
    });

    return NextResponse.json({ ok: true, ...applied, sampleData: sample }, { status: 201 });
  } catch (e) {
    // Run-once conflict: the wizard has already been completed. 409, not 422 —
    // the payload is fine, the operation is simply no longer available.
    if (e instanceof OpeningBalanceError) {
      return NextResponse.json({ error: e.message, code: "already_setup" }, { status: 409 });
    }
    // Missing mapping, unbalanced, closed period, … → 422 with the not-saved notice.
    return handlePostingError(e);
  }
}
