/**
 * Bentuk badan & muatan tiga laporan yang dulu digambar PERAMBAN.
 *
 * ══ BADANNYA PARAMETER, MUATANNYA DIHITUNG SERVER ═════════════════════════
 * Sampai tahap 1c ditutup, tombolnya mengirim MUATAN jadi (seluruh daftar
 * barang, seluruh buku kas) dan rute hanya menggambarnya. Sekarang tombolnya
 * mengirim PARAMETER — saringan halaman Kas & Bank, tanggal & pilihan
 * hitung-buta lembar opname, dan untuk Laporan Stok tidak ada sama sekali —
 * dan muatannya dihitung di server oleh pembaca yang SAMA dengan halamannya
 * (`src/lib/report-pdf-payload.ts`).
 *
 * Dua alasan, dan keduanya dari 09 §5:
 *
 *   • laporan besar bisa DISERAHKAN ke antrean. Pekerjaan hidup di basis data
 *     KENDALI dan hanya boleh membawa parameter (#104); muatan tanpa asal
 *     tidak bisa dihitung ulang siapa pun;
 *   • angka di atas kertas tidak lagi ditentukan apa yang dikirim peramban.
 *
 * Skema muatan di bawah TETAP ada: ia bentuk yang dimakan generatornya, dan
 * tes memakainya untuk membuktikan muatan server sama dengan yang dulu dirakit
 * peramban.
 *
 * ⚠ Skema parameter `.strict()`. Tab lama yang masih memegang tombol versi
 * sebelumnya mengirim `{ items }` / `{ balances, transactions }`; tanpa
 * `.strict()` badan itu lolos sebagai "tanpa saringan" dan mencetak laporan
 * yang BERBEDA dari layarnya tanpa satu galat pun. Dengan `.strict()` ia
 * dijawab 400, dan muat ulang halaman memperbaikinya.
 */
import { z } from "zod";

/* Kosakata bebas yang tetap dibatasi PANJANGNYA: ia mendarat di atas kertas,
   dan string 10 MB berisi satu nama barang adalah cara termurah membuat
   perakitan PDF menghabiskan memori proses. */
const teks = (maks: number) => z.string().max(maks);
const nomor = z.number().finite();

/** Satu baris lembar stok — bentuk `ClientInventoryItem` yang DIPAKAI generatornya. */
const stockItemSchema = z.object({
  id: z.number().int(),
  code: teks(60),
  name: teks(200),
  unit: teks(30).nullable(),
  totalIn: nomor,
  totalOut: nomor,
  currentStock: nomor,
  movementCount: z.number().int(),
  unitCost: nomor.nullable(),
  stockValue: nomor.nullable(),
});

export const stockReportPayloadSchema = z.object({
  items: z.array(stockItemSchema),
});

export const opnameSheetPayloadSchema = z.object({
  items: z.array(
    z.object({ name: teks(200), unit: teks(30).nullable(), currentStock: nomor })
  ),
  /* `date` dicetak apa adanya di kepala lembarnya — ia sudah diformat halaman
     yang memintanya, dan memformat ulang di sini berarti dua pemformat untuk
     satu tanggal. */
  date: teks(40),
  showSystemQty: z.boolean(),
});

export const financeReportPayloadSchema = z.object({
  balances: z.array(
    z.object({
      type: teks(40),
      currency: teks(10),
      debit: nomor,
      credit: nomor,
      balance: nomor,
    })
  ),
  transactions: z.array(
    z.object({
      date: teks(40),
      type: teks(40),
      description: teks(500),
      currency: teks(10),
      debit: nomor,
      credit: nomor,
    })
  ),
});

/* ── Parameter (badan permintaan) ──────────────────────────────────────── */

/** Laporan Stok tidak punya parameter: halamannya memang tanpa periode. */
export const stockReportParamsSchema = z.object({}).strict();

export const opnameSheetParamsSchema = z
  .object({
    /* Dicetak apa adanya di kepala lembarnya — ia sudah diformat formulir yang
       memintanya, dan memformat ulang di sini berarti dua pemformat untuk satu
       tanggal. */
    date: teks(40),
    showSystemQty: z.boolean(),
  })
  .strict();

/* Saringan halaman Kas & Bank, dengan bunyi yang SAMA dengan URL-nya. Nilai
   yang tak sah tidak ditolak di sini — `financeFilter` memperlakukannya persis
   seperti halaman (diabaikan), supaya alamat yang diedit tangan tidak mencetak
   laporan yang berbeda dari layarnya. */
const saringan = teks(40).optional();
export const financeReportParamsSchema = z
  .object({ type: saringan, currency: saringan, year: saringan, month: saringan })
  .strict();

export type StockReportParams = z.infer<typeof stockReportParamsSchema>;
export type OpnameSheetParams = z.infer<typeof opnameSheetParamsSchema>;
export type FinanceReportParams = z.infer<typeof financeReportParamsSchema>;

export type StockReportPayload = z.infer<typeof stockReportPayloadSchema>;
export type OpnameSheetPayload = z.infer<typeof opnameSheetPayloadSchema>;
export type FinanceReportPayload = z.infer<typeof financeReportPayloadSchema>;
