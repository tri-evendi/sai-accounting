/**
 * Pengingat jatuh tempo KE PELANGGAN — aturannya, sebagai fungsi murni
 * (issue #467).
 *
 * ══ KENAPA BUKAN RINGKASAN, PADAHAL #12 SUDAH MEMBUKTIKAN RINGKASAN BENAR ═══
 * `invoice-due-digest.ts` sengaja MERINGKAS: kotak masuk berisi 80 baris sama
 * tak terbacanya dengan kotak masuk kosong. Alasan itu berlaku untuk kabar ke
 * DALAM kantor, tempat satu orang memikul seluruh piutang perusahaan.
 *
 * Ia terbalik di luar kantor. Seorang pelanggan hanya memikul fakturnya
 * sendiri, dan surel yang berbunyi "Anda punya 3 tagihan senilai Rp 42 juta"
 * memaksa penerimanya membuka arsip untuk tahu yang mana. Yang berguna justru
 * yang spesifik: faktur ini, nominal ini, tanggal ini. Jadi satu pengingat per
 * FAKTUR — dan alasan yang membuat ringkasan benar di sana adalah alasan yang
 * sama yang membuatnya salah di sini.
 *
 * ══ TIGA TITIK, DAN KENAPA HANYA TIGA ═══════════════════════════════════════
 *   • H-3  — sopan, sebelum jatuh tempo. Ini yang paling sering benar-benar
 *            mencegah tunggakan: kebanyakan pelanggan tidak menunda, mereka lupa.
 *   • H+1  — pemberitahuan. Nadanya masih netral.
 *   • H+7  — susulan.
 * Titik keempat dan seterusnya adalah keputusan hubungan dagang, bukan
 * keputusan teknis, dan tempatnya bukan di sini.
 *
 * ══ MASA TOLERANSI, DAN KENAPA IA YANG MENJAGA HARI PERTAMA ═════════════════
 * Sebuah titik berbunyi bila HARI INI berada di antara tanggal pemicunya dan
 * `GRACE_DAYS` sesudahnya. Dua sifat sekaligus, dan yang kedua yang menentukan:
 *
 *   1. Penjadwal yang mati semalam tidak menghanguskan pengingat hari itu.
 *   2. **Menyalakan fitur ini tidak menerbitkan ledakan surel.** Buku dengan 80
 *      faktur tertunggak sejak berbulan-bulan lalu tidak menghasilkan 80 (atau
 *      240) kiriman pada putaran pertama: tanggal pemicu mereka sudah jauh di
 *      luar jendela. Yang tertangkap hanya yang pemicunya memang beberapa hari
 *      terakhir. Tanpa jendela ini, "aktifkan" menjadi tombol yang mengirim
 *      ratusan surel ke pelanggan sungguhan dalam satu tekanan.
 *
 * ══ MURNI ══════════════════════════════════════════════════════════════════
 * Tanpa Prisma, tanpa surel, tanpa `Date.now()` implisit — hari ini SELALU
 * dioper. Seluruh aturan yang mudah salah karena itu bisa diuji tanpa satu pun
 * perusahaan sungguhan, sama seperti `invoice-due-digest.ts`.
 */

import { translate, type Dictionary } from "@/lib/i18n/dictionary";

/** Satu titik pengingat: kunci tersimpan + geseran hari dari jatuh tempo. */
export interface ReminderPoint {
  key: ReminderPointKey;
  /** Negatif = sebelum jatuh tempo. */
  offsetDays: number;
}

export type ReminderPointKey = "before_3" | "after_1" | "after_7";

export const REMINDER_POINTS: readonly ReminderPoint[] = [
  { key: "before_3", offsetDays: -3 },
  { key: "after_1", offsetDays: 1 },
  { key: "after_7", offsetDays: 7 },
] as const;

/**
 * Berapa hari sesudah tanggal pemicu sebuah pengingat masih boleh menyusul.
 *
 * 2 hari: cukup untuk menyelamatkan satu malam penjadwal yang mati, dan cukup
 * pendek supaya menyalakan fitur ini tidak menyapu tunggakan lama.
 */
export const GRACE_DAYS = 2;

const POINT_KEYS = new Set<string>(REMINDER_POINTS.map((p) => p.key));

