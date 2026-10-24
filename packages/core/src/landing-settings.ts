/**
 * TAMPILAN HALAMAN DEPAN — INTI MURNI (tabel platform `landing_settings`,
 * konsol `/landing`).
 *
 * Tanpa Prisma, tanpa `server-only`, tanpa `next/*`: diimpor pembaca di
 * aplikasi customer, server action konsol, DAN formulir client konsol, supaya
 * ketiganya memakai SATU aturan tentang apa yang sah.
 *
 * ══ YANG DIATUR ════════════════════════════════════════════════════════════
 *   1. Seksi pendaratan yang disembunyikan (pahlawan & ajakan penutup SELALU
 *      tampil — keduanya bukan seksi yang bisa dipilih di sini; harga punya
 *      sakelarnya sendiri di `site_settings`).
 *   2. Tautan pemesanan demo (https saja) + kalimat pembuka WhatsApp.
 *   3. Bilah pengumuman: teks per bahasa, tautan, jendela waktu, nyala/mati.
 *   4. Daftar tanya-jawab — NULL = daftar bawaan dari kamus.
 *
 * ══ NILAI YANG TIDAK LOLOS = TIDAK DIATUR ═════════════════════════════════
 * Kolomnya teks JSON (migration platform 0014). Konsol hanya menulis yang
 * lolos validasi, tetapi SQL tangan, image lama/baru dengan bentuk berbeda,
 * atau baris yang rusak tetap mungkin. Pembaca karena itu tidak pernah
 * melempar: satu medan yang tidak lolos jatuh ke BAWAANNYA sendiri (perilaku
 * hari ini), medan lain tetap berlaku. Halaman publik tidak boleh 500 karena
 * setelan pemasaran.
 */

import { LOCALES, type Locale } from "./i18n/config";

/* ── Kosakata & batas ──────────────────────────────────────────────────────── */

/** Seksi yang BOLEH disembunyikan, urut seperti di halaman. */
export const LANDING_SECTIONS = ["features", "modules", "audience", "integrations", "trust", "faq"] as const;
export type LandingSectionKey = (typeof LANDING_SECTIONS)[number];

export const DEMO_BOOKING_URL_MAX = 500;
export const WHATSAPP_MESSAGE_MAX = 300;
/** Bilah pengumuman satu baris — di atas ±160 aksara ia menjadi paragraf. */
export const ANNOUNCEMENT_TEXT_MAX = 160;
export const ANNOUNCEMENT_HREF_MAX = 500;
export const FAQ_ITEMS_MAX = 30;
export const FAQ_QUESTION_MAX = 200;
export const FAQ_ANSWER_MAX = 2000;
/** Kunci butir FAQ — stabil saat diurutkan ulang (kunci React, jejak audit). */
export const FAQ_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Teks per bahasa: `id` wajib, `en`/`zh` opsional (jatuh ke `id`). */
export interface LocalizedText {
  id: string;
  en?: string;
  zh?: string;
}

export interface LandingAnnouncement {
  enabled: boolean;
  text: LocalizedText;
  /** `https://…` atau jalur internal `/…`; `null` = bilah tanpa tautan. */
  href: string | null;
  /** ISO 8601 (UTC). `null` = sejak kapan pun / sampai kapan pun. */
  startsAt: string | null;
  endsAt: string | null;
}

export interface LandingFaqItem {
  key: string;
  question: LocalizedText;
  answer: LocalizedText;
}

/** Setelan EFEKTIF — bentuk yang dipakai halaman. */
export interface LandingSettings {
  hiddenSections: LandingSectionKey[];
  demoBookingUrl: string | null;
  whatsappMessage: LocalizedText | null;
  announcement: LandingAnnouncement | null;
  faqItems: LandingFaqItem[] | null;
}

/** Tidak ada yang diatur = halaman persis seperti sebelum tabel ini ada. */
export const DEFAULT_LANDING_SETTINGS: LandingSettings = Object.freeze({
  hiddenSections: [],
  demoBookingUrl: null,
  whatsappMessage: null,
  announcement: null,
  faqItems: null,
}) as LandingSettings;

/** Baris basis data (bentuk yang dibaca platform). */
export interface LandingSettingsRow {
  hiddenSectionsJson: string | null;
  demoBookingUrl: string | null;
  whatsappMessageJson: string | null;
  announcementJson: string | null;
  faqItemsJson: string | null;
  updatedBy: string;
  updatedAt: Date;
}

/* ── Validator satu medan ──────────────────────────────────────────────────── */

const ADA_SPASI = /\s/;

