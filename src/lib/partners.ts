/**
 * PEMILIK / SEKUTU — aturan murni (bentuk usaha, keputusan pemilik 24 Okt 2026).
 *
 * Tanpa Prisma, tanpa React: validasi daftar sekutu, pembagian laba per porsi
 * (dengan aturan pembulatan yang DETERMINISTIK), dan penomoran akun modal/prive
 * per sekutu. Pemakainya: wisaya penyiapan, Pengaturan → Bentuk usaha, tutup
 * buku tahunan, dan templat bagan akun.
 */
import {
  equityModelFor,
  FULL_SHARE_BP,
  usesPartnerRoles,
  type LegalForm,
  type PartnerRole,
} from "@sai/core/legal-form";

/** Satu sekutu seperti yang diisi orang — sebelum akunnya ada. */
export interface PartnerDraft {
  name: string;
  role?: PartnerRole | null;
  /** Porsi laba dalam basis poin (10000 = 100%). */
  shareBp: number;
}

/**
 * Kode galat validasi — KUNCI kamus di bawah `legalForm.errors.*`, bukan
 * kalimat, supaya layar dan API menerjemahkannya ke bahasa pengguna.
 */
export type PartnerIssue =
  | "partnersRequired"
  | "partnersMinTwo"
  | "soleOwnerExactlyOne"
  | "partnerNameRequired"
  | "partnerNameDuplicate"
  | "partnerShareInvalid"
  | "partnerSharesNot100"
  | "cvNeedsActive"
  | "cvNeedsLimited"
  | "partnerRoleNotAllowed";

/**
 * Periksa daftar sekutu AKTIF untuk sebuah bentuk usaha.
 *
 * ── Aturannya, dan dari mana ─────────────────────────────────────────────
 *  • CV (KUHD Pasal 19): sedikitnya satu sekutu AKTIF (komplementer, yang
 *    mengurus dan bertanggung jawab penuh) DAN satu sekutu KOMANDITER (yang
 *    hanya menyetor modal). Tanpa keduanya ia bukan CV.
 *  • Firma (KUHD Pasal 16): persekutuan — sedikitnya dua sekutu, semuanya
 *    aktif; peran tidak dibedakan.
 *  • Usaha perorangan: tepat satu pemilik.
 *  • Porsi seluruh sekutu aktif TEPAT 100% (10000 basis poin). Bukan "kurang
 *    lebih": sisa porsi yang tidak dimiliki siapa pun adalah laba yang tidak
 *    punya tujuan saat tutup buku.
 *
 * PT/PT Perorangan/lainnya tidak memakai daftar ini — memulangkan `[]` untuk
 * daftar kosong, dan menolak daftar yang tidak kosong tidak perlu: pemanggil
 * yang tidak memakai sekutu memang tidak mengirimnya.
 */
/**
 * Usaha perorangan tanpa nama pemilik → satu pemilik "Pemilik" 100%.
 * Satu-satunya kasus yang boleh ditebak: pemiliknya memang satu dan porsinya
 * memang seluruhnya. Dipakai wisaya (sebelum validasi di peramban) DAN server
 * (`setup-equity.ts`), supaya keduanya menilai daftar yang sama.
 */
export function withSoleOwnerDefault<T extends PartnerDraft>(form: LegalForm, partners: readonly T[]): T[] {
  if (equityModelFor(form) === "sole_owner" && partners.length === 0) {
    return [{ name: "Pemilik", role: null, shareBp: FULL_SHARE_BP } as T];
  }
  return [...partners];
}

export function validatePartners(form: LegalForm, partners: readonly PartnerDraft[]): PartnerIssue[] {
  const model = equityModelFor(form);
  if (model === "retained_earnings") return [];

  const issues = new Set<PartnerIssue>();
  if (partners.length === 0) return ["partnersRequired"];
  if (model === "sole_owner" && partners.length !== 1) issues.add("soleOwnerExactlyOne");
  if (model === "partners" && partners.length < 2) issues.add("partnersMinTwo");

  const names = new Set<string>();
  let total = 0;
  for (const p of partners) {
    const name = p.name.trim();
    if (!name) issues.add("partnerNameRequired");
    const key = name.toLocaleLowerCase("id-ID");
    if (name && names.has(key)) issues.add("partnerNameDuplicate");
    names.add(key);
    if (!Number.isInteger(p.shareBp) || p.shareBp < 0 || p.shareBp > FULL_SHARE_BP) {
      issues.add("partnerShareInvalid");
    } else {
      total += p.shareBp;
    }
    if (p.role && !usesPartnerRoles(form)) issues.add("partnerRoleNotAllowed");
  }
  if (!issues.has("partnerShareInvalid") && total !== FULL_SHARE_BP) issues.add("partnerSharesNot100");

  if (usesPartnerRoles(form)) {
    if (!partners.some((p) => p.role === "aktif")) issues.add("cvNeedsActive");
    if (!partners.some((p) => p.role === "komanditer")) issues.add("cvNeedsLimited");
  }
  return [...issues];
}

