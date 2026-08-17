/**
 * Halaman pendaratan publik `/` — permukaan pertama bagi orang yang BELUM
 * punya akun.
 *
 * Sebelum halaman ini ada, `/` hanya memantulkan ke `/login`: orang asing yang
 * mengetik alamat produk disambut formulir kata sandi, dan tautan pendaftaran
 * baru terlihat sesudah ia mendarat di formulir yang bukan untuknya.
 *
 * Yang dijaga di sini bukan tata letaknya (itu akan berubah setiap kali
 * pemasaran berubah pikiran), melainkan lima janji yang kalau meleset tidak
 * berbunyi:
 *
 *   1. **Yang sudah bersesi tidak melihat halaman pemasaran** — ia memantul,
 *      dan pemantulannya tetap satu aturan yang sama dengan halaman masuk.
 *   2. **Yang belum bersesi menemukan KEDUA pintu** — daftar dan masuk. Itu
 *      seluruh alasan halaman ini ada.
 *   3. **Harga datang dari KATALOG, bukan diketik.** Harga yang ditulis tangan
 *      adalah salinan kedua dari angka yang menagih; dua salinan akan berbeda
 *      pada hari salah satunya berubah, dan yang membayar selisihnya adalah
 *      orang yang mendaftar karena angka lama.
 *   4. **Katalog mati ≠ halaman kosong.** `activePlans()` boleh `null`
 *      (platform penagihan tak terjangkau) tanpa menjatuhkan halaman yang
 *      menjelaskan produknya.
 *   5. **Daftar modul datang dari REGISTRI, bukan dari daftar yang diketik.**
 *      Daftar tangan akan berhenti menyebut modul berikutnya tanpa membuat
 *      apa pun merah — halaman publik diam-diam berhenti menawarkan hal yang
 *      baru saja dibangun.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

import { BUSINESS_MODULES, MODULE_META } from "@/lib/business-modules";
import { CURRENCIES } from "@/lib/constants";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/config";
import { translate, type Dictionary } from "@/lib/i18n/dictionary";
import id from "@/lib/i18n/dictionaries/id.json";
import { formatMoney } from "@/lib/money-format";
import { TRIAL_DAYS } from "@/lib/registration";
import { DEFAULT_TAX_RATE, computeTax } from "@/lib/tax";

const dict = id as unknown as Dictionary;
const T = (key: string, values?: Record<string, string | number>) => translate(dict, key, values);

const PLANS = [
  {
    key: "starter",
    name: "Starter",
    description: "Untuk satu PT",
    priceMonthly: 150000,
    priceYearly: null,
    currency: "IDR",
    maxCompanies: 1,
    maxUsers: 3,
    contactOnly: false,
    isRecommended: false,
  },
  {
    key: "pro",
    name: "Pro",
    description: null,
    priceMonthly: 450000,
    priceYearly: 4500000,
    currency: "IDR",
    maxCompanies: 3,
    maxUsers: 10,
    contactOnly: false,
    isRecommended: true,
  },
  {
    /* Paket berharga RUNDINGAN: kolom harganya 0 karena skema menuntut angka,
     * dan justru itulah yang tidak boleh sampai ke layar. */
    key: "enterprise",
    name: "Enterprise",
    description: null,
    priceMonthly: 0,
    priceYearly: null,
    currency: "IDR",
    maxCompanies: 10,
    maxUsers: 50,
    contactOnly: true,
    isRecommended: false,
  },
];

