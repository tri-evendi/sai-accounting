/**
 * Skema AKSI TULIS konsol operator (issue #155) — SATU skema, dua sisi
 * (Konvensi Form MASTER.md): form client memvalidasi dengan skema yang sama
 * yang diurai ulang server action (`app/(app)/(operator)/tenants/[id]/
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
import { LEAD_LIMITS, LEAD_STATUSES } from "@sai/core/lead-request";
import { LOCALES } from "@sai/core/i18n/config";
import { BILLING_MODES } from "@sai/billing/platform-constants";
import { vmsg } from "@sai/core/i18n/validation";
import { SITE_CONTENT_NOTE_MAX, SITE_CONTENT_VALUE_MAX } from "@sai/core/site-content";

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

/* ── 3a. Ganti slug (alamat) akun — pagar sebenarnya di `renameTenantSlug` ── */

export const slugRenameSchema = z.object({
  tenantId: tenantIdField,
  slugBaru: z.string().trim().toLowerCase().min(1).max(63),
  reason: operatorReasonField,
});
export type SlugRenameFormInput = z.infer<typeof slugRenameSchema>;

/* ── 3c. Penawaran disetujui → hak pakai (KOMERSIALISASI §7 langkah 7) ───── */

export const quoteActivationSchema = z.object({
  tenantId: tenantIdField,
  planKey: z.string().trim().min(1).max(30),
  cycle: z.enum(["monthly", "yearly"]),
  /* Batas yang SAMA dengan perpanjangan kompensasi (1–24) — langkah keduanya
     memang `extendSubscription`. */
  periods: z.coerce.number().int().min(1).max(24),
  /** Nomor penawaran/kontrak di buku PT penyedia — masuk alasan setiap jejak,
   *  dan sejak alur demo-first menjadi KUNCI IDEMPOTENSI aktivasi
   *  (`quote_activations.quote_ref` UNIQUE, migration platform 0011). */
  quoteRef: z.string().trim().min(3).max(60),
  /** Referensi bukti transfer — berita/nomor referensi rekening koran atau URL
   *  dokumen bukti. Teks, bukan unggahan berkas. */
  transferProof: z.string().trim().min(3, vmsg("validation.transferProofRequired")).max(500),
  reason: operatorReasonField,
});
export type QuoteActivationFormInput = z.infer<typeof quoteActivationSchema>;

/* ── 3d. Tenant UJI COBA buatan operator (alur demo-first, 24 Okt 2026) ──── */

/**
 * Batas lama uji coba: 1–90 hari. Bawaan formulirnya `TRIAL_DAYS` (30, K-3).
 * Batas atas bukan kesopanan: uji coba setahun karena salah ketik adalah hak
 * pakai gratis setahun yang baru ketahuan saat seseorang membaca daftar.
 */
export const TRIAL_DAYS_MAX = 90;

export const createTrialSchema = z.object({
  tenantName: z.string().trim().min(2, vmsg("validation.nameRequired")).max(150),
  ownerName: z.string().trim().min(2, vmsg("validation.nameRequired")).max(100),
  ownerEmail: z.string().trim().toLowerCase().email(vmsg("validation.emailInvalid")).max(255),
  planKey: z.string().trim().min(1, vmsg("validation.planRequired")).max(30),
  trialDays: z.coerce.number().int().min(1).max(TRIAL_DAYS_MAX),
  /** 0 / kosong = salin kuota dari paket. */
  maxCompanies: z.coerce.number().int().min(0).max(1000),
  maxUsers: z.coerce.number().int().min(0).max(10000),
  /** Uji coba tidak pernah ditagih otomatis — `auto` sengaja TIDAK ditawarkan. */
  billingMode: z.enum(["none", "manual"]),
  referredByPartner: z.string().trim().max(100),
  isDemo: z.boolean(),
  reason: operatorReasonField,
});
export type CreateTrialFormInput = z.infer<typeof createTrialSchema>;

