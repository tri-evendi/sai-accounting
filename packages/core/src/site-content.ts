/**
 * ISI HALAMAN PENDARATAN yang bisa disunting dari konsol — bagian MURNInya.
 *
 * ══ BENTUKNYA PENIMPA, BUKAN KAMUS KEDUA ═══════════════════════════════════
 * Yang disimpan basis data hanyalah kalimat yang SUDAH DIGANTI. Kamus di
 * `lib/i18n/dictionaries/*.json` tetap sumber bawaan — tetap satu-satunya yang
 * diketik `tsc`, tetap yang dipakai `tests/i18n.test.ts` untuk menuntut
 * kelengkapan tiga bahasa, dan tetap yang dirender ketika penimpanya tidak ada.
 *
 * Alternatifnya — memindahkan seluruh kalimat pendaratan ke basis data — sudah
 * ditimbang dan ditolak, dengan tiga akibat yang semuanya buruk:
 *
 *   1. halaman `/` menjadi halaman yang TIDAK BISA dirender saat
 *      `sai_platform` mati. Hari ini ia tetap tampil utuh (lihat
 *      `site-content-store.ts` — gagal-lunak ke bawaan);
 *   2. kalimat bawaannya tidak punya rumah lagi, jadi "kembalikan ke semula"
 *      berhenti menjadi operasi yang mungkin;
 *   3. `tsc` berhenti bisa membuktikan bahwa ketiga bahasa lengkap — penjaga
 *      yang justru paling sering menangkap pekerjaan separuh di repo ini.
 *
 * ══ YANG BOLEH DISUNTING: `landing.*`, DAN HANYA ITU ═══════════════════════
 * Daftarnya tidak ditulis tangan — ia DITURUNKAN dari kamus, jadi kunci
 * pendaratan baru otomatis bisa disunting dan kunci yang dicabut otomatis
 * hilang dari konsol. Yang ditulis tangan hanyalah PREFIKSnya, dan itu satu
 * baris yang bisa dipertanyakan peninjau.
 *
 * ⚠ Sengaja TIDAK memuat namespace lain. Menyunting `errors.*` atau
 * `validation.*` dari konsol berarti operator bisa mengubah kalimat yang
 * dipakai aplikasi untuk MENJELASKAN KEGAGALAN kepada pelanggan — termasuk
 * menghapusnya menjadi string kosong. Kalimat pemasaran adalah pemasaran;
 * kalimat sistem adalah perilaku.
 *
 * ══ MURNI, DAN ITU BUKAN KEBETULAN ═════════════════════════════════════════
 * Tanpa `server-only`, tanpa Prisma, tanpa `next/*`: modul ini diimpor
 * `lib/i18n/server.ts` (jalur panas setiap render), halaman konsol (server),
 * editornya (client, untuk pengelompokan bagian), DAN diuji langsung di
 * `tests/site-content.test.ts` tanpa basis data maupun DOM.
 */

import { CACHE_SIGNAL_POLL_SECONDS } from "@sai/core/cache-signals";
import type { Dictionary, DictionaryKey } from "@sai/core/i18n/dictionary";
import { LOCALES, type Locale } from "@sai/core/i18n/config";

/** Namespace kamus yang boleh disunting operator. Satu, dan dengan sengaja. */
export const SITE_CONTENT_NAMESPACE = "landing" as const;

/** Awalan jalur-titik yang dipakai sebagai kunci baris `site_contents`. */
export const SITE_CONTENT_PREFIX = `${SITE_CONTENT_NAMESPACE}.`;

/** Batas kolom `site_contents.content_key` (migration 0013). */
export const SITE_CONTENT_KEY_MAX = 120;

/**
 * Batas panjang NILAI yang diterima.
 *
 * Kolomnya `TEXT` (65.535 byte), jadi angka ini bukan batas penyimpanan
 * melainkan batas KEWARASAN: satu kalimat pemasaran sepanjang 4.000 karakter
 * bukan kalimat yang disunting, ia tempelan yang salah sasaran — dan menolaknya
 * di depan lebih baik daripada menemukannya sebagai hero setinggi layar.
 */