/** Persen (boleh dua desimal, mis. 33,33) → basis poin. */
export function percentToBp(percent: number): number {
  return Math.round(percent * 100);
}

/** Basis poin → persen untuk tampilan (10000 → 100, 3333 → 33.33). */
export function bpToPercent(bp: number): number {
  return bp / 100;
}

/** Satu sekutu yang ikut pembagian laba. */
export interface ShareHolder {
  /** Identitas yang dikembalikan apa adanya (id baris, atau indeks). */
  key: number;
  shareBp: number;
  /** Urutan tampil/terdaftar — pemutus seri aturan sisa pembulatan. */
  sortOrder: number;
}

/**
 * Bagi `amountCents` (SEN, bilangan bulat, boleh negatif = rugi) menurut porsi.
 *
 * ══ ATURAN PEMBULATAN — DETERMINISTIK, DAN DITULIS DI SINI SATU KALI ═══════
 *   1. Bagian tiap sekutu = `trunc(amount × porsi ÷ 10000)` — dipotong ke arah
 *      NOL, sehingga laba dan rugi diperlakukan simetris (rugi −Rp 100,01 tidak
 *      menghasilkan bagian yang lebih besar dari laba Rp 100,01).
 *   2. SISA = amount − Σ bagian. Besarnya paling banyak (jumlah sekutu − 1)
 *      sen, bertanda sama dengan amount.
 *   3. Seluruh sisa diberikan kepada sekutu dengan PORSI TERBESAR; bila ada
 *      beberapa yang sama besar, kepada yang `sortOrder`-nya paling kecil
 *      (terdaftar paling awal), lalu `key` terkecil.
 *
 * Kenapa bukan "sisa terbesar" (metode Hamilton): hasilnya bisa berpindah
 * sekutu dari tahun ke tahun untuk porsi yang sama, sementara aturan di atas
 * selalu memberi sen yang sama kepada orang yang sama — dan itu yang bisa
 * dijelaskan kepada sekutu yang bertanya "kenapa bagian saya kurang satu sen".
 *
 * Jumlah hasilnya SELALU tepat `amountCents` — jurnal penutup seimbang secara
 * konstruksi, bukan kebetulan.
 */
export function allocateByShare(
  amountCents: number,
  holders: readonly ShareHolder[]
): { key: number; cents: number }[] {
  if (!Number.isInteger(amountCents)) throw new Error("allocateByShare: jumlah harus sen bulat.");
  if (holders.length === 0) throw new Error("allocateByShare: tidak ada sekutu.");
  const total = holders.reduce((s, h) => s + h.shareBp, 0);
  if (total !== FULL_SHARE_BP) {
    throw new Error(`allocateByShare: jumlah porsi ${total} basis poin, bukan ${FULL_SHARE_BP}.`);
  }

  const out = holders.map((h) => ({
    key: h.key,
    /* `+ 0` menormalkan −0 (rugi kecil × porsi kecil) — pola `planYearClose`. */
    cents: Math.trunc((amountCents * h.shareBp) / FULL_SHARE_BP) + 0,
  }));
  const remainder = amountCents - out.reduce((s, o) => s + o.cents, 0);
  if (remainder !== 0) {
    const winner = [...holders].sort(
      (a, b) => b.shareBp - a.shareBp || a.sortOrder - b.sortOrder || a.key - b.key
    )[0]!;
    const slot = out.find((o) => o.key === winner.key)!;
    slot.cents += remainder;
  }
  return out;
}

// ─── Penomoran akun per sekutu ────────────────────────────────────────────

/** Induk akun Modal per sekutu (CV/Firma, dan sekutu yang ditambah kemudian). */
export const PARTNER_CAPITAL_PARENT = { code: "3110", name: "Modal Sekutu" } as const;
/** Induk akun Prive per sekutu. */
export const PARTNER_DRAWING_PARENT = { code: "3120", name: "Prive Sekutu" } as const;

/**
 * Kode anak berikutnya yang belum dipakai di bawah `parentCode`: induk + dua
 * digit (3110 → 311001, 311002, …). Kode yang SUDAH ada di buku dilewati —
 * akun yang pernah dibuat untuk sekutu yang keluar tidak pernah dipakai ulang,
 * sebab riwayatnya milik orang lain.
 */
export function nextChildCode(parentCode: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = 1; n <= 99; n++) {
    const code = `${parentCode}${String(n).padStart(2, "0")}`;
    if (!used.has(code)) return code;
  }
  throw new Error(`Kode akun di bawah ${parentCode} sudah habis (99 sekutu).`);
}

/** Nama akun modal/prive seorang sekutu — dipotong ke panjang kolom akun. */
export function partnerAccountName(kind: "capital" | "drawing", partnerName: string): string {
  const prefix = kind === "capital" ? "Modal" : "Prive";
  return `${prefix} ${partnerName.trim()}`.slice(0, 100);
}
