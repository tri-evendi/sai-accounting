import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateStockTotals, summarizeInventory } from "@/lib/inventory";
import { stockUpdateSchema, itemSchema, itemActiveSchema } from "@/lib/validations/inventory";
import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { postForSource } from "@/lib/posting";
import { MAPPING_KEYS, resolveAccountId } from "@/lib/posting/mapping";
import { round2 } from "@/lib/posting/rules";
import { BASE_CURRENCY } from "@/lib/validations/fx";
import { handlePostingError } from "@/lib/api-errors";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { PROCESS_SHRINKAGE_NOTE } from "@/lib/constants";

/**
 * Ringkasan stok per barang. `?active=1` membuang barang yang dinonaktifkan —
 * dipakai PEMILIH di formulir pergerakan stok, supaya barang yang sudah tidak
 * dipakai lagi tak bisa dipilih untuk gerakan BARU.
 *
 * Tanpa parameter itu jawabannya tetap SEMUA barang, termasuk yang nonaktif.
 * Sengaja: laporan stok harus menyebut setiap barang yang masih menyimpan
 * saldo. Menonaktifkan barang berarti "jangan tawarkan lagi", bukan "anggap
 * stoknya nol" — menyembunyikannya dari laporan justru akan menghilangkan
 * persediaan yang secara fisik masih ada di gudang.
 */
export async function GET(request: Request) {
  const result = await requireApiPermission("inventory.read"); // all roles can view inventory
  if (!result.authorized) return result.response;

  const activeOnly = new URL(request.url).searchParams.get("active") === "1";

  const items = await prisma.item.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    // Urutan yang sama dengan pemilih yang dirender server (nama, A→Z) —
    // tanpa orderBy, urutannya kebetulan urutan sisip dan bisa berbeda.
    orderBy: { name: "asc" },
    include: {
      // Empat kolom yang benar-benar dipakai ringkasan & PDF — bukan seluruh
      // baris gerakan (issue #104).
      stockMovements: {
        select: { quantity: true, type: true, date: true, unitCost: true },
        orderBy: { date: "desc" },
      },
    },
  });

  /*
   * Ringkasan LENGKAP per barang — termasuk biaya rata-rata & nilai persediaan.
   *
   * Dulu route ini hanya mengembalikan total masuk/keluar, sehingga ekspor PDF
   * stok harus disuapi dari halaman yang sudah memuat seluruh gerakan lebih
   * dulu. Sejak ekspor mengambil datanya sendiri saat ditekan (issue #104),
   * route inilah sumbernya, jadi ia harus membawa kolom yang sama dengan yang
   * dicetak. Perhitungannya memakai `summarizeInventoryItem` — fungsi yang
   * SAMA dengan penilaian persediaan di neraca dan HPP, supaya angka di PDF
   * tidak pernah berbeda dari angka di laporan.
   */
  const inventory = summarizeInventory(items).map((summary, index) => ({
    ...summary,
    isActive: items[index].isActive,
    lastMovement: items[index].stockMovements[0]?.date ?? null,
  }));

  return NextResponse.json(inventory);
}

