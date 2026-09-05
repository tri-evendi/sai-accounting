import { z } from "zod";
import { vmsg } from "@/lib/i18n/validation";
import { cashTypeField } from "./payment";

export const stockUpdateSchema = z
  .object({
    /*
     * `positive`, bukan sekadar `int`: isian pilihan yang tak dipilih tiba
     * sebagai `""`, dan `Number("")` adalah `0` — sebuah id yang tak pernah
     * ada. Sebelum #216 itu lolos skema dan baru gagal di FK; sekarang ia
     * ditolak sebagai "pilih barang", di client, sebelum satu permintaan pun
     * berangkat.
     */
    itemId: z.coerce.number().int().positive(vmsg("validation.pickStockItem")),
    quantity: z.coerce.number().positive(vmsg("validation.quantityPositive")),
    /*
     * Tiga PILIHAN di layar, dua ARAH di basis data (issue #490).
     * `shrinkage` adalah pilihan formulir, bukan nilai `stock_movements.type`:
     * route menuliskannya sebagai gerakan `out` bertanda, sebab stoknya memang
     * berkurang persis seperti pengeluaran lain. Yang berbeda hanya jurnalnya.
     * Lihat `PROCESS_SHRINKAGE_NOTE` di `lib/constants.ts`.
     */
    type: z.enum(["in", "out", "shrinkage"]),
    date: z.string().min(1, vmsg("validation.dateRequired")),
    /**
     * IDR cost per unit. Required on `in` movements: it is the only input to the
     * weighted-average COGS the engine posts when stock later goes `out`.
     * Without it the outgoing movement books no COGS at all and profit is
     * silently overstated. Ignored on `out` (cost is derived, never re-entered).
     */
    unitCost: z.coerce.number().positive(vmsg("validation.unitCostPositive")).optional(),
    /**
     * Nilai rupiah yang susut (issue #490) — WAJIB pada "Hasil Proses", dan
     * hanya di sana. Pengguna menyebutnya sebagai angka TERPISAH dari
     * kuantitasnya ("35 kilo susut, nominalnya 1 juta"), jadi ia diketik, bukan
     * diturunkan dari rata-rata tertimbang. Inilah yang dibebankan ke akun
     * Beban Susut Proses.
     */
    shrinkageValue: z.coerce
      .number()
      .positive(vmsg("validation.shrinkageValuePositive"))
      .optional(),
    note: z.string().max(500).trim().optional(),
    /**
     * Pusat biaya gerakan ini (issue #98). Pengeluaran stok MANUAL adalah satu-
     * satunya jalur HPP yang tak punya dokumen sumber untuk diwarisi — kalau
     * tidak bisa dipilih di sini, HPP-nya selamanya "belum ditetapkan" dan
     * Laba/Rugi cabang kehilangan harga pokoknya tanpa satu pun tanda.
     * Nullish: tak dipilih = "belum ditetapkan / seluruh perusahaan".
     */
    costCenterId: z.coerce.number().int().positive().nullish(),
    /**
     * Pemasok pengirim (migrasi 0058). Hanya berarti pada gerakan MASUK: yang
     * KELUAR tidak punya pengirim, dan susut proses tidak datang dari siapa pun.
     *
     * Opsional dengan sengaja — barang bisa masuk tanpa pemasok yang tercatat
     * (koreksi hitung, kiriman contoh, pengembalian dari gudang lain). Yang
     * dituntut hanyalah: kalau disebut, ia tidak boleh disebut pada arah yang
     * membuatnya mustahil.
     */
    supplierId: z.coerce.number().int().positive().nullish(),
    /**
     * Kas/bank yang UANGNYA KELUAR untuk barang ini (permintaan pengguna,
     * 5 Sep 2026). NULL = perilaku lama, dan itu tetap yang paling sering
     * benar: barang yang masuk lewat jalur Pembelian sudah punya hutang dan
     * pelunasannya sendiri, dan memotong kas di sini akan mencatat uang keluar
     * dua kali.
     *
     * Disebut → route menulis SATU baris `cash_movements` bernilai
     * `quantity × unitCost` dan mempostingnya D: Persediaan / K: Kas. Jurnal
     * itu tidak menabrak apa pun: gerakan `in` sendiri memang tidak memposting
     * apa-apa (lihat `buildStockMovementEntry`), justru karena ia biasanya
     * sudah dikapitalisasi jurnal pembelian yang di sini tidak ada.
     *
     * Hanya pada arah MASUK: yang keluar tidak dibayar siapa pun, dan susut
     * proses adalah pembebanan, bukan pengeluaran uang.
     */
    cashType: cashTypeField,
  })
  .superRefine((data, ctx) => {
    if (data.type !== "in" && data.cashType) {
      ctx.addIssue({
        code: "custom",
        path: ["cashType"],
        message: vmsg("validation.cashTypeOnStockInOnly"),
      });
    }
    if (data.type !== "in" && data.supplierId) {
      ctx.addIssue({
        code: "custom",
        path: ["supplierId"],
        message: vmsg("validation.supplierOnStockInOnly"),
      });
    }
    if (data.type === "in" && !data.unitCost) {
      ctx.addIssue({
        code: "custom",
        path: ["unitCost"],
        message: vmsg("validation.unitCostRequiredForStockIn"),
      });
    }
    /*
     * Tanpa nilai, "Hasil Proses" hanya mengurangi stok tanpa membebankan
     * apa pun — barangnya hilang dari gudang dan tidak muncul sebagai ongkos
     * di mana pun. Itu bukan pencatatan yang setengah jadi, itu pencatatan
     * yang salah, jadi ia ditolak di sini alih-alih diposting sebagian.
     */
    if (data.type === "shrinkage" && !data.shrinkageValue) {
      ctx.addIssue({
        code: "custom",
        path: ["shrinkageValue"],
        message: vmsg("validation.shrinkageValueRequired"),
      });
    }
  });

