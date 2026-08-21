/**
 * Skema AKSI TULIS konsol operator (issue #155) — SATU skema, dua sisi
 * (Konvensi Form MASTER.md): form client memvalidasi dengan skema yang sama
 * yang diurai ulang server action (`app/(app)/(operator)/operator/tenants/[id]/
 * actions.ts`). Pesan lewat KUNCI kamus (`vmsg`) — kalimatnya disusun di
 * batas tampilan, mengikuti bahasa pengguna.
 *
 * MURNI: tanpa React/Prisma/next/server-only — diimpor komponen client DAN
 * server action. Rumahnya `src/lib/validations/` bersama skema lain, bukan
 * `src/lib/operator/`: penjaga `tests/i18n-validation.test.tsx` menyapu
 * direktori ini untuk memastikan tidak ada kalimat mentah tertinggal di skema
 * dan tidak ada kunci `validation.*` yang menganggur — skema yang bersembunyi
 * di luar sini lolos dari kedua penjaga itu.
 *
 * `reason` WAJIB di SEMUA skema (aturan #155): tindakan tanpa alasan adalah
 * tindakan yang tidak bisa ditinjau ulang. Minimal 5 karakter — "ok" bukan
 * alasan.
 */

import { z } from "zod";
import { vmsg } from "@/lib/i18n/validation";

/** Alasan yang diketik operator — masuk ke jejak audit apa adanya. */
export const operatorReasonField = z
  .string()
  .trim()
  .min(5, vmsg("validation.operatorReasonRequired"))
  .max(500);

const tenantIdField = z.number().int().positive();

/* ── 1. Tandai tagihan lunas (transfer manual) ─────────────────────────────── */

export const manualPaymentSchema = z.object({
  tenantId: tenantIdField,
  invoiceNumber: z.string().trim().min(1, vmsg("validation.invoiceRequired")),
  /** Nominal DITERIMA di rekening (IDR, bulat — `MoneyInput` decimals 0). */
  amount: z.coerce.number().positive(vmsg("validation.amountPositive")),
  /** Tanggal transfer di rekening koran (yyyy-mm-dd). */
  transferDate: z.string().min(1, vmsg("validation.dateRequired")),
  /** Referensi/berita transfer — kunci anti-duplikat (`gateway_ref` UNIQUE). */
  bankRef: z.string().trim().min(3, vmsg("validation.bankRefRequired")).max(100),
  reason: operatorReasonField,
});
export type ManualPaymentFormInput = z.infer<typeof manualPaymentSchema>;

/* ── 2. Ganti paket ────────────────────────────────────────────────────────── */

export const changePlanSchema = z.object({
  tenantId: tenantIdField,
  planKey: z.string().trim().min(1, vmsg("validation.planRequired")),
  reason: operatorReasonField,
});
export type ChangePlanFormInput = z.infer<typeof changePlanSchema>;

/* ── 3. Suspensi / pemulihan manual ────────────────────────────────────────── */

export const suspensionSchema = z.object({
  tenantId: tenantIdField,
  mode: z.enum(["suspend", "restore"]),
  reason: operatorReasonField,
});
export type SuspensionFormInput = z.infer<typeof suspensionSchema>;

/* ── 3b. Perpanjangan kompensasi ───────────────────────────────────────────── */

/**
 * Beri periode berbayar tanpa melewati gerbang pembayaran.
 *
 * `periods` dibatasi 1–24: setahun tahunan, dua tahun, atau dua tahun bulanan.
 * Batas atas bukan kesopanan — perpanjangan yang salah ketik (240 bulan) adalah
 * dua puluh tahun langganan gratis yang baru ketahuan saat seseorang membaca
 * laporan, dan mencabutnya berarti menyentuh uang lagi.
 */
