/**
 * Kabar "faktur jatuh tempo" — aturan yang menentukan APA yang diberitahukan,
 * KAPAN, dan SEBERAPA SERING.
 *
 * Murni: masukannya baris piutang yang sudah dihitung `getReceivables()`,
 * keluarannya rencana pemberitahuan siap tulis. Tidak menyentuh basis data,
 * tidak tahu siapa penerimanya — supaya seluruh aturan yang mudah salah bisa
 * diuji tanpa satu pun perusahaan sungguhan (`tests/invoice-due-digest.test.ts`).
 *
 * ══ RINGKASAN, BUKAN SATU KABAR PER FAKTUR ══════════════════════════════════
 * Satu pemberitahuan per faktur terdengar paling informatif sampai sebuah PT
 * dengan 80 faktur tertunggak menyalakannya: 80 baris × setiap anggota, sekali
 * jalan, dan kotak masuk yang isinya 80 baris sama saja dengan kotak masuk
 * kosong — tak seorang pun membacanya sampai habis. Yang dikirim karena itu
 * RINGKASAN: berapa faktur, berapa rupiah, mana yang terlama, lalu satu tautan
 * ke halaman Piutang yang memang dibuat untuk menjawab sisanya.
 *
 * ══ DUA JENIS, KARENA DUA PERTANYAAN YANG BERBEDA ═══════════════════════════
 *   • `invoice_due_soon` — "akan jatuh tempo" (≤ 3 hari lagi, termasuk hari
 *     ini). Ini kabar untuk MENAGIH, dan gunanya habis begitu tanggalnya lewat.
 *   • `invoice_overdue`  — "sudah lewat". Ini kabar untuk MENGEJAR, dan ia
 *     tetap benar setiap hari sampai tertagih.
 * Mencampur keduanya di satu jenis berarti kunci dedupe yang sama menjawab dua
 * pertanyaan dengan cadensi yang berbeda — dan yang satu akan menelan yang lain.
 *
 * ══ CADENSI HIDUP DI BENTUK KUNCI DEDUPE ════════════════════════════════════
 * Doktrin `lib/notifications.ts`: produser boleh berjalan tiap jam, yang
 * menentukan seberapa sering kabar berulang adalah BENTUK `dedupeKey`-nya.
 *
 *   • akan jatuh tempo → `company:<id>:soon:<TANGGAL JATUH TEMPO>`
 *     Kuncinya tanggal jatuh temponya SENDIRI, bukan tanggal hari ini. Kalau
 *     hari ini yang dipakai, faktur yang jatuh tempo 25 Agu akan berbunyi pada
 *     22, 23, 24, dan 25 — empat kali untuk satu tanggal yang sama. Dengan
 *     tanggal jatuh tempo sebagai kunci, tiap tanggal berbunyi TEPAT sekali.
 *   • lewat jatuh tempo → `company:<id>:overdue:<TAHUN-Wpekan>`
 *     Sekali per pekan selama masih ada yang tertunggak. Harian mengomel;
 *     sekali seumur hidup dilupakan pada hari kedua. Pekanan adalah satu-satunya
 *     cadensi yang bertahan untuk keadaan yang memang bisa berbulan-bulan.
 *
 * ══ YANG TIDAK PUNYA NILAI RUPIAH TIDAK DIJUMLAHKAN ═════════════════════════
 * Faktur valas tanpa kurs tidak punya nilai IDR (`outstandingBase === null`,
 * lihat kepala `lib/receivables.ts`). Ia tetap DIHITUNG sebagai faktur dan
 * disebut apa adanya di badan kabar, tapi tidak pernah ikut dijumlahkan pada
 * face value — persis aturan yang dipegang halaman Piutang.
 *
 * ══ FAKTUR SAJA, BUKAN KONTRAK ══════════════════════════════════════════════
 * `getReceivables()` juga memulangkan kontrak yang berjatuh tempo. Sengaja
 * tidak ikut: kabarnya menyebut kata "faktur", dan menyebut sebuah kontrak
 * sebagai faktur adalah salah — bukan sekadar longgar. Menambahkannya nanti
 * berarti jenis ketiga dengan kosakatanya sendiri, bukan melonggarkan saringan
 * di sini.
 */