/**
 * Daftar titik aktif dari kolom `reminder_points`.
 *
 * NULL/kosong = SEMUA titik — pola yang sama dengan `enabled_modules`. Aman
 * karena `reminder_enabled` yang menjaga pintunya; daftar ini tidak pernah
 * dibaca sebelum seseorang menyalakan sakelar induknya.
 *
 * Token asing DIABAIKAN, bukan membuat seluruh barisnya ditolak: satu ejaan
 * yang salah di kolom teks tidak boleh mematikan pengingat yang lain.
 */
export function parseReminderPoints(raw: string | null | undefined): ReminderPoint[] {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return [...REMINDER_POINTS];
  const wanted = new Set(
    trimmed
      .split(",")
      .map((t) => t.trim())
      .filter((t) => POINT_KEYS.has(t))
  );
  return REMINDER_POINTS.filter((p) => wanted.has(p.key));
}

/** Bentuk simpan — selalu dalam urutan deklarasi, jadi kolomnya stabil. */
export function serializeReminderPoints(keys: readonly string[]): string {
  const wanted = new Set(keys);
  return REMINDER_POINTS.filter((p) => wanted.has(p.key))
    .map((p) => p.key)
    .join(",");
}

/** Faktur sebagaimana dibutuhkan penjadwalan — tidak lebih. */
export interface ReminderCandidate {
  invoiceId: number;
  /** NULL = tak ada jatuh tempo → TIDAK PERNAH diingatkan (lihat di bawah). */
  dueDate: Date | null;
  /** Alamat surel pelanggan; kosong → dilewati dengan tenang. */
  email: string | null;
}

export interface PlannedReminder {
  invoiceId: number;
  point: ReminderPointKey;
  /** Tanggal jatuh tempo acuan, ISO `YYYY-MM-DD` — kunci idempotensinya. */
  dueKey: string;
}

