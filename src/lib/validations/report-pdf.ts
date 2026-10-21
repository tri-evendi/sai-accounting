/**
 * Bentuk muatan untuk tiga laporan yang dulu digambar PERAMBAN.
 *
 * ══ KENAPA LAPORAN MEMAKAI MUATAN, SEMENTARA DOKUMEN MEMAKAI ID ════════════
 * Pembelahannya bukan selera, dan ia satu pertanyaan: **siapa yang menerima
 * kertasnya.**
 *
 *   • **Dokumen** (faktur, kontrak, surat jalan, retur) diserahkan ke pihak
 *     LUAR dan disimpan sebagai bukti. Rutenya karena itu menerima ID dan
 *     memuat barisnya sendiri — syarat audit §5 baru berarti sesuatu bila angka
 *     di atas kertas bukan angka yang dikirim peramban.
 *
 *   • **Laporan** di berkas ini dicetak oleh orang yang sedang MENATAPNYA, dari
 *     halaman yang angkanya sudah dihitung server. Yang harus dijamin justru
 *     kebalikannya: kertasnya sama dengan LAYARNYA. Menghitung ulang di rute
 *     membuka celah di mana cetakan berbeda dari layar karena satu transaksi
 *     masuk di antaranya — dan orang yang mencetaknya tidak akan pernah tahu.
 *
 * Presedennya `statementPayloadSchema`, yang sudah berlaku sejak laporan
 * keuangan pindah: muatan, bukan ID.
 *
 * ⚠ Konsekuensinya diterima dengan sadar: muatan datang dari klien, jadi
 * seseorang bisa mencetak lembar stok dengan angka yang ia karang sendiri. Yang
 * membuat itu bukan kerugian: ketiga laporan ini TIDAK dikirim ke siapa pun dan
 * tidak pernah menjadi bukti — dan siapa pun yang mau mengarang angka sudah
 * bisa melakukannya dengan mengedit PDF-nya sesudah dicetak. Yang dijaga rute
 * ini adalah apa yang bisa dijaganya: izin, batas ukuran, dan bentuk.
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

export type StockReportPayload = z.infer<typeof stockReportPayloadSchema>;
export type OpnameSheetPayload = z.infer<typeof opnameSheetPayloadSchema>;
export type FinanceReportPayload = z.infer<typeof financeReportPayloadSchema>;
