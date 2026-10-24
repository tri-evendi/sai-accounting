/**
 * PERMINTAAN PENAWARAN / DEMO dari halaman publik (`lead_requests`, migration
 * platform 0016) — kosakata, batas, dan aturan MURNI.
 *
 * ══ KENAPA ADA ═════════════════════════════════════════════════════════════
 * Sampai tabel ini lahir, tombol "Minta penawaran" / "Jadwalkan demo" di
 * halaman depan mendarat di `/register` yang hanya memajang tombol WhatsApp dan
 * `mailto:`. Tidak ada yang tercatat: prospek yang menekan tombol lalu urung
 * mengirim pesan hilang tanpa jejak, dan pesan yang terkirim tersebar di
 * ponsel dan kotak surel orang yang kebetulan memegangnya. Sekarang formulirnya
 * mencatat satu baris yang dibaca konsol operator sebagai daftar kerja
 * (`/leads`), dan kedua tombol lama tetap ada di bawahnya sebagai jalan lain.
 *
 * MURNI: tanpa Prisma, tanpa zod, tanpa `next/*` — dipakai formulir publik
 * (klien + route), konsol operator, dan penjadwal (retensi). Skema zod-nya di
 * `src/lib/validations/lead.ts` (satu skema untuk formulir dan route).
 */

import { LEGAL_FORMS, type LegalForm } from "./legal-form";

/** Jenis kebutuhan — urutan ini juga urutan pilihan di formulir. */
export const LEAD_KINDS = ["demo", "quote", "question"] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

/**
 * Status daftar kerja. Kosakata Indonesia DI DATA dengan sengaja (keputusan
 * brief): ia dibaca tim penjualan apa adanya di jejak dan ekspor, dan ditutup
 * CHECK di migration.
 */
export const LEAD_STATUSES = ["baru", "dihubungi", "selesai", "spam"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Bentuk usaha yang boleh dipilih — kosakata `companies.legal_form`. */
export const LEAD_LEGAL_FORMS: readonly LegalForm[] = LEGAL_FORMS;

/** Batas panjang — dipakai skema, kolom `VARCHAR`, dan pemotong di server. */
export const LEAD_LIMITS = {
  name: 100,
  company: 150,
  /** Teks nomor seperti diketik (`+62 812-3456-7890`) sebelum dinormalkan. */
  phoneInput: 30,
  email: 191,
  message: 2000,
  /** Catatan operator — akumulasi; baris tertua dipotong bila melampaui. */
  notes: 4000,
  noteEntry: 500,
  source: 40,
  companyCountMax: 1000,
} as const;

/**
 * Sumber permintaan. `contact_page` = `/register` saat pendaftaran tertutup;
 * `quote` = `/register?quote=1` (harga publik disembunyikan). Tombol lain
 * boleh menyebut dirinya lewat `?from=<nama>` — nama itu disaring
 * `sanitizeLeadSource`, tidak pernah disimpan apa adanya.
 */
export const LEAD_DEFAULT_SOURCES = ["contact_page", "quote"] as const;

/**
 * Nama sumber dari parameter `?from=` — huruf kecil, angka, `_`, `-`, paling
 * panjang `LEAD_LIMITS.source`. Yang lain `null` (dan pemanggil memakai sumber
 * bawaannya): parameter URL adalah teks pilihan siapa pun yang menyusun
 * tautannya, dan ia mendarat di layar operator.
 */
export function sanitizeLeadSource(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v || v.length > LEAD_LIMITS.source) return null;
  return /^[a-z0-9][a-z0-9_-]*$/.test(v) ? v : null;
}

/* ─────────────────────────────── Nomor rujukan ─────────────────────────── */

/**
 * Huruf nomor rujukan — tanpa 0/O, 1/I/L, dan U: nomor ini DIBACAKAN lewat
 * telepon dan diketik ulang dari layar ponsel, dan dua huruf yang mirip adalah
 * nomor yang tidak pernah ketemu di konsol.
 */
export const LEAD_REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const LEAD_REFERENCE_PREFIX = "SAI-";
export const LEAD_REFERENCE_LENGTH = 6;
/** Bentuk lengkap — dipakai pencarian konsol untuk mengenali nomor rujukan. */
export const LEAD_REFERENCE_PATTERN = /^SAI-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/;

/**
 * Nomor rujukan baru: `SAI-7K3M9Q`. 30⁶ ≈ 729 juta kemungkinan — tabrakan
 * tetap mungkin, jadi keunikannya dijaga indeks UNIK dan penulis mencoba ulang
 * (`createLeadRequest`). `randomBytes` disuntik supaya bisa diuji.
 */