export const itemSchema = z.object({
  /*
   * Kode barang (#493) — identitas sebuah barang sejak nama berhenti jadi
   * kunci. Di-trim SEBELUM diperiksa panjang minimalnya supaya spasi tidak
   * pernah lolos sebagai kode.
   */
  code: z.string().trim().min(1, vmsg("validation.itemCodeRequired")).max(20),
  name: z.string().min(1, vmsg("validation.itemNameRequired")).max(100).trim(),
  unit: z.string().max(20).trim().optional(),
  /*
   * Pengakuan SADAR bahwa nama kembar memang disengaja (#493). Bukan bagian
   * dari data barang — ia tidak disimpan ke mana pun — melainkan jawaban atas
   * pertanyaan yang diajukan server saat namanya bentrok. Bawaannya `false`:
   * pemanggil yang tidak menyebutnya sama sekali dianggap BELUM menjawab, dan
   * itu benar untuk pemanggil API di luar layar kita.
   */
  confirmDuplicateName: z.boolean().optional().default(false),
});

/**
 * Aktif/nonaktifkan barang (issue #104). Barang tidak pernah dihapus setelah
 * pernah bergerak — gerakannya adalah dasar HPP dan penilaian persediaan yang
 * sudah terbit di laporan. `is_active = false` menyingkirkannya dari pemilih
 * tanpa menyentuh satu baris riwayat pun.
 */
export const itemActiveSchema = z.object({
  id: z.coerce.number().int().positive(),
  isActive: z.boolean(),
});

/**
 * Stok opname (issue #57) — hitungan fisik per barang pada satu tanggal. Server
 * menghitung selisih (fisik − sistem) dan hanya menulis penyesuaian untuk yang
 * berselisih. `physicalQty` boleh 0 (barang habis saat dihitung).
 */
export const opnameSchema = z.object({
  date: z.string().min(1, vmsg("validation.dateRequired")),
  counts: z
    .array(
      z.object({
        itemId: z.coerce.number().int(),
        physicalQty: z.coerce.number().min(0, vmsg("validation.physicalQtyNotNegative")),
      })
    )
    .min(1, vmsg("validation.opnameMinOneItem")),
});

export type StockUpdateInput = z.infer<typeof stockUpdateSchema>;
export type ItemInput = z.infer<typeof itemSchema>;
export type OpnameInput = z.infer<typeof opnameSchema>;