export const extendTrialSchema = z.object({
  tenantId: tenantIdField,
  days: z.coerce.number().int().min(1).max(TRIAL_DAYS_MAX),
  reason: operatorReasonField,
});
export type ExtendTrialFormInput = z.infer<typeof extendTrialSchema>;

export const partnerSchema = z.object({
  tenantId: tenantIdField,
  /** Kosong = hapus atribusi. */
  partner: z.string().trim().max(100),
  reason: operatorReasonField,
});
export type PartnerFormInput = z.infer<typeof partnerSchema>;

export const activationHandledSchema = z.object({
  requestId: z.number().int().positive(),
  reason: operatorReasonField,
});
export type ActivationHandledFormInput = z.infer<typeof activationHandledSchema>;

/* ── Penawaran masuk (`lead_requests`, migration platform 0016) ───────────── */

/** Ubah status satu lead — peralihan sahnya dijaga `leadTransitionAllowed`. */
export const leadStatusSchema = z.object({
  leadId: z.number().int().positive(),
  to: z.enum(LEAD_STATUSES),
});
export type LeadStatusInput = z.infer<typeof leadStatusSchema>;

/** Tambah catatan pada lead — teks bebas pendek, berstempel operator. */
export const leadNoteSchema = z.object({
  leadId: z.number().int().positive(),
  text: z.string().trim().min(2, vmsg("validation.leadNoteRequired")).max(LEAD_LIMITS.noteEntry),
});
export type LeadNoteInput = z.infer<typeof leadNoteSchema>;

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

/* ── 3c. Mode penagihan (Fase A komersialisasi) ────────────────────────────── */

/**
 * Setel mode penagihan: `none` | `manual` | `auto`.
 *
 * Nilainya dari `BILLING_MODES` — daftar yang sama yang dipakai basis data &
 * penjadwal, diimpor bukan disalin: mode yang salah ketik di sini akan menjadi
 * akun yang diam-diam TIDAK ditagih (gerbangnya gagal-tertutup), yaitu
 * kegagalan yang paling sulit terlihat.
 *
 * `reason` WAJIB, seperti seluruh aksi tulis #155 — dan di sini ia paling
 * berarti: `auto` adalah satu-satunya tindakan yang memberi penjadwal izin
 * menagih lalu MENANGGUHKAN buku pelanggan.
 */
export const billingModeActionSchema = z.object({
  tenantId: tenantIdField,
  mode: z.enum(BILLING_MODES),
  reason: operatorReasonField,
});
export type BillingModeFormInput = z.infer<typeof billingModeActionSchema>;

/* ── 3d. Pengaturan situs (migration 0016) ─────────────────────────────────── */

/**
 * Tiga nilai yang berhenti menuntut SSH: nomor WhatsApp, surel penjualan, dan
 * instruksi transfer manual.
 *
 * ⚠ ISIAN KOSONG BERARTI "CABUT KANALNYA", bukan "pakai environment".
 * Formulir HTML tidak bisa mengirim `null`, jadi kedua maksud itu tidak bisa
 * dibedakan dari satu kotak teks — dan menebaknya berarti satu dari dua
 * maksud dilakukan secara diam-diam. Karena itu "kembali ke environment"
 * punya jalannya sendiri (aksi `resetToEnv`, satu tombol), dan kotak kosong
 * di sini selalu berarti yang satu lagi.
 *
 * `reason` TIDAK diminta, sama seperti pengaturan surel #169: ini konfigurasi
 * milik penyedia sendiri, bukan tindakan terhadap data pelanggan. Jejaknya
 * tetap tercatat lengkap dengan aktornya.
 */