export async function POST(request: Request) {
  const result = await requireApiPermission("inventory.write"); // all roles can update inventory
  if (!result.authorized) return result.response;

  const body = await request.json();

  // Create new item
  if (body.action === "create_item") {
    const parsed = itemSchema.safeParse({
      code: body.code,
      name: body.name,
      unit: body.unit,
      confirmDuplicateName: body.confirmDuplicateName,
    });
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
    /*
     * ── KODE KEMBAR: 409 YANG MENJELASKAN, BUKAN 500 (24 Agu 2026, #493) ──
     *
     * Ditemukan dari produksi, bukan dibayangkan: seorang pengguna baru mencoba
     * menyimpan barang yang bentrok, `prisma.item.create()` melempar P2002
     * tanpa penangkap, Next menjawab 500, dan formulir jatuh ke kalimat umum
     * "Barang gagal disimpan" — tanpa satu kata pun tentang SEBABNYA. Yang
     * dilaporkan pengguna: "barang tidak bisa disimpan".
     *
     * Sejak #493 yang `@unique` adalah KODE, bukan nama, jadi inilah satu-satunya
     * bentrokan yang masih menolak. Dua keadaan tetap harus dibedakan, dan
     * inilah sebab pemeriksaannya membaca barisnya alih-alih sekadar
     * menerjemahkan kode galat:
     *
     *   • barang berkode sama masih AKTIF — pengguna bisa melihatnya di daftar,
     *     jadi cukup dikatakan kodenya sudah dipakai;
     *   • barang berkode sama sudah NONAKTIF — ia TIDAK terlihat di daftar mana
     *     pun (docs/DATABASE.md §1.3), jadi "kode sudah dipakai" terdengar
     *     seperti aplikasi yang berbohong. Yang benar adalah menyebut bahwa ia
     *     ada tapi nonaktif, dan mengarahkan untuk mengaktifkannya kembali.
     */
    const { code, name, unit, confirmDuplicateName } = parsed.data;

    /*
     * ── NAMA KEMBAR: DITAHAN SEKALI, BUKAN DITOLAK (#493) ──────────────────
     *
     * Sampai #493 nama adalah kunci, jadi nama kembar mustahil. Berkas saldo
     * awal 2024 pengguna pertama membantah asumsi itu — ia memuat dua
     * `LONG PEPPER` yang berbeda (kode 100006 & 100010, harga satuannya
     * berselisih hampir empat kali lipat).
     *
     * Tapi kalimat yang ditulis 24 Agustus tetap benar untuk kasus yang LAIN:
     * nama kembar yang TIDAK disengaja membelah riwayat stok sebuah barang
     * menjadi dua, dan pembelahan itu tidak pernah terlihat sampai laporannya
     * tidak mau cocok. Jadi perlindungannya berubah BENTUK, bukan hilang:
     * pertanyaan sekali, bukan penolakan.
     *
     * Penjaganya di SERVER, bukan hanya di layar, dan itu disengaja: `/api/v1`
     * dan token API memanggil jalur ini tanpa melewati formulir mana pun.
     * Pemanggil yang tidak menyebut `confirmDuplicateName` dianggap BELUM
     * menjawab — bukan dianggap setuju.
     */
    if (!confirmDuplicateName) {
      const sameName = await prisma.item.findFirst({
        where: { name },
        select: { code: true, name: true, isActive: true },
        orderBy: { id: "asc" },
      });

      if (sameName) {
        const { t } = await getRequestI18n();
        return NextResponse.json(
          {
            error: t("inventory.duplicateNameQuestion", {
              name: sameName.name,
              code: sameName.code,
            }),
            /*
             * Penanda MESIN, bukan pesan yang diurai ulang: formulir memakainya
             * untuk membedakan "jawab dulu pertanyaan ini" dari penolakan biasa.
             * Mencocokkan kalimat akan pecah begitu bahasanya berganti.
             */
            needsConfirmation: "duplicate_name",
            duplicate: sameName,
            hint: sameName.isActive
              ? t("inventory.duplicateNameActive")
              : t("inventory.duplicateNameInactive"),
          },
          { status: 409 }
        );
      }
    }

    let item;
    try {
      item = await prisma.item.create({ data: { code, name, unit } });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      const existing = await prisma.item.findUnique({
        where: { code },
        select: { isActive: true },
      });
      const { t } = await getRequestI18n();

      return NextResponse.json(
        {
          error: t("inventory.itemCodeTaken"),
          /* Sebagai galat PER ISIAN, bukan sekadar pesan: formulirnya menyorot
             kotak Kode, dan itulah kotak yang harus diubah. */
          details: {
            fieldErrors: {
              code: [
                existing && !existing.isActive
                  ? t("inventory.itemCodeTakenInactive")
                  : t("inventory.itemCodeTaken"),
              ],
            },
          },
        },
        { status: 409 }
      );
    }

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: "item.create",
      entity: "item",
      entityId: item.id,
      details: { code: item.code, name: item.name, unit: item.unit },
      request,
    });

    return NextResponse.json(item, { status: 201 });
  }

  // Aktifkan / nonaktifkan barang (docs/DATABASE.md §1.3).
  //
  // Barang TIDAK punya route DELETE, dan itu disengaja: begitu sebuah barang
  // pernah bergerak, menghapusnya akan menghapus gerakannya (FK CASCADE) —
  // artinya menghapus dasar dari HPP dan penilaian persediaan yang sudah masuk
  // ke laporan. Menonaktifkan adalah SATU-SATUNYA cara menyingkirkan barang
  // dari pemilih, dan itu cukup: saldo, riwayat, dan jurnalnya tetap utuh.
  if (body.action === "set_item_active") {
    const parsed = itemActiveSchema.safeParse({ id: body.id, isActive: body.isActive });
    if (!parsed.success) {
      const { dictionary, t } = await getRequestI18n();
      return NextResponse.json(
        {
          error: t("validation.invalidInput"),
          details: translateFieldErrors(parsed.error, dictionary),
        },
        { status: 400 }
      );
    }

    const item = await prisma.item.update({
      where: { id: parsed.data.id },
      data: { isActive: parsed.data.isActive },
    });

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: parsed.data.isActive ? "item.activate" : "item.deactivate",
      entity: "item",
      entityId: item.id,
      details: { name: item.name, isActive: item.isActive },
      request,
    });

    return NextResponse.json(item);
  }

  // Stock update
  const parsed = stockUpdateSchema.safeParse(body);
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

  const { date, unitCost, shrinkageValue, cashType, ...stockData } = parsed.data;

  /*
   * ── "Hasil Proses" adalah PILIHAN LAYAR, bukan nilai `type` (issue #490) ──
   *
   * Stoknya berkurang persis seperti pengeluaran lain, jadi barisnya ditulis
   * sebagai `out` biasa dan SELURUH aritmetika saldo yang sudah ada tetap
   * benar tanpa diajari apa pun. Yang membedakannya cuma dua hal, dan keduanya
   * di luar kolom `type`: catatan bertanda `PROCESS_SHRINKAGE_NOTE`, dan
   * `sourceType` yang dipakai memposting jurnalnya.
   *
   * Nilai rupiah yang diketik pengguna disimpan sebagai `unit_cost` — nilai per
   * kilo, sehingga `qty × unitCost` memulangkan angka yang persis ia sebut.
   * Aman bagi mesin costing: `weightedAverageUnitCost` hanya membaca baris
   * `in`, jadi baris `out` bercosting tak pernah menggeser rata-rata.
   */
  const isShrinkage = stockData.type === "shrinkage";
  const movementType = isShrinkage ? "out" : stockData.type;

  if (movementType === "out") {
    const item = await prisma.item.findUnique({
      where: { id: stockData.itemId },
      include: { stockMovements: true },
    });
    if (!item) {
      const { t } = await getRequestI18n();
      return NextResponse.json({ error: t("errors.inventoryItemNotFound") }, { status: 404 });
    }
    const { currentStock } = calculateStockTotals(item.stockMovements);
    if (currentStock < stockData.quantity) {
      const { t } = await getRequestI18n();
      return NextResponse.json(
        {
          error: t("errors.insufficientStock", {
            available: currentStock,
            requested: stockData.quantity,
          }),
        },
        { status: 400 }
      );
    }
  }

  /*
   * ── UANGNYA IKUT KELUAR, KALAU MEMANG BEGITU (5 Sep 2026) ────────────────
   *
   * Barang yang dibeli tunai di gudang tidak melewati layar Pembelian: tidak
   * ada hutang yang terbit, tidak ada pelunasan yang menutupnya, dan sampai
   * sekarang tidak ada satu pun baris yang mengatakan kasnya berkurang. Stoknya
   * bertambah, uangnya diam — dan selisih itu baru terlihat saat kas fisik
   * dihitung.
   *
   * Karena itu kolom `cashType` di sini menulis SATU baris `cash_movements`
   * yang diposting D: Persediaan / K: Kas. Bukan pembelian pemasok: yang itu
   * menerbitkan hutang lalu melunasinya pada detik yang sama, dan halaman
   * Kas & Bank — yang membaca `cash_movements`, bukan buku besar — tetap tidak
   * akan menampilkannya.
   *
   * Izinnya DUA, karena perbuatannya dua. `inventory.write` saja tidak pernah
   * berarti "boleh mengeluarkan uang perusahaan". Yang dipanggil adalah
   * PENJAGA yang sama dengan `/api/finance`, bukan pemeriksaan tulis tangan:
   * jawabannya karena itu tidak bisa berbeda antara dua pintu menuju perbuatan
   * yang sama, dan ia ikut membawa lapisan modul serta override per-pengguna
   * yang sebuah `if` tidak akan pernah ingat untuk ditiru.
   */
  const paysCash = stockData.type === "in" && cashType != null;
  if (paysCash) {
    const cashGate = await requireApiPermission("cash.write");
    if (!cashGate.authorized) return cashGate.response;
  }

  let stock;
  let cashMovementId: number | null = null;
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const created = await tx.stockMovement.create({
        data: {
          ...stockData,
          type: movementType,
          date: new Date(date),
          // Cost is captured on the way in and derived on the way out — kecuali
          // susut proses, yang nilainya DIKETIK (issue #490).
          unitCost: isShrinkage
            ? shrinkageValue! / stockData.quantity
            : stockData.type === "in"
              ? unitCost
              : null,
          /* Eksplisit, SESUDAH sebaran: pemasok hanya melekat pada gerakan
             MASUK. Skemanya sudah menolak yang sebaliknya, tetapi menuliskannya
             di sini juga membuat baris yang tersimpan benar walau suatu saat
             ada pemanggil lain yang melewati skema itu. */
          supplierId: stockData.type === "in" ? (stockData.supplierId ?? null) : null,
          /* Penanda yang membuat susut proses bisa dikenali kembali — pola yang
             sama dengan opname. Catatan pengguna tetap ikut di belakangnya
             supaya tidak ada yang hilang. */
          note: isShrinkage
            ? [PROCESS_SHRINKAGE_NOTE, stockData.note?.trim()].filter(Boolean).join(" — ")
            : stockData.note,
        },
        include: { item: { select: { name: true } } },
      });

      /*
       * `stock_shrinkage` → Beban Susut Proses; `stock_movement` → HPP. Dua
       * aturan jurnal atas satu tabel, dipilih di sini — pola yang sama dengan
       * opname (`stock_adjustment`). Barang MASUK tidak memposting apa pun:
       * ia sudah dikapitalisasi oleh jurnal pembeliannya.
       */
      await postForSource({
        sourceType: isShrinkage ? "stock_shrinkage" : "stock_movement",
        sourceId: created.id,
        tx,
      });

      /*
       * Nilainya `quantity × unitCost` — angka yang SAMA dengan yang masuk ke
       * persediaan, jadi kedua sisi jurnal lahir dari satu perkalian dan tidak
       * bisa berselisih. Akun lawannya diselesaikan lewat slot `inventory`,
       * bukan id yang dititipkan pemanggil: `cash_movement` adalah satu-satunya
       * aturan posting yang menuntut akun lawan dari LUAR, dan membiarkan
       * peramban menyebutnya berarti membiarkan kas dilawankan ke akun mana pun.
       */
      if (!paysCash) return { movement: created, cash: null };

      const amount = round2(stockData.quantity * unitCost!);
      const supplier = stockData.supplierId
        ? await tx.supplier.findUnique({
            where: { id: stockData.supplierId },
            select: { name: true },
          })
        : null;
      const inventoryAccountId = await resolveAccountId(
        MAPPING_KEYS.INVENTORY,
        BASE_CURRENCY,
        tx
      );

      const cash = await tx.cashMovement.create({
        data: {
          type: cashType!,
          date: new Date(date),
          description: [
            `Pembelian tunai ${created.item.name}`,
            supplier?.name,
          ]
            .filter(Boolean)
            .join(" — ")
            .slice(0, 255),
          currency: BASE_CURRENCY,
          debit: 0,
          credit: amount,
          /* Rupiah lawan rupiah: kurs 1 dan `base_amount` = nominalnya sendiri,
             persis yang dipulangkan `fxAmounts` untuk mata uang dasar. */
          rate: 1,
          baseAmount: amount,
          /* Dimensi yang sama dengan gerakan stoknya — satu perbuatan, satu
             cabang. Tanpa ini, Laba/Rugi cabang menerima persediaannya tetapi
             tidak menerima kas yang membayarnya. */
          costCenterId: stockData.costCenterId ?? null,
          /* Jejak balik ke gerakannya. `cash_movements` tidak punya FK ke
             `stock_movements` dan tidak dibuatkan satu: nomor di catatan sudah
             cukup untuk ditelusuri manusia, sedangkan kolom baru menuntut
             migrasi pada tabel yang dibaca setiap laporan kas. */
          note: `Gerakan stok #${created.id}`,
        },
      });

      await postForSource({
        sourceType: "cash_movement",
        sourceId: cash.id,
        tx,
        counterAccountId: inventoryAccountId,
      });

      return { movement: created, cash };
    });
    stock = outcome.movement;
    cashMovementId = outcome.cash?.id ?? null;
  } catch (e) {
    return handlePostingError(e);
  }

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    action: isShrinkage ? "stock.shrinkage" : stockData.type === "in" ? "stock.in" : "stock.out",
    entity: "stock",
    entityId: stock.id,
    details: {
      itemId: stock.itemId,
      itemName: stock.item.name,
      quantity: Number(stock.quantity),
      type: stock.type,
      /* Hanya pada gerakan yang benar-benar memotong kas — baris audit gerakan
         biasa tidak berubah bentuk. */
      ...(cashMovementId != null ? { cashType, cashMovementId } : {}),
    },
    request,
  });

  return NextResponse.json(stock, { status: 201 });
}

/**
 * P2002 — pelanggaran kunci unik.
 *
 * Diperiksa lewat bentuk objeknya, bukan `instanceof`: kelas galat Prisma
 * datang dari klien yang DIBANGKITKAN (`@/generated/prisma`), dan mengimpornya
 * ke route hanya untuk satu perbandingan tipe membuat berkas ini bergantung
 * pada artefak build. Kodenya sendiri stabil di seluruh versi Prisma.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}