/** `redirect()` asli Next.js bekerja dengan melempar — tiruannya juga. */
class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect: ${to}`);
  }
}

const state = {
  session: null as { user: { id: string } } | null,
  plans: null as typeof PLANS | null,
};

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
  /* Pemilih bahasa & tema di bilah atas adalah komponen KLIEN yang memanggil
   * `useRouter()`; hook itu menuntut konteks App Router yang tidak ada di
   * perenderan SSR telanjang. Keduanya sengaja TETAP dirender (tidak
   * di-stub): halaman ini satu-satunya tempat orang yang belum punya akun
   * bisa memilih bahasanya, jadi hilangnya harus terlihat di sini. */
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/",
}));

vi.mock("@/lib/auth", () => ({ auth: async () => state.session }));

/* `getT` membaca cookie lokal lewat `next/headers`, yang menuntut konteks
 * permintaan — tidak ada di perenderan SSR telanjang seperti di sini. Kamus
 * yang dipakai tetap kamus SUNGGUHAN (`id.json`), jadi kunci yang salah ketik
 * tetap terlihat sebagai teks kunci di markup, bukan tersembunyi di balik
 * tiruan yang mengembalikan apa saja. */
vi.mock("@/lib/i18n/server", () => ({
  getT: async () => T,
  getLocale: async () => "id",
  /* Kartu manfaat (#402) membaca kamus utuh untuk `roleLabels()` — kamus
     SUNGGUHAN yang sama, jadi nama peran yang dirender adalah nama peran. */
  getDictionary: async () => dict,
}));

vi.mock("@/lib/plan-catalog", () => ({ activePlans: async () => state.plans }));

const { default: LandingPage } = await import("@/app/(marketing)/page");
const { default: PricingPage } = await import("@/app/(marketing)/harga/page");

/**
 * TANPA `LocaleProvider` — dengan sengaja (#399). Halaman pemasaran hidup di
 * root layout yang tidak memasang provider itu, jadi tes ini merender persis
 * keadaan produksinya: dua daun client (`LocaleToggle`, `ThemeToggle`) harus
 * mendapat bahasa & teksnya lewat PROP, dan sebuah kunci kamus yang bocor
 * sebagai teks ("theme.light") akan tertangkap di sini.
 */
async function renderTree(tree: React.ReactNode): Promise<string> {
  const stream = await renderToReadableStream(tree);
  const html = await new Response(stream).text();
  return html.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

async function render(): Promise<string> {
  return renderTree(await LandingPage({ searchParams: Promise.resolve({}) }));
}

async function renderPricing(): Promise<string> {
  return renderTree(await PricingPage());
}

/** Pola satu blok data terstruktur, dipakai kedua penolong di bawah. */
/* `[\s\S]` dan bukan `.` + flag `s`: target tsconfig repo ini di bawah es2018,
   jadi flag `s` ditolak `tsc` (TS1501). Keduanya cocok dengan hal yang sama. */
const POLA_JSONLD = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

/**
 * Markup TAMPAK — sumber halaman tanpa blok data terstruktur.
 *
 * Diperlukan sejak JSON-LD terpasang: nama paket & pertanyaan FAQ kini memang
 * muncul dua kali di sumber (sekali terlihat, sekali untuk mesin), jadi
 * menghitung kemunculan di seluruh HTML berhenti menjawab "berapa kartu".
 */
function tanpaJsonLd(html: string): string {
  return html.replace(POLA_JSONLD, "");
}

/**
 * Setiap blok data terstruktur, sudah diurai.
 *
 * Diurai — bukan dicocokkan sebagai teks — supaya tes ini ikut membuktikan
 * bahwa yang diterbitkan adalah JSON yang SAH. Pelolosan `<` di
 * `landing-jsonld.tsx` justru membuat pencocokan teks menyesatkan: sebuah blok
 * yang rusak bisa saja masih mengandung kata yang dicari.
 */
function jsonLdBlocks(html: string): Record<string, unknown>[] {
  return [...html.matchAll(POLA_JSONLD)].map(([, isi]) => JSON.parse(isi));
}

beforeEach(() => {
  state.session = null;
  state.plans = PLANS;
});

describe("halaman pendaratan publik", () => {
  it("pengunjung bersesi TIDAK melihat halaman pemasaran — ia memantul", async () => {
    state.session = { user: { id: "7" } };
    // `/dashboard` sengaja, bukan jalur tenant yang sudah jadi: halaman itulah
    // yang memegang `resolvePostLoginPath`, satu-satunya aturan tujuan
    // pasca-masuk. Menduplikasinya di sini berarti dua aturan yang akan
    // menyimpang.
    await expect(render()).rejects.toThrow("redirect: /dashboard");
  });

  it("pengunjung tanpa sesi menemukan KEDUA pintu: daftar dan masuk", async () => {
    const html = await render();
    expect(html).toContain('href="/register"');
    expect(html).toContain('href="/login"');
    expect(html).toContain(T("landing.heroHeading"));
    // Ajakan hero menyebut lama uji coba dari konstanta yang menghitungnya
    // (#397) — bukan angka yang diketik ke kalimatnya.
    expect(html).toContain(T("landing.heroTrialCta", { days: TRIAL_DAYS }));
  });

  it("harga & kuota datang dari katalog, bukan dari teks di markup", async () => {
    const html = await render();

    // NAMA setiap paket muncul — termasuk yang berharga rundingan.
    for (const plan of PLANS) expect(html).toContain(plan.name);

    // ANGKA hanya untuk paket yang memang berharga. Paket rundingan diuji
    // terpisah di bawah: nominal & kuotanya justru TIDAK boleh muncul.
    for (const plan of PLANS.filter((p) => !p.contactOnly)) {
      expect(html).toContain(formatMoney(plan.priceMonthly, plan.currency));
      expect(html).toContain(T("platform.plansQuotaCompanies", { max: plan.maxCompanies }));
      expect(html).toContain(T("platform.plansQuotaUsers", { max: plan.maxUsers }));
    }
    // Harga tahunan hanya muncul untuk paket yang punya — bukan Rp 0 untuk
    // paket yang tidak dijual tahunan.
    expect(html).toContain(formatMoney(4500000, "IDR"));
    // Hemat tahunan DIHITUNG dari kedua kolom yang sama (#397):
    // 450.000 × 12 − 4.500.000 = 900.000 ≈ 2 bulan. Paket tanpa harga tahunan
    // tidak punya barisnya sama sekali — satu-satunya nominal hemat di halaman
    // adalah milik Pro.
    expect(html).toContain(
      T("landing.pricingYearlySaving", { amount: formatMoney(900000, "IDR"), months: "2" })
    );
    expect(tanpaJsonLd(html).match(/hemat/g)?.length).toBe(1);
    // "Semua paket mendapat" kini SATU kalimat berangka (#397), bukan strip
    // kedua yang identik dengan strip bukti di hero.
    expect(html).toContain(
      T("landing.pricingAllNote", {
        modules: BUSINESS_MODULES.length,
        languages: LOCALES.length,
        currencies: CURRENCIES.join(" · "),
      })
    );

    // Paket yang ditarik dari penjualan tidak pernah sampai ke sini: itu
    // urusan `activePlans()`, dan halaman ini tidak boleh menyaring ulang
    // (dua penyaring akan berbeda). Yang dijaga di sini: halaman menampilkan
    // PERSIS apa yang katalog berikan — SATU kartu per paket.
    //
    // Dihitung pada markup TAMPAK saja: sejak data terstruktur terpasang, nama
    // paket memang muncul dua kali di sumber halaman — sekali di kartunya, dan
    // sekali di blok `SoftwareApplication`. Itu bukan kartu kedua, dan justru
    // memang yang dituntut data terstruktur (isinya harus mencerminkan yang
    // terlihat). Yang tetap dijaga di sini adalah jumlah KARTU-nya.
    expect(tanpaJsonLd(html).match(/Starter/g)?.length).toBe(1);
  });

  it("data terstruktur mencerminkan katalog — dan tidak memajang paket rundingan", async () => {
    /*
     * Data terstruktur adalah salinan kedua isi halaman, dibaca mesin pencari.
     * Dua hal yang harus benar sekaligus, dan keduanya gagal tanpa berbunyi:
     *
     *   • ia harus MENCERMINKAN yang terlihat — cuplikan pencarian yang
     *     menyebut paket yang tidak ada di halaman adalah salinan yang sudah
     *     menyimpang;
     *   • paket RUNDINGAN tidak boleh punya `Offer`. Harganya 0 di katalog
     *     karena memang dirundingkan, dan menerbitkan "IDR 0" sebagai penawaran
     *     yang bisa dibaca mesin berarti mesin pencari memajangnya sebagai
     *     GRATIS — kegagalan yang sama yang sudah dijaga di layar, kali ini di
     *     tempat yang tidak dilihat siapa pun sampai ada yang mencarinya.
     */
    const blok = jsonLdBlocks(await render());
    const aplikasi = blok.find((b) => b["@type"] === "SoftwareApplication");
    expect(aplikasi, "blok SoftwareApplication tidak diterbitkan").toBeDefined();

    const offers = aplikasi!.offers as { name: string; price: number }[];
    const berbayar = PLANS.filter((p) => !p.contactOnly);
    expect(offers.map((o) => o.name).sort()).toEqual(berbayar.map((p) => p.name).sort());
    for (const plan of PLANS.filter((p) => p.contactOnly)) {
      expect(offers.map((o) => o.name)).not.toContain(plan.name);
    }

    // FAQ: pertanyaan yang dirender adalah pertanyaan yang diterbitkan — sebelas
    // sejak #397 (enam soal tagihan & isolasi + lima pertanyaan pembeli).
    // Angkanya dipatok, bukan dihitung dari halaman: yang dijaga justru bahwa
    // menambah/menghapus pertanyaan terasa di sini dan dilakukan dengan sadar.
    const faq = blok.find((b) => b["@type"] === "FAQPage");
    expect(faq, "blok FAQPage tidak diterbitkan").toBeDefined();
    expect((faq!.mainEntity as unknown[]).length).toBe(11);
  });

  it("lama uji coba dari konstanta yang sama yang menghitungnya", async () => {
    const html = await render();
    expect(html).toContain(T("landing.pricingTrialNote", { days: TRIAL_DAYS }));
  });

  it("katalog tak terjangkau → halaman tetap berdiri, dengan kalimatnya", async () => {
    state.plans = null;
    const html = await render();

    expect(html).toContain(T("landing.pricingUnavailable"));
    // Penagihan mati tidak boleh mematikan halaman yang menjelaskan produk:
    // hero dan pintu masuk tetap ada.
    expect(html).toContain(T("landing.heroHeading"));
    expect(html).toContain('href="/register"');
  });

  it("katalog kosong dijawab kalimat, bukan bagian harga yang melompong", async () => {
    state.plans = [];
    const html = await render();
    expect(html).toContain(T("landing.pricingEmpty"));
  });

  it("tombol paket tidak menjanjikan paket yang belum dipilih", async () => {
    const html = await render();
    // Pendaftaran tidak menerima pilihan paket — setiap tenant lahir di paket
    // `trial`. `?plan=` yang tidak dibaca siapa pun akan terbaca sebagai janji
    // bahwa paket itu sudah dipilih.
    expect(html).not.toContain("/register?plan=");
  });

  it("daftar modul datang dari REGISTRI — semuanya, bukan sebagian yang diketik", async () => {
    const html = await render();

    for (const key of BUSINESS_MODULES) {
      expect(html, `modul ${key} tidak disebut`).toContain(T(MODULE_META[key].labelKey));
      expect(html).toContain(T(MODULE_META[key].descriptionKey));
    }

    // Penjaga terhadap kemunduran yang paling mungkin: seseorang mengganti
    // `BUSINESS_MODULES.map(...)` dengan daftar pilihan yang diketik tangan.
    // Daftar seperti itu akan berhenti menyebut modul berikutnya TANPA
    // membuat apa pun merah — halaman publik diam-diam berhenti menawarkan
    // hal yang baru saja dibangun.
    // `>10<`, bukan `10`: angka telanjang bisa cocok dengan potongan harga
    // atau kelas Tailwind mana pun, dan penjaga yang cocok dengan apa saja
    // tidak menjaga apa-apa.
    expect(html).toContain(`>${BUSINESS_MODULES.length}<`);
  });

  it("modul inti ditandai berteks, bukan sekadar berbeda warna", async () => {
    const html = await render();
    // `core_accounting` tidak bisa dimatikan; menampilkannya setara dengan
    // sembilan lainnya menyesatkan ke dua arah — seolah ia bisa dilepas, dan
    // seolah yang lain wajib ikut.
    expect(html).toContain(T("landing.modulesCore"));
  });

  it("angka di strip fakta dihitung dari registri, bukan diketik", async () => {
    const html = await render();
    expect(html).toContain(`>${LOCALES.length}<`);
    for (const currency of CURRENCIES) expect(html).toContain(currency);
  });

  it("paket rundingan tidak memajang nominal — 'Rp 0' terbaca sebagai gratis", async () => {
    const html = await render();

    expect(html).toContain(T("landing.pricingContactPrice"));
    // Angka nol paket Enterprise tidak boleh muncul sebagai harga di mana pun.
    expect(html).not.toContain(formatMoney(0, "IDR"));
    // Kuotanya pun tidak dijanjikan: yang berlaku adalah salinan di tenant,
    // dan justru itulah yang dirundingkan.
    expect(html).toContain(T("landing.pricingContactQuota"));
    expect(html).not.toContain(T("platform.plansQuotaUsers", { max: 50 }));
  });

  it("paket rundingan tidak menawarkan pendaftaran swalayan", async () => {
    const html = await render();
    // Tanpa alamat kontak, kartunya tetap tampil tetapi menyebut yang kurang
    // adalah KONFIGURASI — bukan diam-diam menjadi jalan buntu.
    expect(html).toContain(T("landing.pricingContactMissing"));
  });

  it("paket yang disorot ditandai berteks, bukan sekadar tepi berwarna", async () => {
    const html = await render();
    expect(html).toContain(T("landing.pricingRecommended"));
  });

  it("katalog EMPAT paket (#404): kisi bertitik-patah, butir sorotan hanya di paket yang punya sumbernya", async () => {
    // ≤3 paket: kisi sebaris `landingGrid`, TANPA atribut lembar gaya. Yang
    // dicari adalah ATRIBUT di `<ul>` — selektornya sendiri selalu ada di
    // lembar gaya yang disisipkan ke halaman.
    expect(await render()).not.toContain('<ul data-landing-pricing-grid=""');

    state.plans = [
      PLANS[0],
      PLANS[1],
      {
        key: "business",
        name: "Business",
        description: null,
        priceMonthly: 1199000,
        priceYearly: 11990000,
        currency: "IDR",
        maxCompanies: 8,
        maxUsers: 40,
        contactOnly: false,
        isRecommended: false,
      },
      PLANS[2],
    ];
    const html = await render();
    // ≥4 paket: kisi diserahkan ke lembar gaya (1 → 2×2 → 4 kolom).
    expect(html).toContain('<ul data-landing-pricing-grid=""');
    // Business memikul janji dukungan prioritas — dan HANYA ia: butir itu
    // muncul tepat sekali di seluruh halaman, bukan disalin ke kartu lain.
    expect(html.match(new RegExp(T("plans.highlight.prioritySupport"), "g"))?.length).toBe(1);
    // Deskripsi tiga bahasa lewat kunci kamus, bukan kolom basis data (yang
    // di fixture ini sengaja `null`).
    expect(html).toContain(T("plans.description.business"));
    expect(html).toContain(T("plans.description.starter"));
    // Kuota Business dari katalog.
    expect(html).toContain(T("platform.plansQuotaCompanies", { max: 8 }));
    expect(html).toContain(T("platform.plansQuotaUsers", { max: 40 }));
    // Hemat tahunan Business dihitung: 1.199.000 × 12 − 11.990.000 = 2.398.000 ≈ 2 bulan.
    expect(html).toContain(
      T("landing.pricingYearlySaving", { amount: formatMoney(2398000, "IDR"), months: "2" })
    );
  });

  it("FAQ menjawab keberatan & pertanyaan pembeli, dengan angka dari sumbernya", async () => {
    const html = await render();

    expect(html).toContain(T("landing.faqHeading"));
    for (const key of [
      "landing.faqAfterTrialQ",
      "landing.faqQuotaQ",
      "landing.faqIsolationQ",
      "landing.faqExportQ",
      // Lima pertanyaan pembeli (#397).
      "landing.faqFitQ",
      "landing.faqImportQ",
      "landing.faqAccountantQ",
      "landing.faqSupportQ",
      "landing.faqDataQ",
    ]) {
      expect(html, `${key} hilang dari FAQ`).toContain(T(key));
    }
    // Dua jawaban membawa angka, dan keduanya harus datang dari konstanta yang
    // sama yang dipakai penagihan — bukan diketik ke dalam kalimatnya.
    expect(html).toContain(T("landing.faqTrialA", { days: TRIAL_DAYS }));
    expect(html).toContain(T("landing.faqTaxA", { rate: DEFAULT_TAX_RATE }));
  });

  it("dokumen hukum terjangkau SEBELUM orang menyetujuinya", async () => {
    const html = await render();
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
  });

  it("dua daun client mendapat teksnya lewat prop — tanpa LocaleProvider, tak ada kunci yang bocor (#399)", async () => {
    const html = await render();
    // Sakelar bahasa: nama kelompoknya kalimat, bukan "userMenu.language".
    expect(html).toContain(`aria-label="${T("userMenu.language")}"`);
    expect(html).not.toContain("userMenu.language");
    // Sakelar tema: ketiga labelnya kalimat, bukan "theme.light" dst.
    expect(html).toContain(T("theme.light"));
    expect(html).not.toMatch(/theme\.(label|light|dark|system)/);
  });

  it("galeri layar: tiga purwarupa dirender, berlabel contoh, aria-hidden, angkanya dihitung (#399)", async () => {
    const html = tanpaJsonLd(await render());
    for (const key of ["landing.mockJournalTitle", "landing.mockInvoiceTitle", "landing.mockSwitcherTitle"])
      expect(html).toContain(T(key));
    // Label contoh tampil di hero + tiga layar galeri + potongan PPN di kartu
    // manfaat (#402: satu-satunya potongan yang memuat NOMINAL) = lima kali.
    expect(html.split(T("landing.mockCaption")).length - 1).toBe(5);
    // PPN & total faktur dari mesin pajak yang sama dengan faktur sungguhan;
    // jurnalnya seimbang karena DIHITUNG — label "Seimbang" hanya lahir dari
    // hasil hitung, dan totalnya cocok dengan faktur di sebelahnya.
    const pajak = computeTax(9_500_000 + 3_000_000, DEFAULT_TAX_RATE);
    expect(html).toContain(formatMoney(pajak.taxAmount, "IDR"));
    expect(html).toContain(formatMoney(pajak.total, "IDR"));
    expect(html).toContain(T("landing.mockVat", { rate: DEFAULT_TAX_RATE }));
    expect(html).toContain(T("landing.mockBalanced"));
    // Nama PT contoh, dan bukan nama PT pemasangan ini.
    expect(html).toContain(T("landing.mockCompanyTwo"));
    // Seluruh galeri `aria-hidden` — di dalam wadah yang berisi ketiga judul.
    const galeri = html.slice(html.indexOf(T("landing.galleryHeading")));
    expect(galeri.indexOf('aria-hidden="true"')).toBeGreaterThan(-1);
    expect(galeri.indexOf('aria-hidden="true"')).toBeLessThan(galeri.indexOf(T("landing.mockJournalTitle")));
  });

  it("potongan UI kartu manfaat & pil modul (#402): dari registri, angkanya dihitung, aria-hidden", async () => {
    const html = tanpaJsonLd(await render());
    // Tabel PPN: DPP contoh 12.500.000 → PPN & total dari mesin pajak yang sama.
    const pajak = computeTax(12_500_000, DEFAULT_TAX_RATE);
    expect(html).toContain(formatMoney(pajak.taxAmount, "IDR"));
    expect(html).toContain(formatMoney(pajak.total, "IDR"));
    // Lencana peran: nama peran SISTEM dari kamus yang sama dengan halaman Pengguna.
    expect(html).toContain(T("role.finance_manager"));
    // Pil bahasa: nama bahasa dalam bahasanya sendiri, dari registri locale.
    for (const locale of LOCALES) expect(html).toContain(LOCALE_LABELS[locale]);
    // Baris jejak audit (kunci baru, tiga bahasa).
    expect(html).toContain(T("landing.snippetAuditRow"));
    // Kartu Enterprise: tiga butir "termasuk".
    for (const key of ["landing.pricingContactQuota", "landing.pricingContactSupport", "landing.pricingContactTerms"])
      expect(html).toContain(T(key));
    // Kalimat kedua body hero dibungkus penanda yang disembunyikan <576px —
    // tetap di DOM (pembaca layar & metadata), satu kunci kamus.
    expect(html).toContain('data-landing-hero-body-more=""');
    expect(html).toContain(T("landing.heroBody").split(". ")[1]);
  });

  it("tombol WhatsApp melayang (#402): hanya bila nomornya sah, tautan keluar, bukan primer", async () => {
    // Tanpa nomor → tidak dirender sama sekali (bukan dirender kelabu).
    vi.stubEnv("PLATFORM_CONTACT_WHATSAPP", "");
    expect(await render()).not.toContain('data-landing-fab=""');
    // Nomor salah bentuk (dengan `+`) → tetap tidak dirender.
    vi.stubEnv("PLATFORM_CONTACT_WHATSAPP", "+62812345678");
    expect(await render()).not.toContain('data-landing-fab=""');
    // Nomor sah → satu tombol `wa.me`, tab baru, berlabel, dan BUKAN primer.
    vi.stubEnv("PLATFORM_CONTACT_WHATSAPP", "6281234567890");
    const html = await render();
    vi.unstubAllEnvs();
    const fab = html.slice(html.indexOf('data-landing-fab=""'));
    expect(fab).toContain('href="https://wa.me/6281234567890"');
    expect(fab).toContain('target="_blank"');
    expect(fab).toContain(`aria-label="${T("landing.contactWhatsappCta")}"`);
    expect(fab.slice(0, fab.indexOf("</a>"))).not.toContain("ant-btn-color-primary");
  });

  it("navigasi menaut ke /harga (halaman), jangkar seksi berakar `/` (#399)", async () => {
    const html = await render();
    expect(html).toContain('href="/harga"');
    expect(html).toContain('href="/#modul"');
    expect(html).toContain('href="/#tanya"');
    expect(html).toContain('href="/#kontak"');
    expect(html).not.toContain('href="#harga"');
  });
});

describe("halaman harga publik /harga (#399)", () => {
  it("pengunjung bersesi memantul — sama seperti /", async () => {
    state.session = { user: { id: "7" } };
    await expect(renderPricing()).rejects.toThrow("redirect: /dashboard");
  });

  it("merender katalog & FAQ yang SAMA dengan /, dengan judul harga sebagai <h1>", async () => {
    const html = tanpaJsonLd(await renderPricing());
    expect(html).toMatch(new RegExp(`<h1[^>]*>${T("landing.pricingHeading")}</h1>`));
    // Tepat satu <h1> — hero tidak ikut ke sini.
    expect(html.match(/<h1[\s>]/g)?.length).toBe(1);
    for (const plan of PLANS) expect(html).toContain(plan.name);
    for (const plan of PLANS.filter((p) => !p.contactOnly))
      expect(html).toContain(formatMoney(plan.priceMonthly, plan.currency));
    expect(html).toContain(T("landing.faqTrialQ"));
    // Tanpa hero, tanpa galeri, tanpa kontak — hanya harga + FAQ di dalam kulit.
    expect(html).not.toContain(T("landing.heroHeading"));
    expect(html).not.toContain(T("landing.galleryHeading"));
    expect(html).not.toContain(T("landing.contactHeading"));
    // Kulitnya tetap: bilah atas dengan kedua pintu.
    expect(html).toContain('href="/register"');
    expect(html).toContain('href="/login"');
  });

  it("di / judul harga tetap <h2> — satu-satunya <h1> di sana milik hero", async () => {
    const html = tanpaJsonLd(await render());
    expect(html).toMatch(new RegExp(`<h2[^>]*>${T("landing.pricingHeading")}</h2>`));
    expect(html.match(/<h1[\s>]/g)?.length).toBe(1);
  });
});
