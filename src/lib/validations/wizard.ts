import { z } from "zod";
import { customerSchema, supplierSchema } from "./finance";

/**
 * Zod untuk wizard terpandu (issue #5) — HANYA bagian yang belum punya skema.
 *
 * Yang sengaja TIDAK ditulis ulang di sini: bentuk faktur, surat jalan,
 * pembelian, pelanggan, dan pemasok. Semuanya sudah punya skema yang dipakai
 * route biasa (`invoiceSchema`, `deliveryOrderSchema`, `supplierTransactionSchema`,
 * `customerSchema`, `supplierSchema`), dan route wizard menjalankan skema-skema
 * ITU pada sub-objek yang dikirim — jadi pesan galat, koersi, dan batasannya
 * identik dengan formulir biasa dan tidak bisa melenceng.
 *
 * Yang tinggal di sini hanyalah lapisan luarnya: apakah mitra dagangnya dipilih
 * dari daftar atau diisi baru, dan sub-objek mana yang ada. Sub-objeknya
 * dibiarkan `unknown` di lapisan ini — bukan longgar, melainkan menunda:
 * masing-masing tetap harus lolos skema aslinya sebelum apa pun ditulis.
 */

/** "" / null / undefined → null, else a positive int. */
const nullableId = z
  .preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce.number().int().positive().nullable()
  )
  .default(null);

/**
 * Mitra dagang wizard: dipilih dari daftar, atau diisi sebagai data baru.
 *
 * Data mitra baru TIDAK divalidasi lengkap di sini — route menjalankan
 * `customerSchema` / `supplierSchema` atasnya, tepat sebelum baris itu dibuat di
 * dalam transaksi. Yang diperiksa di sini hanya bahwa modenya konsisten:
 * "existing" tanpa id, atau "new" tanpa nama, tidak akan pernah bisa dikerjakan.
 */
export const wizardPartnerSchema = z
  .object({
    mode: z.enum(["existing", "new"]),
    id: nullableId,
    name: z.string().trim().max(100).optional(),
    address: z.string().trim().max(500).optional(),
    phone: z.string().trim().max(30).optional(),
    email: z.string().trim().max(100).optional(),
    pic: z.string().trim().max(100).optional(),
    npwp: z.string().trim().max(30).optional(),
    taxExempt: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "existing" && data.id == null) {
      ctx.addIssue({
        code: "custom",
        path: ["id"],
        message: "Pilih mitra dari daftar, atau isi data mitra baru.",
      });
    }
    if (data.mode === "new" && !data.name) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: "Nama wajib diisi untuk mitra baru.",
      });
    }
  });

export type WizardPartnerInput = z.infer<typeof wizardPartnerSchema>;

/**
 * Data pelanggan baru, siap dibuat — dijalankan lewat `customerSchema` supaya
 * aturannya sama persis dengan `POST /api/customers`.
 */
export function customerDataFromPartner(partner: WizardPartnerInput) {
  return customerSchema.safeParse({
    name: partner.name ?? "",
    address: partner.address,
    phone: partner.phone,
    email: partner.email ?? "",
    pic: partner.pic,
    npwp: partner.npwp,
    taxExempt: partner.taxExempt ?? false,
  });
}

/** Data pemasok baru, lewat `supplierSchema` — sama persis `POST /api/suppliers`. */
export function supplierDataFromPartner(partner: WizardPartnerInput) {
  return supplierSchema.safeParse({
    name: partner.name ?? "",
    address: partner.address,
    phone: partner.phone,
    email: partner.email ?? "",
  });
}

/**
 * Amplop wizard penjualan. `delivery` boleh null (langkah 3 dilewati); `invoice`
 * tidak pernah null — sebuah penjualan yang tidak menagih apa pun bukan penjualan.
 */
export const salesWizardSchema = z.object({
  customer: wizardPartnerSchema,
  /** Kontrak sumber yang sudah ada (#15) — opsional. */
  contractId: nullableId,
  delivery: z.unknown().nullish(),
  invoice: z.unknown(),
});

/** Amplop wizard pembelian. `receipt` boleh null (barang belum sampai gudang). */
export const purchaseWizardSchema = z.object({
  supplier: wizardPartnerSchema,
  purchase: z.unknown(),
  receipt: z.unknown().nullish(),
});

/** Satu baris barang masuk pada wizard pembelian. */
export const wizardReceiptItemSchema = z.object({
  itemId: z.coerce.number().int().positive("Pilih barang dari master stok."),
  itemName: z.string().trim().max(100).optional(),
  quantity: z.coerce.number().positive("Jumlah barang masuk harus lebih besar dari 0"),
  /** IDR per unit — satu-satunya masukan HPP rata-rata (lihat `stockUpdateSchema`). */
  unitCost: z.coerce
    .number()
    .positive("Harga pokok per unit harus lebih besar dari 0"),
});

export const wizardReceiptSchema = z.object({
  date: z.string().min(1, "Tanggal barang masuk wajib diisi"),
  items: z
    .array(wizardReceiptItemSchema)
    .min(1, "Minimal satu barang")
    .max(50, "Maksimal 50 barang"),
});

export type SalesWizardInput = z.infer<typeof salesWizardSchema>;
export type PurchaseWizardInput = z.infer<typeof purchaseWizardSchema>;
export type WizardReceiptInput = z.infer<typeof wizardReceiptSchema>;