export function generateLeadReference(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(LEAD_REFERENCE_LENGTH);
  let out = "";
  for (let i = 0; i < LEAD_REFERENCE_LENGTH; i++) {
    /* Bias modulo 256 % 30 diabaikan dengan sadar: nomor ini rujukan, bukan
       rahasia — keunikannya dijaga basis data, bukan peluang. */
    out += LEAD_REFERENCE_ALPHABET[bytes[i]! % LEAD_REFERENCE_ALPHABET.length];
  }
  return `${LEAD_REFERENCE_PREFIX}${out}`;
}

/** Normalkan teks pencarian yang MUNGKIN nomor rujukan (`sai-7k3m9q`). */
export function normalizeLeadReference(raw: string): string | null {
  const v = raw.trim().toUpperCase();
  return LEAD_REFERENCE_PATTERN.test(v) ? v : null;
}

/* ─────────────────────────────── Peralihan status ──────────────────────── */

/**
 * Peralihan yang SAH. Semua status bisa ditandai `spam`; `selesai` bisa dibuka
 * lagi (`dihubungi`) karena prospek yang bilang "nanti dulu" sering kembali;
 * `spam` bisa dipulihkan ke `baru` karena salah tandai adalah keadaan yang
 * nyata. Yang tidak sah: kembali ke `baru` dari status yang sudah ditangani —
 * "baru" berarti BELUM ADA YANG MENGHUBUNGI, dan itu tidak bisa dibatalkan.
 */
export const LEAD_TRANSITIONS: Readonly<Record<LeadStatus, readonly LeadStatus[]>> = {
  baru: ["dihubungi", "selesai", "spam"],
  dihubungi: ["selesai", "spam"],
  selesai: ["dihubungi", "spam"],
  spam: ["baru"],
};

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value);
}

export function isLeadKind(value: unknown): value is LeadKind {
  return typeof value === "string" && (LEAD_KINDS as readonly string[]).includes(value);
}

export function leadTransitionAllowed(from: string, to: string): boolean {
  return isLeadStatus(from) && isLeadStatus(to) && LEAD_TRANSITIONS[from].includes(to);
}

/* ─────────────────────────────── Catatan operator ──────────────────────── */

/**
 * Tambahkan satu catatan ke kolom `notes` — baris baru di ATAS, berstempel
 * tanggal dan nama operator. Bila total melampaui batas, baris TERTUA yang
 * dibuang (bukan catatan barunya): yang paling berguna bagi orang berikutnya
 * adalah apa yang terakhir terjadi.
 */
export function appendLeadNote(
  existing: string | null,
  entry: { operator: string; text: string; at: Date }
): string {
  const text = entry.text.replace(/\s+/g, " ").trim().slice(0, LEAD_LIMITS.noteEntry);
  const line = `[${entry.at.toISOString().slice(0, 16).replace("T", " ")} UTC · ${entry.operator}] ${text}`;
  const lines = [line, ...(existing ? existing.split("\n") : [])];
  while (lines.length > 1 && lines.join("\n").length > LEAD_LIMITS.notes) lines.pop();
  return lines.join("\n").slice(0, LEAD_LIMITS.notes);
}

/* ─────────────────────────────── Retensi (UU PDP) ──────────────────────── */

/**
 * Retensi data pribadi lead (`docs/TATA-KELOLA.md` §6):
 *   • `selesai` / `spam` → dianonimkan 12 bulan sesudah `handled_at`;
 *   • `baru` / `dihubungi` yang terbengkalai → 24 bulan sesudah `created_at`.
 * Yang tersisa sesudahnya hanya statistik corong (jenis, bentuk usaha, jumlah
 * perusahaan, sumber, status, tanggal) — tanpa nama, nomor, surel, pesan,
 * catatan, maupun sidik IP.
 */
export const LEAD_RETENTION = {
  closedMonths: 12,
  openMonths: 24,
} as const;

/** Nilai pengganti kolom wajib saat dianonimkan. */
export const LEAD_ANONYMIZED_MARK = "(dihapus)";

function mundurBulan(now: Date, bulan: number): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - bulan);
  return d;
}

export function leadRetentionCutoffs(now: Date): { closedBefore: Date; openBefore: Date } {
  return {
    closedBefore: mundurBulan(now, LEAD_RETENTION.closedMonths),
    openBefore: mundurBulan(now, LEAD_RETENTION.openMonths),
  };
}