export const siteSettingsSchema = z.object({
  /** Digit saja — bentuk yang sama yang diterima `parseWhatsappNumber`. */
  contactWhatsapp: z
    .string()
    .trim()
    .max(30)
    .refine((v) => v.length === 0 || /^[0-9]{8,}$/.test(v), {
      message: vmsg("validation.whatsappDigitsOnly"),
    }),
  contactEmail: z
    .string()
    .trim()
    .max(191)
    .refine((v) => v.length === 0 || /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(v), {
      message: vmsg("validation.emailInvalid"),
    }),
  /** Ditampilkan APA ADANYA ke pelanggan; batasnya kewarasan, bukan kolom. */
  manualPaymentInstructions: z.string().trim().max(2000),
  /**
   * Dua GERBANG, masing-masing TIGA keadaan (migration 0017):
   * `env` = serahkan ke pengaturan server · `on` · `off`.
   *
   * Tiga keadaan, bukan boolean, sebab "belum pernah disetel dari konsol" HARUS
   * bisa dibedakan dari "sengaja dimatikan" — tanpa pembedaan itu, satu kali
   * menyimpan formulir ini akan merampas keputusan dari `.env` selamanya tanpa
   * ada yang memintanya.
   */
  selfServeSignup: z.enum(["env", "on", "off"]),
  ppn: z.enum(["env", "on", "off"]),
  /**
   * Harga di situs publik (migration platform 0013) — DUA keadaan, bukan
   * tiga: tidak ada env untuk diikuti, dan `null` di kolom sudah berarti
   * tampil. Menyimpan `on` atas baris `null` karena itu tidak merampas
   * keputusan siapa pun.
   */
  publicPricing: z.enum(["on", "off"]),
});
export type SiteSettingsFormInput = z.infer<typeof siteSettingsSchema>;

/**
 * `/settings` DIBAGI PER TAB — tiap tab menyimpan medannya SENDIRI, jadi
 * kirimannya membawa `section` dan hanya medan bagian itu. Medannya tetap
 * definisi di `siteSettingsSchema` di atas (satu aturan per medan, bukan dua).
 * Medan bagian lain yang ikut terkirim DIBUANG (`z.object` membuang kunci
 * asing) — tab Kontak tidak bisa menulis gerbang PPN walau kirimannya
 * memuatnya.
 */
export const SITE_SETTINGS_SECTIONS = ["signup", "billing", "pricing", "contact"] as const;
export type SiteSettingsSection = (typeof SITE_SETTINGS_SECTIONS)[number];
const f = siteSettingsSchema.shape;
export const siteSettingsSectionSchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("signup"), selfServeSignup: f.selfServeSignup }),
  z.object({
    section: z.literal("billing"),
    ppn: f.ppn,
    manualPaymentInstructions: f.manualPaymentInstructions,
  }),
  z.object({ section: z.literal("pricing"), publicPricing: f.publicPricing }),
  z.object({
    section: z.literal("contact"),
    contactWhatsapp: f.contactWhatsapp,
    contactEmail: f.contactEmail,
  }),
]);
export type SiteSettingsSectionInput = z.infer<typeof siteSettingsSectionSchema>;
/** Bentuk FORMULIR (rata, semua medan opsional) — RHF butuh satu tipe objek. */
export type SiteSettingsSectionFormInput = { section: SiteSettingsSection } & Partial<SiteSettingsFormInput>;

/**
 * PAKET TAMPIL / TERSEMBUNYI (`plans.is_public`, halaman `/plans`). Alasan
 * DIMINTA — berbeda dari pengaturan situs: `is_public` juga membuka/menutup
 * jalan swalayan tenant pindah paket, jadi ia menyentuh penagihan pelanggan.
 */
export const planVisibilitySchema = z.object({
  planId: z.number().int().positive(),
  isPublic: z.boolean(),
  reason: operatorReasonField,
});
export type PlanVisibilityFormInput = z.infer<typeof planVisibilitySchema>;

/**
 * RETENSI UJI COBA BEKU (migration platform 0012, alur demo-first).
 *
 * `autoDeletion` tiga keadaan seperti gerbang lain — `env` = ikut
 * `TRIAL_AUTO_DELETION` (bawaan MATI). `retentionDays` 0 = ikut env / 90; di
 * luar itu 30–3650 (batas yang sama dengan `trialRetentionDaysFrom`). Ketik
 * ulang kata `HAPUS` dituntut HANYA saat menyalakan — lihat formulirnya.
 */