/**
 * Tautan https yang sah, atau `null`.
 *
 * Hanya `https:` — tautan `http:` membuka pemesanan demo tanpa TLS dari halaman
 * yang ber-TLS, dan `javascript:`/`data:` adalah XSS lewat atribut `href`.
 * Nama pengguna/kata sandi di URL (`https://a:b@host`) ditolak: bentuk itu
 * dipakai untuk menyamarkan host tujuan (`https://bank.co.id@jahat.tld`).
 * Host wajib bertitik — `https://localhost` bukan tujuan publik.
 */
export function parseHttpsUrl(raw: unknown, max: number = DEMO_BOOKING_URL_MAX): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > max || ADA_SPASI.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (!url.hostname.includes(".") || url.hostname.startsWith(".") || url.hostname.endsWith(".")) return null;
  return value;
}

/** Tautan pemesanan demo — https saja. */
export function parseDemoBookingUrl(raw: unknown): string | null {
  return parseHttpsUrl(raw, DEMO_BOOKING_URL_MAX);
}

/**
 * Tautan bilah pengumuman: https (aturan di atas) ATAU jalur internal.
 *
 * Jalur internal wajib diawali SATU garis miring: `//jahat.tld` adalah URL
 * tanpa skema yang dibaca peramban sebagai host lain, dan `\` dinormalkan
 * sebagian peramban menjadi `/` — keduanya ditolak.
 */
export function parseAnnouncementHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > ANNOUNCEMENT_HREF_MAX) return null;
  if (value.startsWith("/")) {
    return /^\/(?![/\\])[^\s\\]*$/.test(value) ? value : null;
  }
  return parseHttpsUrl(value, ANNOUNCEMENT_HREF_MAX);
}

/** Tautan internal? (dirender `<Link>`, tanpa tab baru). */
export function isInternalHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

/**
 * Teks per bahasa yang sah, atau `null`. `id` wajib berisi; `en`/`zh` kosong
 * dibuang (= jatuh ke `id`). Setiap nilai di-trim dan dibatasi `max`.
 */
export function normalizeLocalizedText(raw: unknown, max: number): LocalizedText | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: Partial<Record<Locale, string>> = {};
  for (const locale of LOCALES) {
    const v = src[locale];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string") return null;
    const trimmed = v.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.length > max) return null;
    out[locale] = trimmed;
  }
  if (!out.id) return null;
  return out as LocalizedText;
}

/** Teks untuk bahasa pembaca; bahasa yang tidak diisi jatuh ke `id`. */
export function localizedText(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text.id;
}

/** Kunci seksi yang dikenal, tanpa ganda, urut seperti `LANDING_SECTIONS`. */
export function normalizeHiddenSections(raw: unknown): LandingSectionKey[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set(raw.filter((v): v is string => typeof v === "string"));
  return LANDING_SECTIONS.filter((s) => set.has(s));
}

/** Seksi tampil? Bawaan: ya. */
export function isSectionVisible(settings: Pick<LandingSettings, "hiddenSections">, section: LandingSectionKey): boolean {
  return !settings.hiddenSections.includes(section);
}

function parseIso(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 40) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Pengumuman yang sah, atau `null`. Akhir ≤ mulai = tidak sah. */
export function normalizeAnnouncement(raw: unknown): LandingAnnouncement | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const text = normalizeLocalizedText(src.text, ANNOUNCEMENT_TEXT_MAX);
  if (!text) return null;
  const href = src.href === null || src.href === undefined || src.href === "" ? null : parseAnnouncementHref(src.href);
  if (src.href && href === null) return null;
  const startsAt = src.startsAt ? parseIso(src.startsAt) : null;
  const endsAt = src.endsAt ? parseIso(src.endsAt) : null;
  if ((src.startsAt && !startsAt) || (src.endsAt && !endsAt)) return null;
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) return null;
  return { enabled: src.enabled === true, text, href, startsAt, endsAt };
}

/**
 * Pengumuman tayang SEKARANG? Nyala, dan `now` di dalam [mulai, akhir).
 * Akhir eksklusif: pengumuman "sampai 17.00" berhenti TEPAT pukul 17.00.
 */
export function isAnnouncementActive(a: LandingAnnouncement | null, now: Date = new Date()): boolean {
  if (!a || !a.enabled) return false;
  const t = now.getTime();
  if (a.startsAt && t < Date.parse(a.startsAt)) return false;
  if (a.endsAt && t >= Date.parse(a.endsAt)) return false;
  return true;
}