import { ageInDays, type PaymentStatus } from "@/lib/receivables";
import { formatCurrency, formatDateMedium } from "@/lib/utils";

/** Jenis pemberitahuan yang diterbitkan modul ini. Harus ada di
 *  `NOTIFICATION_KINDS` — dijaga `tests/invoice-due-digest.test.ts`. */
export const INVOICE_DUE_KINDS = ["invoice_due_soon", "invoice_overdue"] as const;
export type InvoiceDueKind = (typeof INVOICE_DUE_KINDS)[number];

/**
 * Seberapa jauh ke depan "akan jatuh tempo" memandang, dalam hari.
 *
 * Tiga hari, bukan tujuh: pengingat yang datang sepekan sebelumnya akan
 * dibaca lalu dilupakan sebelum tanggalnya tiba, dan tidak ada kabar kedua
 * (kuncinya tanggal jatuh tempo — sekali per tanggal, selamanya).
 */
export const DUE_SOON_DAYS = 3;

/** Berapa nomor dokumen yang disebut namanya sebelum sisanya diringkas. */
const MAKS_DISEBUT = 3;

/* Batas kolom `notifications` (VarChar 150 / 1000). Dipotong DI SINI, bukan
   dibiarkan sampai ke DB: nama PT yang panjang plus daftar nomor dokumen bisa
   melewatinya, dan MariaDB dengan sql_mode ketat akan MENOLAK barisnya — satu
   perusahaan dengan nama panjang membuat kabarnya hilang tanpa jejak. */
const BATAS_JUDUL = 150;
const BATAS_BADAN = 1000;

/** Satu faktur, sebagaimana `getReceivables()` sudah menghitungnya. */
export interface DueInvoiceRow {
  documentNo: string;
  partyName: string;
  dueDate: Date | null;
  /** Sisa tagihan dalam IDR; `null` = valas tanpa kurs, tak punya nilai rupiah. */
  outstandingBase: number | null;
  status: PaymentStatus;
}

export interface InvoiceDueDigest {
  kind: InvoiceDueKind;
  dedupeKey: string;
  title: string;
  body: string;
  href: string;
}

export interface DigestInput {
  companyId: number;
  companyName: string;
  /** Awalan jalur bertenant perusahaan ini, mis. `/t/acme/pt-a` (tanpa `/` akhir). */
  basePath: string;
  invoices: readonly DueInvoiceRow[];
  asOf: Date;
}

function potong(teks: string, batas: number): string {
  return teks.length <= batas ? teks : `${teks.slice(0, batas - 1)}…`;
}