export const trialRetentionSchema = z
  .object({
    autoDeletion: z.enum(["env", "on", "off"]),
    retentionDays: z.coerce.number().int().min(0).max(3650),
    confirm: z.string().trim().max(10),
  })
  .refine((v) => v.retentionDays === 0 || v.retentionDays >= 30, {
    path: ["retentionDays"],
    message: vmsg("validation.retentionDaysRange"),
  })
  .refine((v) => v.autoDeletion !== "on" || v.confirm.toUpperCase() === "HAPUS", {
    path: ["confirm"],
    message: vmsg("validation.retentionConfirmRequired"),
  });
export type TrialRetentionFormInput = z.infer<typeof trialRetentionSchema>;

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

/* ── 6. Isi halaman depan (CMS, migration platform 0008) ─────────────────── */

/**
 * DRAF satu bagian halaman, ketiga bahasa sekaligus (editor berdampingan).
 *
 * `entries[locale][nama]`. Nama telanjang (`heroHeading`), bukan jalur-titik:
 * react-hook-form membaca titik sebagai jalur BERSARANG, jadi
 * `entries.id.landing.heroHeading` akan menjadi objek empat tingkat. Awalan
 * `landing.` ditambahkan kembali di server action lewat `SITE_CONTENT_PREFIX`.
 *
 * NILAI KOSONG SAH: artinya "kembali ke kalimat bawaan saat diterbitkan".
 * Batas per isian, penanda `{…}`, dan larangan tag HTML diperiksa di kedua
 * sisi lewat `contentValueProblem` (`@sai/core/site-content`), karena batasnya
 * diturunkan dari kamus dan skema ini tidak memuat kamus. Yang di sini hanya
 * batas mutlak kolomnya.
 *
 * `reason` tidak diminta: ini isi milik penyedia sendiri. Jejaknya tetap
 * lengkap di riwayat penerbitan dan jejak audit operator.
 */
const siteContentLocaleEntries = z.record(
  z.string().max(80),
  z.string().max(SITE_CONTENT_VALUE_MAX, vmsg("validation.siteContentTooLong"))
);

export const siteContentDraftSchema = z.object({
  /** Bagian yang sedang disunting, untuk jawaban dan jejak. */
  section: z.string().trim().min(1).max(40),
  entries: z.object({
    id: siteContentLocaleEntries,
    en: siteContentLocaleEntries,
    zh: siteContentLocaleEntries,
  } satisfies Record<(typeof LOCALES)[number], typeof siteContentLocaleEntries>),
});
export type SiteContentDraftFormInput = z.infer<typeof siteContentDraftSchema>;

/** Terbitkan semua draf. Catatan opsional masuk ke riwayat. */
export const siteContentPublishSchema = z.object({
  note: z
    .string()
    .trim()
    .max(SITE_CONTENT_NOTE_MAX, vmsg("validation.siteContentTooLong"))
    .optional(),
});
export type SiteContentPublishFormInput = z.infer<typeof siteContentPublishSchema>;

/** Kembalikan dari riwayat: seluruh penerbitan (`undo`) atau satu revisi (`restore`). */
export const siteContentHistorySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("undo"), publicationId: z.number().int().positive() }),
  z.object({ mode: z.literal("restore"), revisionId: z.number().int().positive() }),
]);
export type SiteContentHistoryInput = z.infer<typeof siteContentHistorySchema>;

/* ── 9. Register lisensi on-premise (migration platform 0006) ──────────────── */

/**
 * Formulir DRAF lisensi — isiannya PERSIS yang dibutuhkan
 * `bun run licence:issue`, tidak lebih (keputusan pemilik 22 Okt 2026: satu
 * formulir → satu perintah → satu unggahan). Kontak, catatan, dan tenant SaaS
 * asal opsional.
 *
 * Angka & tanggal dibawa sebagai TEKS — bentuk yang dipegang `<input>` — dan
 * diubah di server action. Bentuknya sama dengan yang diterima skrip
 * penandatangan, supaya draf yang lolos di sini tidak pernah ditolak skripnya
 * di laptop luring.
 *
 * `reason` tidak diminta: draf tidak mengubah apa pun di luar register, dan
 * setiap langkahnya tetap tercatat di jejak audit operator.
 */
