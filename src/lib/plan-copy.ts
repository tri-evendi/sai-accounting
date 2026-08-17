/**
 * Teks paket yang DIBACA MANUSIA — dipetakan ke kunci kamus, bukan diambil apa
 * adanya dari basis data.
 *
 * ══ KENAPA BERKAS INI ADA ══════════════════════════════════════════════════
 * `plans.description` adalah kolom basis data, dan sampai sekarang kedua
 * pemakainya (`components/landing/landing-pricing.tsx` dan halaman paket di
 * `/platform/billing/plans`) merendernya APA ADANYA. Isinya disemai sebagai
 * literal bahasa Indonesia di `scripts/seed-plans.ts`, jadi hasilnya:
 *
 *   • halaman pendaratan berbahasa Inggris memajang "Sampai tiga PT, lima belas
 *     pengguna." tepat di atas baris kuota berbahasa Inggris yang menyatakan
 *     FAKTA YANG SAMA ("3 companies", "15 users") — satu kartu, dua bahasa, dua
 *     kalimat untuk satu angka;
 *   • pembaca Mandarin tidak pernah mendapat terjemahan sama sekali.
 *
 * Ini melanggar `design-system/sai-accounting/pages/landing.md` §"Trilingual —
 * semua teks lewat kunci di ketiga kamus", dan penjaganya tidak bisa
 * melihatnya: kunci yang hilang ditolak `tsc`, tetapi teks yang datang dari
 * SEBUAH KOLOM bukan kunci yang hilang — ia hanya string yang kebetulan
 * berbahasa Indonesia.
 *
 * ══ KENAPA PEMETAAN, BUKAN KOLOM `description_en` / `description_zh` ═══════
 * Kolom per bahasa membuat teks yang harus diterjemahkan hidup di tempat yang
 * TIDAK BISA dijaga: kamus diperiksa `tsc` (kunci hilang = merah) dan diperiksa
 * `tests/i18n.test.ts`; kolom basis data tidak diperiksa siapa pun, dan bahasa
 * ketiga yang lupa diisi akan tampil sebagai sel kosong di halaman publik.
 *
 * Yang hilang dengan keputusan ini jujur disebut: paket yang dibuat operator DI
 * LUAR daftar semai tidak punya kunci, dan untuk itulah `null` dikembalikan —
 * pemanggil jatuh ke `plan.description` dari basis data. Jadi paket kustom tetap
 * tampil (dalam bahasa apa pun operator menulisnya), sementara paket yang
 * DIKAPALKAN produk ini selalu tiga bahasa.
 *
 * `name` sengaja TIDAK ikut dipetakan: "Pro" dan "Enterprise" adalah nama
 * produk, dan nama produk tidak diterjemahkan — `APP_NAME` pun tidak.
 */
import type { DictionaryKey } from "@/lib/i18n/dictionary";

/**
 * Kunci deskripsi per `plans.key` yang disemai `scripts/seed-plans.ts`.
 *
 * Ditulis sebagai `Record<string, …>` dan bukan `Record<PlanKey, …>` karena
 * kunci paket memang bebas: tabel `plans` menerima baris yang dibuat operator,
 * dan tipe tertutup di sini akan berbohong tentang itu. Yang dijaga `tsc`
 * adalah NILAI-nya — sebuah `DictionaryKey`, jadi salah ketik pada nama kunci
 * kamus merah saat kompilasi, bukan saat halaman harga dibuka.
 */
const DESKRIPSI: Record<string, DictionaryKey> = {
  internal: "plans.description.internal",
  starter: "plans.description.starter",
  pro: "plans.description.pro",
  business: "plans.description.business",
  enterprise: "plans.description.enterprise",
};

/**
 * Butir "termasuk" TAMBAHAN per paket, di bawah dua baris kuota (#404).
 *
 * Kuota (PT & pengguna) datang dari kolom katalog dan dirender pemanggil;
 * yang ada di sini adalah janji yang TIDAK punya kolom — dan karena itu wajib
 * punya sumber selain tabel `plans` (`pages/landing.md` §KLAIM HARUS PUNYA
 * SUMBER). Satu-satunya untuk saat ini: dukungan prioritas paket Business
 * (balasan hari kerja berikutnya lewat kanal kontak yang sudah ada), keputusan
 * pemilik yang tercatat di #404 dan `docs/PRICING.md`. Paket lain sengaja
 * KOSONG, bukan diisi butir hiasan ("semua modul", "tiga bahasa") — itu sudah
 * dinyatakan satu kali untuk semua paket di bawah kisi (`pricingAllNote`), dan
 * mengulanginya per kartu membuat pembaca mengira paket lain tidak
 * mendapatkannya.
 *
 * Paket rundingan (`contactOnly`) tidak lewat sini: butirnya sudah tiga dan
 * dirender pemanggil sendiri (`pricingContactQuota/Support/Terms`).
 */
const SOROTAN: Record<string, readonly DictionaryKey[]> = {
  business: ["plans.highlight.prioritySupport"],
};

/** Kunci kamus butir sorotan sebuah paket; kosong bila tidak ada. */
export function planHighlightKeys(planKey: string): readonly DictionaryKey[] {
  return SOROTAN[planKey] ?? [];
}

/**
 * Paket yang MEMIKUL jalur rundingan di kartunya (#408).
 *
 * Sejak #408 `enterprise` tidak lagi dipajang sebagai kartu sendiri
 * (`is_public = false`) — funel publik tiga anak tangga, dan rundingan hanya
 * bagi yang melewati kuota Business. Yang tersisa dari Enterprise di halaman
 * harga adalah SATU kalimat + tautan kontak di kaki kartu Business: "butuh
 * lebih dari {companies} PT atau {users} pengguna? kuota, migrasi data, SLA,
 * dan masa kontrak dirundingkan — hubungi kami". Angkanya dari kolom katalog
 * paket pemikulnya, jadi menaikkan kuota Business ikut menggeser kalimatnya.
 *
 * Dipetakan di sini, bukan dibandingkan `plan.key === "business"` di
 * komponen: kalau kelak paket teratas berganti nama, satu baris ini yang
 * berubah — bukan kartu publik dan halaman paket dalam aplikasi terpisah.
 */
const PEMIKUL_RUNDINGAN = "business";

/** Apakah kartu paket ini memuat kalimat + tautan rundingan di kakinya. */
export function planCarriesNegotiation(planKey: string): boolean {
  return planKey === PEMIKUL_RUNDINGAN;
}

/**
 * Kunci kamus untuk deskripsi sebuah paket, atau `null` bila paket itu tidak
 * dikapalkan produk ini (paket buatan operator).
 *
 * Pemanggil WAJIB menyediakan jalan mundurnya sendiri:
 *
 *     const kunci = planDescriptionKey(plan.key);
 *     const deskripsi = kunci ? t(kunci) : plan.description;
 *
 * Ditulis begitu — dua baris di pemanggil — dan bukan sebagai satu fungsi yang
 * menerima `t`, supaya tipe `t` (yang dibangkitkan dari bentuk kamus) tidak
 * perlu ikut menyeberang ke modul ini.
 */
export function planDescriptionKey(planKey: string): DictionaryKey | null {
  return DESKRIPSI[planKey] ?? null;
}