export const extendSubscriptionSchema = z.object({
  tenantId: tenantIdField,
  cycle: z.enum(["monthly", "yearly"]),
  periods: z.coerce.number().int().min(1).max(24),
  reason: operatorReasonField,
});
export type ExtendSubscriptionFormInput = z.infer<typeof extendSubscriptionSchema>;

/* ── 4. Eksekusi penghapusan ───────────────────────────────────────────────── */

export const deletionExecuteSchema = z.object({
  tenantId: tenantIdField,
  /** Ketik ulang SLUG tenant — konfirmasi bukti; server mencocokkannya lagi
   *  dengan slug sesungguhnya (client hanya gerbang pertama). */
  confirmSlug: z.string().trim().min(1, vmsg("validation.confirmSlugRequired")),
  reason: operatorReasonField,
});
export type DeletionExecuteFormInput = z.infer<typeof deletionExecuteSchema>;

/* ── 5. Pengaturan surel penyedia (#169) ───────────────────────────────────── */

/**
 * Port SMTP. Kosong DIPERBOLEHKAN oleh field-nya sendiri (transport `file`
 * tidak butuh port); kewajibannya untuk transport `smtp` ditegakkan
 * `superRefine` di bawah — satu tempat, bukan dua aturan yang bisa menyimpang.
 */
const mailPortField = z
  .union([
    z.literal(""),
    z.coerce
      .number()
      .int()
      .min(1, vmsg("validation.mailPortInvalid"))
      .max(65535, vmsg("validation.mailPortInvalid")),
  ])
  .optional();

/**
 * Pengaturan surel. `reason` TIDAK diminta di sini — berbeda dari empat aksi
 * tenant di atas, ini konfigurasi milik penyedia sendiri, bukan tindakan
 * terhadap data pelanggan; jejaknya tetap tercatat lengkap dengan aktornya.
 *
 * KATA SANDI: `password` kosong berarti PERTAHANKAN yang tersimpan — layar
 * hanya pernah melihat `••••`, jadi "simpan" tidak boleh berarti "kosongkan".
 * Menghapus kata sandi adalah permintaan EKSPLISIT lewat `clearPassword`.
 */
export const mailSettingsSchema = z
  .object({
    transport: z.enum(["file", "smtp"]),
    host: z.string().trim().max(191).optional(),
    port: mailPortField,
    username: z.string().trim().max(191).optional(),
    /** Header From — boleh "Nama <alamat@contoh.id>", jadi bukan `z.email()`. */
    fromAddress: z.string().trim().min(1, vmsg("validation.mailFromRequired")).max(191),
    /**
     * Salinan senyap (BCC) setiap surel keluar yang TIDAK membawa token akses.
     *
     * Kosong = tidak ada salinan, dan itu cara mencabutnya — bukan tombol
     * terpisah. Berbeda dari `fromAddress`, ia HARUS alamat telanjang: "Nama
     * <alamat>" sah sebagai header From, tapi sebagai BCC ia hanya menambah
     * satu bentuk yang bisa salah tanpa memberi apa pun.
     */
    archiveAddress: z
      .string()
      .trim()
      .max(191)
      .optional()
      .refine((v) => !v || /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(v), {
        message: vmsg("validation.emailInvalid"),
      }),
    password: z.string().max(200).optional(),
    clearPassword: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.transport !== "smtp") return;
    if (!value.host?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["host"],
        message: vmsg("validation.mailHostRequired"),
      });
    }
    if (value.port === "" || value.port === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["port"],
        message: vmsg("validation.mailPortRequired"),
      });
    }
  });
export type MailSettingsFormInput = z.infer<typeof mailSettingsSchema>;

/** Uji kirim — satu alamat yang diketik operator. Konfigurasi surel yang tak
 *  bisa diuji adalah konfigurasi yang baru ketahuan salah saat pelanggan
 *  pertama mendaftar. */
export const mailTestSchema = z.object({
  to: z.email(vmsg("validation.emailInvalid")).max(191).trim(),
});
export type MailTestFormInput = z.infer<typeof mailTestSchema>;