const licenceCount = z
  .string()
  .trim()
  .regex(/^\d{1,6}$/, vmsg("validation.licenceLimitInvalid"));

export const licenceDraftSchema = z.object({
  /** Kosong = customer baru; terisi = versi berikutnya customer itu. */
  customerId: z.string().regex(/^\d*$/),
  customer: z
    .string()
    .trim()
    .min(1, vmsg("validation.licenceCustomerRequired"))
    .max(200)
    /* Satu baris (kolom & argumen shell), dan bukan `--…`: skrip membaca
       argumen sesudah `--customer` apa adanya. */
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v) && !v.startsWith("-"), {
      message: vmsg("validation.licenceCustomerRequired"),
    }),
  maxCompanies: licenceCount,
  maxUsers: licenceCount,
  /** `all` atau daftar kunci berkoma — diurai ulang `parseModules` di server. */
  modules: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "all" || /^[a-z][a-z0-9_]*(\s*,\s*[a-z][a-z0-9_]*)*,?$/.test(v), {
      message: vmsg("validation.licenceModulesInvalid"),
    }),
  /** `YYYY-MM-DD` atau kosong = dukungan tanpa batas waktu. */
  supportEndsOn: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  maxVersion: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === "" || /^v?\d+(\.\d+){0,2}$/.test(v), {
      message: vmsg("validation.licenceVersionInvalid"),
    }),
  contact: z.string().trim().max(300),
  notes: z.string().trim().max(2000),
  sourceTenantId: z.string().trim().regex(/^\d{0,9}$/),
});
export type LicenceDraftFormInput = z.infer<typeof licenceDraftSchema>;

export const licenceUploadSchema = z.object({
  entryId: z.number().int().positive(),
  /** Isi berkas `.sai` — dibaca peramban sebagai teks. */
  fileText: z.string().min(1).max(16 * 1024),
});

export const licenceRevokeSchema = z.object({
  entryId: z.number().int().positive(),
  reason: operatorReasonField,
});
export type LicenceRevokeFormInput = z.infer<typeof licenceRevokeSchema>;

export const licenceEntryIdSchema = z.object({ entryId: z.number().int().positive() });

/* ── 10. Penanda lisensi di konsol (migration platform 0007) ──────────────── */

/**
 * Frasa sandi kunci penanda. Batas panjangnya SAMA dengan
 * `@sai/platform/licence-signing` (12–1024) — disalin sebagai angka, bukan
 * diimpor, karena skema ini juga dimuat peramban dan modul penanda tidak
 * boleh ikut ke bundel klien. `tests/licence-signing.test.ts` menyamakan
 * keduanya.
 */
export const LICENCE_PASSPHRASE_MIN = 12;
export const LICENCE_PASSPHRASE_MAX = 1024;

const licencePassphrase = z
  .string()
  .min(LICENCE_PASSPHRASE_MIN, vmsg("validation.licencePassphraseTooShort"))
  .max(LICENCE_PASSPHRASE_MAX, vmsg("validation.licencePassphraseTooLong"));

export const licenceKeyCreateSchema = z
  .object({ passphrase: licencePassphrase, confirm: z.string() })
  .refine((v) => v.passphrase === v.confirm, {
    path: ["confirm"],
    message: vmsg("validation.licencePassphraseMismatch"),
  });
export type LicenceKeyCreateInput = z.infer<typeof licenceKeyCreateSchema>;

export const licenceSignSchema = z.object({
  entryId: z.number().int().positive(),
  /* Tidak menuntut panjang minimum di sini: frasa yang salah harus dijawab
     "frasa salah", bukan pesan validasi yang membocorkan aturan bentuknya. */
  passphrase: z.string().min(1).max(LICENCE_PASSPHRASE_MAX),
});