/** Tengah malam UTC dari sebuah tanggal — perbandingan hari, bukan jam. */
function dayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` dari sebuah tanggal (UTC). */
export function dueKeyOf(dueDate: Date): string {
  return new Date(dayStart(dueDate)).toISOString().slice(0, 10);
}

/**
 * Pengingat yang PANTAS dikirim hari ini.
 *
 * Yang TIDAK dihasilkan, dan alasannya masing-masing:
 *
 *   • **Faktur tanpa tanggal jatuh tempo.** Tanggal yang dikarang menghasilkan
 *     tagihan yang menuduh pelanggan terlambat terhadap kesepakatan yang tidak
 *     pernah ada. Aturan yang sama dengan `deriveStatus` di `receivables.ts`:
 *     tanpa jatuh tempo, tidak ada kata "terlambat".
 *   • **Faktur tanpa alamat surel pelanggan.** Dilewati dengan TENANG — bukan
 *     galat, dan alamatnya tidak pernah ditebak dari mana pun.
 *   • **Faktur yang tidak lagi tertunggak.** Tidak disaring di sini: pemanggil
 *     hanya mengoper yang memang masih terbuka (`getReceivables`). Menagih
 *     tagihan yang sudah dibayar merusak hubungan lebih cepat daripada tidak
 *     menagih sama sekali, jadi sumbernya harus perhitungan piutang yang
 *     sesungguhnya — bukan kolom `status` yang bisa basi.
 *
 * `sudahTerkirim` berisi kunci `"<invoiceId>:<point>:<dueKey>"` yang sudah ada
 * di riwayat. Ia SARINGAN KEDUA, bukan satu-satunya: yang benar-benar menjaga
 * adalah kunci unik di basis data. Yang ini hanya menghemat pekerjaan.
 */
export function planInvoiceReminders(input: {
  /**
   * Namanya `candidates`, bukan `invoices` — dan itu bukan selera: penjaga
   * kunci yatim membaca `input.invoices` sebagai "seluruh cabang kamus
   * `invoices` diambil utuh", lalu melebarkan lubangnya untuk ratusan kunci
   * yang seharusnya tetap dijaga satu per satu
   * (`tests/i18n-orphan-keys.test.ts`).
   */
  candidates: readonly ReminderCandidate[];
  today: Date;
  points: readonly ReminderPoint[];
  sudahTerkirim?: ReadonlySet<string>;
}): PlannedReminder[] {
  const today = dayStart(input.today);
  const sent = input.sudahTerkirim ?? new Set<string>();
  const out: PlannedReminder[] = [];

  for (const invoice of input.candidates) {
    if (!invoice.dueDate) continue;
    if (!invoice.email?.trim()) continue;

    const due = dayStart(invoice.dueDate);
    const dueKey = dueKeyOf(invoice.dueDate);

    for (const point of input.points) {
      const trigger = due + point.offsetDays * DAY_MS;
      if (today < trigger) continue;
      if (today > trigger + GRACE_DAYS * DAY_MS) continue;
      if (sent.has(reminderKey(invoice.invoiceId, point.key, dueKey))) continue;
      out.push({ invoiceId: invoice.invoiceId, point: point.key, dueKey });
    }
  }

  return out;
}

/** Kunci gabungan yang dipakai `sudahTerkirim` — satu bentuk, satu tempat. */
export function reminderKey(invoiceId: number, point: string, dueKey: string): string {
  return `${invoiceId}:${point}:${dueKey}`;
}

/* ── Kalimatnya ─────────────────────────────────────────────────────────────── */

/**
 * Badan pengingat, dirakit dari kamus.
 *
 * Kamusnya DIOPER, tidak dibaca dari cookie: pengirimnya penjadwal `tsx` di
 * luar Next, yang tidak punya permintaan HTTP maupun cookie bahasa. Pemanggil
 * yang memutuskan bahasa mana (penjadwal memakai bahasa bawaan aplikasi).
 *
 * Nadanya menaik seperlunya dan berhenti di situ: H-3 mengingatkan, H+1
 * memberi tahu, H+7 menyusul. Tidak ada ancaman, tidak ada denda, tidak ada
 * huruf kapital — surel dari sebuah sistem yang mewakili pemiliknya, dan yang
 * menanggung akibat nada yang salah adalah hubungan dagang pemiliknya.
 */
/**
 * Kunci kamus per titik, ditulis UTUH.
 *
 * Merakitnya (`` `invoiceReminder.body.${point}` ``) lebih pendek dan justru
 * itulah masalahnya: kunci yang dirakit tidak terlihat oleh penjaga kunci
 * yatim (`tests/i18n-orphan-keys.test.ts`), sehingga keenam kalimat ini akan
 * terbaca sebagai kamus mati dan ikut tercabut pada pembersihan berikutnya —
 * meninggalkan pengingat yang mengirim string kosong ke pelanggan.
 */
const MESSAGE_KEYS: Record<ReminderPointKey, { subject: string; body: string }> = {
  before_3: { subject: "invoiceReminder.subject.before_3", body: "invoiceReminder.body.before_3" },
  after_1: { subject: "invoiceReminder.subject.after_1", body: "invoiceReminder.body.after_1" },
  after_7: { subject: "invoiceReminder.subject.after_7", body: "invoiceReminder.body.after_7" },
};

export function buildReminderMessage(input: {
  dictionary: Dictionary;
  point: ReminderPointKey;
  invoiceNo: string;
  customerName: string | null;
  /** Nominal yang SUDAH diformat — pemformatan uang bukan urusan modul ini. */
  amountText: string;
  /** Jatuh tempo yang sudah diformat. */
  dueDateText: string;
  companyName: string;
}): { subject: string; text: string } {
  /* `translate` menerima kunci sebagai string biasa — sengaja, sebab kunci di
     sini disusun dari nama titiknya (`…body.after_7`) dan tipe kunci literal
     tidak bisa dibentuk dari potongan. Kelengkapan kuncinya dijaga tes i18n. */
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(input.dictionary, key, params);

  const keys = MESSAGE_KEYS[input.point];
  const subject = t(keys.subject, {
    no: input.invoiceNo,
    company: input.companyName,
  });

  const lines = [
    t("invoiceReminder.greeting", { name: input.customerName ?? "" }).trim(),
    "",
    t(keys.body, {
      no: input.invoiceNo,
      amount: input.amountText,
      date: input.dueDateText,
    }),
    "",
    t("invoiceReminder.closing"),
    input.companyName,
  ];

  return { subject, text: lines.join("\n") };
}
