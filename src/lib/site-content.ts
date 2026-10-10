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

import type { Dictionary, DictionaryKey } from "@/lib/i18n/dictionary";
import { LOCALES, type Locale } from "@/lib/i18n/config";

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
    prefixes: ["nav", "signIn", "signUp", "skipToContent"],
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
    prefixes: ["pricing", "eyebrowPricing"],
  },
  { id: "faq", labelKey: "operator.content.sectionFaq", prefixes: ["faq", "eyebrowFaq"] },
  {
    id: "cta",
    labelKey: "operator.content.sectionCta",
    /* `quote*` ikut ke sini: ia ajakan yang dipakai hero, kartu paket, DAN
       penutup saat pendaftaran mandiri ditutup (`lib/landing-ask.ts`). Satu
       kalimat yang muncul di tiga tempat paling masuk akal disunting di satu
       bagian bernama "Ajakan", bukan dititipkan ke salah satu dari ketiganya. */
    prefixes: ["cta", "quote"],
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