export const SITE_CONTENT_VALUE_MAX = 4000;

/* ───────────────────────── Jalur yang memakai penimpa ──────────────────────── */

/**
 * Halaman yang isinya boleh datang dari konsol — jalur PERSIS, bukan awalan.
 *
 * Ketiganya berbagi root layout pemasaran (`app/(marketing)/`) dan ketiganya
 * dibaca orang yang belum punya sesi. Daftarnya sengaja daftar, dengan alasan
 * yang sama persis dengan `isPublicPath` di `proxy.ts`: permukaan baru harus
 * disebut NAMANYA di sini, supaya ia terlihat sebagai baris di diff.
 */
export const SITE_CONTENT_PATHS = ["/", "/pricing", "/status"] as const;

/**
 * Apakah jalur ini memakai penimpa konten?
 *
 * ⚠ Inilah satu-satunya gerbang yang menahan satu query platform agar tidak
 * ikut ke SETIAP render halaman aplikasi. Jawaban `false` berarti kamus dipakai
 * apa adanya — tanpa menyentuh basis data sama sekali.
 */
export function isSiteContentPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  /* Querystring & fragment tidak menentukan halaman; `x-sai-path` sendiri sudah
     hanya memuat `pathname`, tapi pemanggil lain belum tentu. */
  const bare = pathname.split(/[?#]/)[0];
  return (SITE_CONTENT_PATHS as readonly string[]).includes(bare);
}

/** Validasi kode bahasa — nilai asing dari form/DB tidak pernah lolos. */
export function isSiteContentLocale(value: string | null | undefined): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/* ──────────────────────────── Kunci yang boleh disunting ─────────────────────── */

/**
 * Seluruh kunci `landing.*` beserta nilai BAWAANnya, dari kamus yang dioper.
 *
 * Diturunkan, tidak didaftar: kunci pendaratan baru langsung bisa disunting,
 * dan kunci yang dicabut langsung hilang dari konsol — tanpa satu baris pun
 * yang harus diingat seseorang.
 *
 * Nilai yang BUKAN string dilewati. Hari ini `landing` seluruhnya datar, dan
 * `tests/site-content.test.ts` menuntutnya tetap begitu; kalau suatu saat ada
 * yang bersarang, ia akan diam-diam tak tersunting — bukan merusak halaman.
 */
export function siteContentDefaults(dictionary: Dictionary): Map<string, string> {
  const out = new Map<string, string>();
  const namespace = dictionary[SITE_CONTENT_NAMESPACE] as Record<string, unknown>;
  for (const [name, value] of Object.entries(namespace)) {
    if (typeof value === "string") out.set(`${SITE_CONTENT_PREFIX}${name}`, value);
  }
  return out;
}

/** Apakah kunci ini boleh disunting? Dijawab dari kamus, bukan dari daftar. */
export function isEditableContentKey(dictionary: Dictionary, key: string): boolean {
  if (!key.startsWith(SITE_CONTENT_PREFIX)) return false;
  if (key.length > SITE_CONTENT_KEY_MAX) return false;
  const name = key.slice(SITE_CONTENT_PREFIX.length);
  /* Jalur-titik bertingkat ditolak: namespace ini datar (lihat
     `siteContentDefaults`), jadi `landing.a.b` adalah kunci yang tidak ada. */
  if (name.length === 0 || name.includes(".")) return false;
  const namespace = dictionary[SITE_CONTENT_NAMESPACE] as Record<string, unknown>;
  return typeof namespace[name] === "string";
}

/* ──────────────────────────────── Penimpaan ─────────────────────────────────── */

/**
 * Kamus + penimpa → kamus.
 *
 * Penimpa yang kuncinya TIDAK ADA di kamus diabaikan dengan tenang, dan itu
 * disengaja: kunci yang dicabut dari kamus meninggalkan barisnya di basis data
 * (menghapus baris pada setiap penerapan migration berarti kehilangan teks
 * karena sebuah ganti nama), dan baris yatim itu tidak boleh menjadi properti
 * asing di dalam objek kamus — `translate()` tidak akan pernah memintanya, tapi
 * ia akan muncul di setiap `Object.entries` yang kelak menyentuhnya.
 *
 * Penimpa KOSONG (`""`) juga diabaikan: "kosong" adalah cara konsol mengatakan
 * "pakai bawaan" (lihat `site-content-store.ts`), dan kalimat pemasaran yang
 * hilang menjadi ruang kosong di halaman adalah kegagalan yang tidak bersuara.
 */
export function applySiteContent(
  dictionary: Dictionary,
  overrides: Readonly<Record<string, string>>
): Dictionary {
  const entries = Object.entries(overrides);
  if (entries.length === 0) return dictionary;

  /* Salinan DANGKAL dari satu namespace saja — bukan `structuredClone` seluruh
     kamus 4.400 kunci pada setiap render halaman pendaratan. */
  const namespace: Record<string, string> = {
    ...(dictionary[SITE_CONTENT_NAMESPACE] as Record<string, string>),
  };

  let changed = false;
  for (const [key, value] of entries) {
    if (typeof value !== "string" || value.length === 0) continue;
    if (!isEditableContentKey(dictionary, key)) continue;
    namespace[key.slice(SITE_CONTENT_PREFIX.length)] = value;
    changed = true;
  }
  if (!changed) return dictionary;

  return {
    ...dictionary,
    /* Bentuknya sudah dijamin baris-baris di atas: setiap kunci yang lolos ADA
       di namespace dan bawaannya string, jadi tidak ada properti baru maupun
       tipe baru yang masuk. `Dictionary` diturunkan dari sebuah berkas JSON
       dengan kunci literal, dan tidak ada cara menyatakan "objek yang sama
       dengan sebagian nilai diganti" kepada `tsc` tanpa pernyataan ini. */
    [SITE_CONTENT_NAMESPACE]: namespace as Dictionary[typeof SITE_CONTENT_NAMESPACE],
  };
}

/* ─────────────────────────── Pengelompokan untuk konsol ─────────────────────── */

export interface SiteContentSection {
  /** Dipakai sebagai nilai `?section=` — bagian dari URL, jadi stabil. */
  id: string;
  /** Kunci kamus judul bagian. Literal penuh, bukan dirakit template: dengan
   *  begitu `tsc` menolak judul yang belum diterjemahkan. */
  labelKey: DictionaryKey;
  /**
   * Awalan nama kunci yang masuk ke bagian ini. Kunci jatuh ke bagian PERTAMA
   * yang cocok, jadi urutan daftar ini berarti — dan `tests/site-content.test.ts`
   * menuntut setiap kunci `landing.*` mendarat di tepat satu bagian.
   */
  prefixes: readonly string[];
}

/**
 * Bagian-bagian halaman pendaratan, dalam URUTAN HALAMANnya.
 *
 * Urutannya bukan abjad dan bukan selera: ia urutan yang dibaca pengunjung
 * (`app/(marketing)/page.tsx`), supaya operator yang sedang memperbaiki satu
 * kalimat tidak harus menerjemahkan nama bagian menjadi posisi di layar.
 *
 * `other` ADA dengan sengaja meski hari ini kosong: tanpa penampung terakhir,
 * sebuah kunci pendaratan baru yang namanya tak terduga akan menjadi kunci yang
 * TIDAK BISA disunting dari konsol — dan tidak ada yang akan menyadarinya,
 * sebab ia hanya tidak muncul.
 */
export const SITE_CONTENT_SECTIONS: readonly SiteContentSection[] = [
  {
    id: "nav",
    labelKey: "operator.content.sectionNav",
    prefixes: ["nav", "signIn", "signUp", "skipToContent", "announcement"],
  },
  { id: "hero", labelKey: "operator.content.sectionHero", prefixes: ["hero", "fact"] },
  {
    id: "features",
    labelKey: "operator.content.sectionFeatures",
    prefixes: ["features", "feature", "eyebrowFeatures", "snippet"],
  },
  {
    id: "modules",
    labelKey: "operator.content.sectionModules",
    prefixes: ["modules", "eyebrowModules", "gallery"],
  },
  {
    id: "audience",
    labelKey: "operator.content.sectionAudience",
    prefixes: ["audience", "eyebrowAudience"],
  },
  {
    id: "integrations",
    labelKey: "operator.content.sectionIntegrations",
    prefixes: ["integrations", "integration", "eyebrowIntegrations"],
  },
  { id: "trust", labelKey: "operator.content.sectionTrust", prefixes: ["trust", "eyebrowTrust"] },
  {
    id: "pricing",
    labelKey: "operator.content.sectionPricing",
    /* `compare*` = pembanding "menumpuk vs naik paket", yang hidup DI DALAM
       seksi harga — jadi ia disunting di bagian yang sama dengan harganya. */
    prefixes: ["pricing", "eyebrowPricing", "compare"],
  },
  { id: "faq", labelKey: "operator.content.sectionFaq", prefixes: ["faq", "eyebrowFaq"] },
  {
    id: "cta",
    labelKey: "operator.content.sectionCta",
    /* `quote*` ikut ke sini: ia ajakan yang dipakai hero, kartu paket, DAN
       penutup saat pendaftaran mandiri ditutup (`lib/landing-ask.ts`). Satu
       kalimat yang muncul di tiga tempat paling masuk akal disunting di satu
       bagian bernama "Ajakan", bukan dititipkan ke salah satu dari ketiganya.
       `demo*` (alur demo-first, 24 Okt 2026) sama alasannya: "Jadwalkan demo"
       dipakai hero DAN bilah navigasi saat pendaftaran ditutup. */
    prefixes: ["cta", "quote", "demo"],
  },
  {
    id: "footer",
    labelKey: "operator.content.sectionFooter",
    prefixes: ["footer", "contactWhatsapp"],
  },
  { id: "mock", labelKey: "operator.content.sectionMock", prefixes: ["mock"] },
  /* Penampung terakhir — cocok dengan apa pun. Lihat kepala daftar. */
  { id: "other", labelKey: "operator.content.sectionOther", prefixes: [""] },
];

/** Bagian mana yang memuat kunci ini. Selalu menjawab (penampung terakhir). */
export function sectionOf(key: string): SiteContentSection {
  const name = key.startsWith(SITE_CONTENT_PREFIX)
    ? key.slice(SITE_CONTENT_PREFIX.length)
    : key;
  for (const section of SITE_CONTENT_SECTIONS) {
    if (section.prefixes.some((prefix) => name.startsWith(prefix))) return section;
  }
  /* Tak terjangkau — penampung terakhir berawalan `""`. Dinyatakan supaya tipe
     kembaliannya tidak perlu `| undefined` di 3 pemanggil. */
  return SITE_CONTENT_SECTIONS[SITE_CONTENT_SECTIONS.length - 1];
}

/** `?section=` → bagian; nilai asing jatuh ke bagian pertama, bukan 404. */
export function resolveSection(value: string | null | undefined): SiteContentSection {
  return SITE_CONTENT_SECTIONS.find((s) => s.id === value) ?? SITE_CONTENT_SECTIONS[0];
}

/* ═══════════════════════ Draf → terbit (migration platform 0008) ═══════════════════════ */

/** Status baris `site_content_entries` — sama dengan CHECK di migration 0008. */
export const SITE_CONTENT_STATUSES = ["draft", "published"] as const;
export type SiteContentStatus = (typeof SITE_CONTENT_STATUSES)[number];

/** Jenis penerbitan — sama dengan CHECK `site_content_publications.kind`. */
export const SITE_CONTENT_PUBLICATION_KINDS = ["publish", "baseline", "purge"] as const;
export type SiteContentPublicationKind = (typeof SITE_CONTENT_PUBLICATION_KINDS)[number];

/** Bentuk kunci yang diterima basis data — sama dengan CHECK `content_key`. */
export const SITE_CONTENT_KEY_PATTERN = /^landing\.[A-Za-z][A-Za-z0-9]*$/;

/** Batas catatan penerbitan — kolom `site_content_publications.note`. */
export const SITE_CONTENT_NOTE_MAX = 200;

/**
 * Berapa lama sampai penerbitan terlihat di halaman depan: selang baca sinyal
 * invalidasi (`@sai/core/cache-signals`). Penerbitan menaikkan sinyal
 * `site-content`, dan `app-customer` membaca sinyal itu paling lambat sekali
 * per selang ini. Konsol menyebut angka ini apa adanya.
 */
export const SITE_CONTENT_LIVE_DELAY_SECONDS = CACHE_SIGNAL_POLL_SECONDS;

/** Umur token pratinjau draf. */
export const SITE_CONTENT_PREVIEW_TTL_MINUTES = 30;

/** Token pratinjau = 32 byte acak dalam base64url (43 karakter). */
export const SITE_CONTENT_PREVIEW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Nama parameter alamat pratinjau di aplikasi customer (`/?preview=…`). */
export const SITE_CONTENT_PREVIEW_PARAM = "preview";

/**
 * Ke mana sebuah tautan harus pergi SELAMA pratinjau, atau `null` bila
 * tautannya dibiarkan apa adanya.
 *
 * Pratinjau hidup di parameter alamat (`proxy.ts` hanya membacanya dari sana),
 * jadi tautan biasa di halaman depan (`/pricing`, `/#tanya`, `/status`)
 * membawa operator keluar dari pratinjau tanpa terasa: halaman berikutnya
 * memperlihatkan yang TAYANG, dan terbaca seolah drafnya hilang. Hanya tautan
 * ke halaman ber-isi-situs di origin yang sama yang dibawa; `/register`,
 * `/docs`, tautan luar, dan `mailto:` tidak pernah memuat token.
 */
export function previewLinkTarget(href: string, current: string, token: string): string | null {
  if (!SITE_CONTENT_PREVIEW_TOKEN_PATTERN.test(token)) return null;
  let here: URL;
  let target: URL;
  try {
    here = new URL(current);
    target = new URL(href, here);
  } catch {
    return null;
  }
  if (target.origin !== here.origin || !isSiteContentPath(target.pathname)) return null;
  if (target.searchParams.get(SITE_CONTENT_PREVIEW_PARAM) === token) return null;
  target.searchParams.set(SITE_CONTENT_PREVIEW_PARAM, token);
  return target.toString();
}

/** Jumlah karakter seperti `char_length` PostgreSQL (code point, bukan UTF-16). */
export function contentLength(value: string): number {
  return Array.from(value).length;
}

/* ───────────────────────────── Jenis & batas isian ───────────────────────────── */

export type ContentFieldKind = "label" | "text" | "paragraph";

export interface ContentFieldSpec {
  kind: ContentFieldKind;
  /** Batas karakter untuk SETIAP bahasa kunci ini. */
  maxLength: number;
}

/**
 * Jenis dan batas sebuah isian, diturunkan dari kalimat bawaannya di ketiga
 * bahasa.
 *
 * Batasnya dua kali kalimat bawaan terpanjang (paling sedikit 40): cukup untuk
 * menulis ulang dengan kata lain, tapi menolak tempelan yang membuat tombol
 * atau judul pecah. Diturunkan, bukan didaftar, jadi kunci baru langsung punya
 * batas. Batas mutlak basis data tetap `SITE_CONTENT_VALUE_MAX`.
 */
export function contentFieldSpec(defaults: readonly string[]): ContentFieldSpec {
  const longest = defaults.reduce((max, text) => Math.max(max, contentLength(text)), 0);
  const kind: ContentFieldKind = longest <= 60 ? "label" : longest <= 200 ? "text" : "paragraph";
  const maxLength = Math.min(SITE_CONTENT_VALUE_MAX, Math.max(40, longest * 2));
  return { kind, maxLength };
}

/** `{days}`, `{price}` … di sebuah kalimat, terurut dan unik. */
export function placeholdersOf(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}

/**
 * Alasan sebuah nilai ditolak. Kosong (`""`) selalu sah: artinya "pakai bawaan".
 *
 *   • `too_long`     — melewati `spec.maxLength`;
 *   • `markup`       — memuat tag HTML. Isi halaman depan adalah teks biasa yang
 *                      dirender React sebagai teks; tag tidak pernah berlaku dan
 *                      hanya akan tampil sebagai `<b>` harfiah;
 *   • `control`      — karakter kendali (selain baris baru);
 *   • `placeholders` — `{nama}` tidak sama dengan kalimat bawaan. Tanpa ini,
 *                      `{days}` yang terhapus membuat angka hilang dari kalimat,
 *                      dan `{dayz}` tampil apa adanya di halaman publik.
 */
export type ContentValueProblem = "too_long" | "markup" | "control" | "placeholders";

export function contentValueProblem(
  value: string,
  defaultValue: string,
  spec: ContentFieldSpec
): ContentValueProblem | null {
  const text = value.trim();
  if (text.length === 0) return null;
  if (contentLength(text) > spec.maxLength) return "too_long";
  if (/<\/?[A-Za-z!?][^>]*>/.test(text)) return "markup";
  if (/[\u0000-\u0009\u000B-\u001F\u007F]/.test(text)) return "control";
  const want = placeholdersOf(defaultValue);
  const got = placeholdersOf(text);
  if (want.length !== got.length || want.some((name, i) => name !== got[i])) return "placeholders";
  return null;
}

/* ──────────────────────────────── Resolusi ──────────────────────────────────── */

/**
 * Penimpa yang berlaku: terbit, lalu (hanya saat pratinjau) draf di atasnya.
 *
 * Urutannya: draf > terbit > bawaan kamus. Draf `null` berarti "kembali ke
 * bawaan", jadi ia MENGHAPUS penimpa terbitnya. Tanpa `drafts` hasilnya
 * persis `published`: jalur publik tidak pernah melihat draf.
 */
export function resolveSiteContent(
  published: Readonly<Record<string, string>>,
  drafts?: Readonly<Record<string, string | null>>
): Record<string, string> {
  const out: Record<string, string> = { ...published };
  if (!drafts) return out;
  for (const [key, value] of Object.entries(drafts)) {
    if (value === null) delete out[key];
    else out[key] = value;
  }
  return out;
}

/**
 * Apa yang disimpan dari satu isian editor.
 *
 *   • `clear` — tidak ada draf (isian sama dengan yang sudah tayang);
 *   • `set`   — draf berisi `value`; `null` = kembalikan ke bawaan saat terbit.
 *
 * Nilai yang persis sama dengan yang tayang dibandingkan SEBELUM trim: nilai
 * lama yang tersimpan dengan spasi di tepi tidak boleh berubah jadi draf hanya
 * karena editornya dibuka lalu disimpan.
 */
export type DraftIntent = { action: "clear" } | { action: "set"; value: string | null };

export function draftIntent(input: string, published: string | null): DraftIntent {
  if (input === (published ?? "")) return { action: "clear" };
  const trimmed = input.trim();
  const target = trimmed.length === 0 ? null : trimmed;
  if (target === published) return { action: "clear" };
  return { action: "set", value: target };
}

/* ─────────────────────────── Keadaan per isian (konsol) ─────────────────────── */

/** Satu kunci dalam satu bahasa, seperti yang dilihat konsol. */
export interface ContentCell {
  defaultValue: string;
  /** Penimpa yang tayang, atau `null` (memakai bawaan). */
  published: string | null;
  /** `undefined` = tidak ada draf; `null` = draf "kembali ke bawaan". */
  draft: string | null | undefined;
}

/**
 * Bahasa yang DISUNTING di alur biasa konsol `/content`. Bahasa lain tetap
 * tersimpan, berdraf, dan terbit per bahasa seperti sebelumnya — layar hanya
 * melipatnya di balik "Bahasa lain (opsional)" (pemilik tidak mengelola
 * terjemahan di sana). Di inti, bukan di editor: editornya modul client, dan
 * konstanta yang diimpor server component dari modul client menjadi rujukan
 * klien, bukan nilai.
 */
export const SITE_CONTENT_PRIMARY_LOCALE: Locale = "id";

export type ContentCellState = "default" | "overridden" | "draft";

export function contentCellState(cell: ContentCell): ContentCellState {
  if (cell.draft !== undefined) return "draft";
  return cell.published === null ? "default" : "overridden";
}

/** Penimpa sesudah draf diterbitkan (`null` = bawaan). */
export function overrideAfterPublish(cell: ContentCell): string | null {
  return cell.draft !== undefined ? cell.draft : cell.published;
}

/**
 * Bahasa yang TERTINGGAL: kunci ini diganti di bahasa lain, tapi di bahasa ini
 * masih kalimat bawaan. Kamus sendiri selalu lengkap (dijaga `tsc`); yang bisa
 * timpang adalah penimpanya, mis. harga yang diperbaiki di `id` saja sementara
 * `en` dan `zh` masih menyebut harga lama.
 */
export function lockedBehindLocales(cells: Readonly<Record<Locale, ContentCell>>): Locale[] {
  const changed = LOCALES.filter((l) => overrideAfterPublish(cells[l]) !== null);
  if (changed.length === 0 || changed.length === LOCALES.length) return [];
  return LOCALES.filter((l) => overrideAfterPublish(cells[l]) === null);
}

/* ───────────────────────────── Kamus ketiga bahasa ──────────────────────────── */

/** Kalimat bawaan sebuah kunci di ketiga bahasa (`""` bila kuncinya tidak ada). */
export function defaultsOf(
  dictionaries: Readonly<Record<Locale, Dictionary>>,
  key: string
): Record<Locale, string> {
  const name = key.startsWith(SITE_CONTENT_PREFIX) ? key.slice(SITE_CONTENT_PREFIX.length) : key;
  const out = {} as Record<Locale, string>;
  for (const locale of LOCALES) {
    const value = (dictionaries[locale][SITE_CONTENT_NAMESPACE] as Record<string, unknown>)[name];
    out[locale] = typeof value === "string" ? value : "";
  }
  return out;
}

/** Bisa disunting = kuncinya ada (dan berupa string) di KETIGA kamus. */
export function isEditableInAll(
  dictionaries: Readonly<Record<Locale, Dictionary>>,
  key: string
): boolean {
  return LOCALES.every((locale) => isEditableContentKey(dictionaries[locale], key));
}

/**
 * Kalimat untuk sebuah masalah isian, dalam bahasa penerjemah yang dioper.
 * Dipakai server action (pesan per isian) DAN editor (peringatan saat
 * mengetik), jadi keduanya mengatakan hal yang sama.
 */
export function describeContentProblem(
  problem: ContentValueProblem,
  context: { value: string; defaultValue: string; spec: ContentFieldSpec },
  t: (key: DictionaryKey, values?: Record<string, string | number>) => string
): string {
  switch (problem) {
    case "too_long":
      return t("operator.content.problemTooLong", {
        count: contentLength(context.value.trim()),
        max: context.spec.maxLength,
      });
    case "markup":
      return t("operator.content.problemMarkup");
    case "control":
      return t("operator.content.problemControl");
    case "placeholders": {
      const names = placeholdersOf(context.defaultValue);
      return names.length === 0
        ? t("operator.content.problemNoPlaceholders")
        : t("operator.content.problemPlaceholders", {
            names: names.map((n) => `{${n}}`).join(", "),
          });
    }
  }
}