/** `YYYY-MM-DD` waktu setempat — kunci hari, bukan cap waktu. */
export function hariKunci(date: Date): string {
  const dua = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${dua(date.getMonth() + 1)}-${dua(date.getDate())}`;
}

/**
 * Kunci pekan ISO-8601 (`2026-W34`).
 *
 * ISO dan bukan "hari ke-N dibagi tujuh" karena yang kedua menggeser batas
 * pekannya setiap pergantian tahun — dan pergantian tahun adalah persis saat
 * sebuah tunggakan paling mungkin masih menganggur.
 */
export function pekanKunci(date: Date): string {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const hari = t.getUTCDay() || 7; // Senin=1 … Minggu=7
  t.setUTCDate(t.getUTCDate() + 4 - hari); // Kamis menentukan tahun pekan itu
  const tahun = t.getUTCFullYear();
  const jan1 = Date.UTC(tahun, 0, 1);
  const pekan = Math.ceil(((t.getTime() - jan1) / 86_400_000 + 1) / 7);
  return `${tahun}-W${String(pekan).padStart(2, "0")}`;
}

/** Jumlah rupiah + berapa baris yang memang tak punya nilai rupiah. */
function jumlahkan(rows: readonly DueInvoiceRow[]): { total: number; tanpaKurs: number } {
  let total = 0;
  let tanpaKurs = 0;
  for (const r of rows) {
    if (r.outstandingBase == null) tanpaKurs += 1;
    else total += r.outstandingBase;
  }
  return { total: Math.round(total * 100) / 100, tanpaKurs };
}

/** "INV-1, INV-2, INV-3, dan 4 lainnya" */
function sebutkan(rows: readonly DueInvoiceRow[]): string {
  const disebut = rows.slice(0, MAKS_DISEBUT).map((r) => r.documentNo);
  const sisa = rows.length - disebut.length;
  return sisa > 0 ? `${disebut.join(", ")}, dan ${sisa} lainnya` : disebut.join(", ");
}

function kalimatTanpaKurs(tanpaKurs: number): string {
  return tanpaKurs > 0
    ? ` ${tanpaKurs} faktur valas tanpa kurs tidak ikut dijumlahkan — nilainya dalam rupiah belum diketahui.`
    : "";
}

/**
 * Rencana pemberitahuan untuk satu perusahaan. Kosong = memang tidak ada kabar,
 * dan itu keadaan yang paling sering — produser tidak menulis apa pun.
 */
export function planInvoiceDueDigests(input: DigestInput): InvoiceDueDigest[] {
  const { companyId, companyName, basePath, asOf } = input;

  /* Yang lunas bukan kabar, dan yang tanpa tanggal jatuh tempo TIDAK BOLEH
     dijadikan kabar: `due_date` NULL berarti tak diketahui, bukan hari ini
     (lihat `lib/receivables.ts` — alarm "Jatuh Tempo" palsu adalah bug yang
     sengaja dihindari sejak #12). */
  const terbuka = input.invoices.filter(
    (r): r is DueInvoiceRow & { dueDate: Date } => r.dueDate != null && r.status !== "paid"
  );

  const digests: InvoiceDueDigest[] = [];

  // ── Akan jatuh tempo: satu kabar per TANGGAL jatuh tempo ──────────────────
  const perTanggal = new Map<string, (DueInvoiceRow & { dueDate: Date })[]>();
  for (const r of terbuka) {
    const umur = ageInDays(r.dueDate, asOf); // > 0 = sudah lewat
    if (umur > 0 || umur < -DUE_SOON_DAYS) continue;
    const kunci = hariKunci(r.dueDate);
    const daftar = perTanggal.get(kunci);
    if (daftar) daftar.push(r);
    else perTanggal.set(kunci, [r]);
  }

  for (const kunci of [...perTanggal.keys()].sort()) {
    const rows = perTanggal.get(kunci)!;
    const { total, tanpaKurs } = jumlahkan(rows);
    const tanggal = formatDateMedium(rows[0].dueDate);
    const hariIni = hariKunci(asOf) === kunci;
    digests.push({
      kind: "invoice_due_soon",
      dedupeKey: `company:${companyId}:soon:${kunci}`,
      title: potong(
        `${companyName}: ${rows.length} faktur jatuh tempo ${hariIni ? "hari ini" : tanggal}`,
        BATAS_JUDUL
      ),
      body: potong(
        `${formatCurrency(total)} akan jatuh tempo ${hariIni ? `hari ini (${tanggal})` : `pada ${tanggal}`} — ` +
          `${sebutkan(rows)}.${kalimatTanpaKurs(tanpaKurs)} ` +
          `Tagih sekarang selagi belum menjadi tunggakan.`,
        BATAS_BADAN
      ),
      href: `${basePath}/receivables`,
    });
  }

  // ── Sudah lewat: SATU kabar untuk seluruhnya, sekali per pekan ────────────
  const lewat = terbuka
    .map((r) => ({ row: r, umur: ageInDays(r.dueDate, asOf) }))
    .filter((x) => x.umur > 0)
    .sort((a, b) => b.umur - a.umur); // terlama lebih dulu

  if (lewat.length > 0) {
    const rows = lewat.map((x) => x.row);
    const { total, tanpaKurs } = jumlahkan(rows);
    const terlama = lewat[0];
    digests.push({
      kind: "invoice_overdue",
      dedupeKey: `company:${companyId}:overdue:${pekanKunci(asOf)}`,
      title: potong(`${companyName}: ${rows.length} faktur lewat jatuh tempo`, BATAS_JUDUL),
      body: potong(
        `Tunggakan ${formatCurrency(total)} dari ${rows.length} faktur. ` +
          `Terlama ${terlama.row.documentNo} (${terlama.row.partyName}), ` +
          `${terlama.umur} hari lewat jatuh tempo.${kalimatTanpaKurs(tanpaKurs)}`,
        BATAS_BADAN
      ),
      href: `${basePath}/receivables?overdue=1`,
    });
  }

  return digests;
}