/**
 * Sidik pendek pengumuman — nilai cookie "sudah ditutup". Berubah bila teks,
 * tautan, atau jendelanya berubah, jadi pengumuman BARU tampil lagi bagi
 * pengunjung yang menutup yang lama. FNV-1a 32-bit: bukan keamanan, hanya
 * pembeda; sinkron supaya bisa dipakai di mana saja.
 */
export function announcementFingerprint(a: LandingAnnouncement): string {
  const src = JSON.stringify([a.text, a.href, a.startsAt, a.endsAt]);
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Nama cookie penutup bilah pengumuman (bukan rahasia, dibaca server). */
export const ANNOUNCEMENT_DISMISS_COOKIE = "sai_announcement_dismissed";
/** Bentuk nilai cookie yang diterima — sidik 8 heks. */
export const ANNOUNCEMENT_FINGERPRINT_PATTERN = /^[0-9a-f]{8}$/;

/** Butir FAQ yang sah, atau `null`. */
export function normalizeFaqItem(raw: unknown): LandingFaqItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  if (typeof src.key !== "string" || !FAQ_KEY_PATTERN.test(src.key)) return null;
  const question = normalizeLocalizedText(src.question, FAQ_QUESTION_MAX);
  const answer = normalizeLocalizedText(src.answer, FAQ_ANSWER_MAX);
  if (!question || !answer) return null;
  return { key: src.key, question, answer };
}

/**
 * Daftar FAQ dari basis data. Butir yang tidak lolos dibuang (kunci ganda:
 * yang pertama menang); daftar yang tersisa KOSONG = `null` = daftar bawaan
 * kamus — halaman tidak pernah kehilangan seluruh FAQ karena satu baris rusak.
 */
export function normalizeFaqItems(raw: unknown): LandingFaqItem[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: LandingFaqItem[] = [];
  for (const item of raw.slice(0, FAQ_ITEMS_MAX)) {
    const ok = normalizeFaqItem(item);
    if (!ok || seen.has(ok.key)) continue;
    seen.add(ok.key);
    out.push(ok);
  }
  return out.length > 0 ? out : null;
}

/* ── Baris → setelan efektif ───────────────────────────────────────────────── */

function parseJson(raw: string | null | undefined): unknown {
  if (raw === null || raw === undefined || raw === "") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Setelan EFEKTIF dari baris (atau `null` = belum ada baris / tak terbaca).
 * Tidak pernah melempar; setiap medan jatuh ke bawaannya sendiri.
 */
export function landingSettingsFromRow(row: LandingSettingsRow | null | undefined): LandingSettings {
  if (!row) return DEFAULT_LANDING_SETTINGS;
  return {
    hiddenSections: normalizeHiddenSections(parseJson(row.hiddenSectionsJson)),
    demoBookingUrl: parseDemoBookingUrl(row.demoBookingUrl),
    whatsappMessage: normalizeLocalizedText(parseJson(row.whatsappMessageJson), WHATSAPP_MESSAGE_MAX),
    announcement: normalizeAnnouncement(parseJson(row.announcementJson)),
    faqItems: normalizeFaqItems(parseJson(row.faqItemsJson)),
  };
}

/* ── Pemakaian di halaman ──────────────────────────────────────────────────── */

/**
 * Tautan `wa.me` dengan kalimat pembuka. Tanpa kalimat = tautan apa adanya
 * (perilaku hari ini). `encodeURIComponent` — kalimat operator bisa memuat
 * `&`/`#`/`?` yang akan memotong kueri.
 */
export function whatsappUrlWithText(url: string, text: string | null | undefined): string {
  const value = text?.trim();
  if (!value) return url;
  return `${url}${url.includes("?") ? "&" : "?"}text=${encodeURIComponent(value)}`;
}

/* ── Waktu di konsol: WIB ──────────────────────────────────────────────────── */

/**
 * `<input type="datetime-local">` tidak membawa zona waktu. Konsol menyatakan
 * jendela pengumuman dalam WIB (UTC+7, tanpa musim panas), jadi konversinya
 * pasti — tidak bergantung zona waktu server maupun peramban operator.
 */
const WIB_OFFSET = "+07:00";
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** `"2026-10-25T08:00"` (WIB) → ISO UTC, atau `null` bila kosong/tidak sah. */
export function wibLocalToIso(local: string): string | null {
  const value = local.trim();
  if (!LOCAL_DATETIME.test(value)) return null;
  const ms = Date.parse(`${value}:00${WIB_OFFSET}`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** ISO UTC → `"YYYY-MM-DDTHH:mm"` dalam WIB (nilai awal formulir). */
export function isoToWibLocal(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
