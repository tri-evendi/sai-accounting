/**
 * Bagian HARGA di halaman pendaratan — angkanya dari katalog, bukan diketik.
 *
 * ══ KENAPA DARI `activePlans()` DAN BUKAN DARI TEKS ════════════════════════
 * Harga yang ditulis tangan di halaman pemasaran adalah salinan kedua dari
 * angka yang sudah hidup di tabel `plans`. Dua salinan akan berbeda pada hari
 * salah satunya diubah — dan yang berubah lebih dulu hampir selalu yang
 * menagih, bukan yang memajang. Akibatnya bukan sekadar halaman basi: calon
 * pelanggan mendaftar karena satu angka lalu ditagih angka lain.
 *
 * `isActive: false` tidak ikut, dan itu bukan penyaringan kosmetik: paket yang
 * sudah ditarik masih dipakai pelanggan lama, tetapi memajangnya berarti
 * menawarkan harga yang tidak lagi berlaku kepada orang yang belum terikat
 * apa-apa.
 *
 * ══ HARGA BELUM TERMASUK PPN, DAN ITU HARUS TERTULIS ═══════════════════════
 * `platformInvoiceAmounts()` memperlakukan harga paket sebagai DPP dan
 * menambahkan PPN di atasnya. Memajang DPP tanpa menyebut PPN berarti
 * memajang angka yang TIDAK akan sama dengan yang tertagih. Catatannya
 * mengikuti sakelar yang sama (`PLATFORM_PPN_DISABLED`) dan tarif yang sama
 * (`lib/tax.ts`) — bukan kalimat kedua yang bisa menyimpang.
 *
 * Katalog boleh gagal dengan tenang (`null`): platform penagihan mati tidak
 * boleh mengosongkan halaman yang menjelaskan produknya.
 */
import { CheckOutlined } from "@ant-design/icons";
import { JsonLd } from "@/components/landing/landing-jsonld";
import {
  LANDING_NOTE,
  LANDING_SURFACE,
  landingChip,
  landingFill,
  landingGrid,
} from "@/components/landing/landing-scale";
import {
  LandingSection,
  LandingSectionIntro,
} from "@/components/landing/landing-section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BUSINESS_MODULES } from "@/lib/business-modules";
import { APP_NAME, CURRENCIES } from "@/lib/constants";
import { LOCALES } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money-format";
import { activePlans } from "@/lib/plan-catalog";
import {
  planCarriesNegotiation,
  planDescriptionKey,
  planHighlightKeys,
} from "@/lib/plan-copy";
import { TRIAL_DAYS } from "@/lib/registration";
import { DEFAULT_TAX_RATE } from "@/lib/tax";

/**
 * Nominal paket — `--sai-landing-font-size-section` (24px → 30px di ≥576px),
 * tebal, tracking rapat, `tabular-nums`.
 *
 * Satu tingkat di atas 24px yang dipakai sampai #413, dan TETAP di bawah hero:
 * angka adalah hal pertama yang dibaca orang di kartu harga, jadi ia berhak
 * jadi bidang terbesar DI KARTUNYA — tetapi kalimat yang menjelaskan produknya
 * (judul seksi, hero) tetap lebih besar. Halaman yang angkanya melampaui
 * janjinya menjual harga, bukan pekerjaan. Diukur: "Rp 1.199.000" pada 30px
 * tebal ±215px, muat di isi kartu tersempit yang masih tiga kolom (228px di
 * kisi empat kolom #404); satuan "/bulan" duduk di baseline dan boleh turun
 * baris sendiri di kartu yang lebih sempit (`flexWrap`).
 */
const PRICE: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--sai-landing-font-size-section)",
  fontWeight: "var(--sai-landing-font-weight-display)" as React.CSSProperties["fontWeight"],
  letterSpacing: "var(--sai-landing-tracking-hero)",
  lineHeight: 1.1,
  fontVariantNumeric: "tabular-nums",
};

/** Satuan di sebelah nominal ("/bulan", "/tahun") — kecil, sekunder, baseline. */
const PRICE_UNIT: React.CSSProperties = {
  fontSize: "var(--ant-font-size)",
  fontWeight: "normal",
  letterSpacing: 0,
  color: "var(--ant-color-text-secondary)",
};

/**
 * Baris nominal + satuan. `alignItems: baseline` supaya "/bulan" duduk di
 * garis dasar angka; `flexWrap` supaya satuannya turun sendiri (bukan
 * memotong angka) di kartu yang terlalu sempit untuk keduanya sebaris.
 */
const PRICE_ROW: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "baseline",
  columnGap: "var(--ant-margin-xxs)",
};

/**
 * Ubin kuota — angka besar + label kecil, dua ubin sebaris.
 *
 * Kuota adalah SATU-SATUNYA yang membedakan paket (`Plan` hanya punya
 * `maxCompanies` & `maxUsers`), dan sampai #413 ia ditulis sebagai dua baris
 * centang kecil — bentuk yang sama dengan butir hiasan, jadi mata tidak
 * menangkap bahwa "3 PT · 15 pengguna" adalah pokok bedanya. Ubin berangka
 * meminjam bentuk *stat tile* hero (§"Polos sekali": kekayaan visual datang
 * dari ISI): angkanya besar, tabular, labelnya di bawah. Nadanya
 * `fill-indigo` (14%) di atas badan `surface` — nada yang sama dengan kepala
 * kartu biasa, jadi ubinnya terbaca sebagai bagian kartu, bukan lencana; dan
 * ia bukan bidang yang memikul tombol, jadi kadar 14% sah (§Nada pekat).
 */
const QUOTA_TILE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
  padding: "var(--ant-padding-xs) var(--ant-padding-sm)",
  borderRadius: "var(--sai-landing-radius-control)",
  background: landingFill("indigo"),
  minWidth: 0,
};

const QUOTA_NUMBER: React.CSSProperties = {
  fontSize: "var(--ant-font-size-heading-3)",
  fontWeight: "var(--ant-font-weight-strong)",
  lineHeight: 1.2,
  fontVariantNumeric: "tabular-nums",
  color: "var(--ant-color-text)",
};

const QUOTA_LABEL: React.CSSProperties = {
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-text-secondary)",
};

/**
 * Hemat tahunan — DIHITUNG dari dua kolom katalog yang sama, bukan diketik
 * (#397). `null` bila katalog tidak punya harga tahunan, selisihnya nol, atau
 * tahunan lebih MAHAL: baris "hemat Rp 0" / "hemat −Rp …" benar secara
 * aritmetika tapi terbaca sebagai halaman rusak.
 */
function hematTahunan(plan: { priceMonthly: number; priceYearly: number | null }) {
  if (plan.priceYearly === null) return null;
  const hemat = plan.priceMonthly * 12 - plan.priceYearly;
  if (!(hemat > 0) || !(plan.priceMonthly > 0)) return null;
  return { hemat, bulan: hemat / plan.priceMonthly };
}

/** Satu desimal, format `id-ID` (MASTER.md §angka): 2,0 → "2"; 1,5 tetap "1,5". */
const formatBulan = (bulan: number) =>
  bulan.toLocaleString("id-ID", { maximumFractionDigits: 1 });

/**
 * Lebar maksimum kisi paket saat katalog memuat ≤2 kartu (#402) — angkanya
 * dari pengukuran di komentar `<ul>` di bawah, bukan selera: 760px memberi
 * kartu 372px, selebar kartu di kisi tiga kolom penuh.
 */
const PRICING_GRID_MAX_WIDTH = 760;

const QUOTA_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "var(--ant-margin-xs)",
};

const QUOTA_LIST: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin-xxs)",
  listStyle: "none",
  margin: 0,
  padding: 0,
  fontSize: "var(--ant-font-size)",
};

/**
 * Centang kuota — ikon, jadi ambangnya 3:1 (grafis non-teks). Ia penanda
 * KEDUA di baris yang sudah berisi kalimat kuotanya sendiri.
 */
const CHECK: React.CSSProperties = {
  flexShrink: 0,
  marginTop: 2,
  /* ⚠ BUKAN `colorMoneyPositive` — baris kuota menyatakan "termasuk", bukan
     uang masuk. Alasan lengkap di `landing-modules.tsx` pada centang yang
     sama; keduanya harus bergerak bersama, sebab dua centang berbeda warna
     untuk arti yang sama justru menyiratkan arti yang berbeda. */
  color: "var(--ant-color-primary)",
  fontSize: "var(--ant-font-size-lg)",
};

export async function LandingPricing({
  headingLevel = "h2",
}: {
  /** `h1` di `/pricing`, tempat seksi ini menjadi kepala halamannya (#399). */
  headingLevel?: "h1" | "h2";
} = {}) {
  const t = await getT();
  const plans = await activePlans();
  const ppnEnabled = process.env.PLATFORM_PPN_DISABLED !== "true";
  /* Alamat penjualan untuk paket berharga rundingan. Tidak diset = kartunya
   * tetap tampil (paketnya memang ada) tetapi TANPA tombol yang menuju
   * ke mana-mana — tombol `mailto:` kosong adalah jalan buntu, dan kalimat
   * penggantinya memberi tahu pemasang bahwa yang kurang adalah konfigurasi,
   * bukan paketnya. */
  const contactEmail = process.env.PLATFORM_CONTACT_EMAIL?.trim();

  return (
    <LandingSection id="harga" tone="indigo">
      <LandingSectionIntro
        eyebrow={t("landing.eyebrowPricing")}
        title={t("landing.pricingHeading")}
        headingLevel={headingLevel}
      >
        {t("landing.pricingBody")}
      </LandingSectionIntro>

      {plans === null ? (
        <Card
          style={{
            marginTop: "var(--ant-margin-lg)",
            background: LANDING_SURFACE,
          }}
        >
          <CardContent>
            <p style={LANDING_NOTE}>{t("landing.pricingUnavailable")}</p>
          </CardContent>
        </Card>
      ) : plans.length === 0 ? (
        <Card
          style={{
            marginTop: "var(--ant-margin-lg)",
            background: LANDING_SURFACE,
          }}
        >
          <CardContent>
            <p style={LANDING_NOTE}>{t("landing.pricingEmpty")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* `SoftwareApplication` + penawarannya, dibangkitkan dari `plans`
              yang SAMA yang merender kartunya. Paket rundingan tidak ikut
              sebagai `Offer`: harganya 0 di katalog karena memang dirundingkan,
              dan menerbitkan "IDR 0" sebagai penawaran yang bisa dibaca mesin
              adalah bentuk paling harfiah dari kegagalan yang sudah dijaga di
              layar ("Rp 0 terbaca sebagai gratis") — kali ini dibaca oleh mesin
              pencari, yang akan memajangnya sebagai harga. */}
          <JsonLd
            data={{
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: APP_NAME,
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              offers: plans
                .filter((plan) => !plan.contactOnly)
                .map((plan) => ({
                  "@type": "Offer",
                  name: plan.name,
                  price: plan.priceMonthly,
                  priceCurrency: plan.currency,
                })),
            }}
          />
          <div data-landing-pricing="">
          {/* ══ SAKELAR BULANAN / TAHUNAN — TANPA JAVASCRIPT (#413) ═════════
              Dua radio (`name="sai-billing"`) yang disembunyikan dari mata
              (bukan `display:none` — tetap bisa dijangkau keyboard) dan dua
              label yang digayakan sebagai pil bersegmen. Yang tampak di
              kartu dipilih lembar gaya: `[data-landing-pricing]:has(
              [value=yearly]:checked) [data-landing-price=monthly]{display:none}`
              dan sebaliknya (`landing-scale.ts`). Halaman pemasaran ini
              memang tanpa JS (§Gerak: CSS, tidak pernah JavaScript), dan
              sakelar harga adalah keadaan, bukan gerak — `:checked` sudah
              menyimpannya.

              Pil "Tahunan" menyebut hematnya dalam BULAN — angka terkecil
              di antara paket yang punya harga tahunan (dihitung dari
              katalog, `hematTahunan`), supaya janji di pilnya berlaku untuk
              SEMUA kartu di bawahnya, bukan hanya yang paling murah hati.
              Sakelarnya tidak dirender bila tidak ada paket berharga
              tahunan: dua pil yang menampilkan hal yang sama adalah kendali
              palsu. */}
          {(() => {
            const berbayar = plans.filter((p) => !p.contactOnly);
            const adaTahunan = berbayar.some((p) => p.priceYearly !== null);
            if (!adaTahunan) return null;
            const bulanHemat = berbayar
              .map((p) => hematTahunan(p)?.bulan ?? null)
              .filter((b): b is number => b !== null);
            const bulanMin =
              bulanHemat.length === berbayar.length && bulanHemat.length > 0
                ? Math.min(...bulanHemat)
                : null;
            return (
              <fieldset
                data-landing-billing=""
                style={{
                  margin: 0,
                  marginTop: "var(--ant-margin-lg)",
                  padding: 0,
                  border: 0,
                  minWidth: 0,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <legend data-landing-sr-only="">
                  {t("landing.pricingBillingLegend")}
                </legend>
                <div data-landing-billing-switch="">
                  <input
                    type="radio"
                    id="sai-billing-monthly"
                    name="sai-billing"
                    value="monthly"
                    defaultChecked
                    data-landing-billing-input=""
                  />
                  <label htmlFor="sai-billing-monthly" data-landing-billing-option="">
                    {t("landing.pricingBillingMonthly")}
                  </label>
                  <input
                    type="radio"
                    id="sai-billing-yearly"
                    name="sai-billing"
                    value="yearly"
                    data-landing-billing-input=""
                  />
                  <label htmlFor="sai-billing-yearly" data-landing-billing-option="">
                    {t("landing.pricingBillingYearly")}
                    {bulanMin !== null && (
                      <span
                        data-landing-billing-save=""
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {t("landing.pricingBillingYearlySave", {
                          months: formatBulan(bulanMin),
                        })}
                      </span>
                    )}
                  </label>
                </div>
              </fieldset>
            );
          })()}
          <ul
            /* ══ ≥4 KARTU: KISI BERTITIK-PATAH, BUKAN auto-fit (#404) ══════
               `landingGrid()` di bawah dibatasi tiga kolom, dan katalog kini
               empat paket (Starter · Pro · Business · Enterprise): tiga kolom
               + satu kartu yatim selebar sepertiga di baris kedua. Empat kolom
               lewat auto-fit juga tidak bisa: di 992px kartu 224px terlalu
               sempit untuk nominal "Rp 1.199.000 /bln" (diukur —
               `LANDING_PRICING_FOUR_COLUMNS_BREAKPOINT`), dan auto-fit yang
               diberi minimum 276px jatuh ke 3+1 lagi di 992–1199px. Maka
               kisi ≥4 dipegang lembar gaya bertitik-patah (1 → 2×2 → 4):
               atributnya hanya dipasang saat ≥4, dan `landingGrid` hanya
               saat ≤3, jadi keduanya tidak pernah saling menimpa. */
            {...(plans.length >= 4 ? { "data-landing-pricing-grid": "" } : null)}
            style={{
              /* Kolomnya DIHITUNG dari jumlah paket, bukan dipatok 3.
                 Semaian mengapalkan tiga paket dan hanya DUA yang `isPublic`
                 (`internal` milik penyedia tidak ditawarkan), jadi kisi yang
                 dipatok tiga menghasilkan dua kartu setengah lebar dengan
                 rongga di dalamnya — di setiap pemasangan, bukan hanya di
                 lingkungan pengembangan. Dibatasi 3 supaya katalog berisi
                 lima paket tidak melahirkan lima kolom sempit — dan ≥4 paket
                 diserahkan ke lembar gaya (atribut di atas). */
              ...(plans.length <= 3 ? landingGrid(plans.length, 260) : null),
              /* ══ ≤2 KARTU: KISI DIPUSATKAN, MAKS 760px (#402) ═════════════
                 Dua kartu di kisi 72rem (1152px) berarti dua kartu 568px —
                 selebar dua kolom teks — dengan separuh badannya kosong.
                 Dipusatkan pada 760px, DIUKUR: tiap kartu (760 − 16) / 2 =
                 372px di ≥992px, hampir sama dengan lebar kartu saat katalog
                 memuat TIGA paket di kisi penuh ((1152 − 32) / 3 = 373px) —
                 jadi kartu paket berlebar sama berapa pun jumlah paketnya.
                 Katalog ≥3 paket melebar otomatis: `maxWidth` hilang, bukan
                 kolom mati yang menunggu. `marginInline: auto` di kedua
                 cabang supaya kisi ≤2 berdiri di tengah kolom seksi. */
              listStyle: "none",
              margin: 0,
              marginTop: "var(--ant-margin-lg)",
              maxWidth: plans.length <= 2 ? PRICING_GRID_MAX_WIDTH : undefined,
              marginInline: "auto",
              padding: 0,
            }}
          >
            {plans.map((plan) => {
              const kunci = planDescriptionKey(plan.key);
              const deskripsi = kunci ? t(kunci) : plan.description;
              const hemat = hematTahunan(plan);
              const sorotan = planHighlightKeys(plan.key);
              return (
                <li
                  key={plan.key}
                  {...(plan.isRecommended
                    ? { "data-landing-plan-recommended": "" }
                    : null)}
                >
                  {/* ══ KENAPA BADAN KARTU TETAP POLOS ═══════════════════════
                      Kartu inilah satu-satunya di halaman ini yang MEMIKUL
                      TOMBOL, dan itu yang menentukan warnanya. Isian tombol
                      primer di tema gelap (`#1668dc`) berjarak 3,18:1 dari
                      `colorBgElevated` — sudah tipis. Menaruh nada 14% di
                      bawahnya menjatuhkannya ke 2,82:1, di bawah ambang 3:1
                      untuk grafis non-teks (MASTER.md §Ambang kontras), dan
                      tombolnya berhenti bisa ditemukan sebagai bidang.

                      Karena itu nada dipindahkan ke KEPALA kartu, tempat yang
                      hanya berisi teks: kepala bernada + badan `surface`. Paket
                      yang disarankan mendapat nada terkuat (`chip-brand`, 28%),
                      sisanya nada tenang sehue pita (`fill-indigo`) — sorotan
                      yang penuh untuk satu kartu, tanpa tiga kartu yang
                      berteriak bersamaan.

                      ══ KARTU DISARANKAN = MENARA (#413) ══════════════════════
                      `<li data-landing-plan-recommended>`: di ≥992px kartunya
                      menjulur 16px di atas DAN di bawah tetangganya — margin
                      blok negatif pada butir kisi yang `stretch`, jadi
                      tingginya = baris + 32px (`landing-scale.ts`) — bercincin
                      merek, dan berbayang tetap. Sorotan yang dulu hanya
                      warna kepala + tepi kini juga BENTUK — terbaca oleh
                      siapa pun yang tidak membedakan warnanya, dan tetap
                      punya lencana berteks di kepalanya. Di bawah 992px
                      kartu bertumpuk/dua kolom, dan menara yang menjulur ke
                      kartu di atasnya justru merusak; di sana ia sejajar. */}
                  <Card
                    data-landing-card=""
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      height: "100%",
                      background: LANDING_SURFACE,
                      borderRadius: "var(--sai-landing-radius)",
                      /* Sorotan paket: tepi merek + cincin setebal 1px +
                         bayangan tetap. Ia penanda KETIGA — yang pertama
                         lencana berteks di kepalanya, yang kedua nada kepala
                         itu sendiri; keempat bentuk menaranya (≥992px). */
                      ...(plan.isRecommended
                        ? {
                            borderColor: "var(--ant-color-primary)",
                            boxShadow:
                              "0 0 0 1px var(--ant-color-primary), var(--ant-box-shadow-secondary)",
                          }
                        : null),
                    }}
                  >
                    <CardHeader
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "var(--ant-margin-xs)",
                        /* Kepala Pro `chip-brand` (28%), kepala lain
                           `fill-indigo` (14%): keduanya terukur — teks
                           11,89/9,43:1 di atas chip-brand, dan chip-brand vs
                           fill-indigo 1,20/1,22:1 (kedua tema), jadi kepala
                           Pro memang berbeda dari kepala di sebelahnya
                           (`tests/landing-colors.test.ts` §kepala kartu
                           paket, #402). */
                        background: plan.isRecommended
                          ? landingChip("brand")
                          : landingFill("indigo"),
                        /* Kepala kartu adalah anak PERTAMA `.ant-card` (badan
                           kartu `display: contents`, lihat `ui/card.tsx`), dan
                           `.ant-card` TIDAK memasang `overflow: hidden`. Tanpa
                           dua radius ini bidang berwarnanya menyembul sebagai
                           dua sudut siku di luar tepi kartu yang membulat. */
                        borderTopLeftRadius: "var(--sai-landing-radius)",
                        borderTopRightRadius: "var(--sai-landing-radius)",
                      }}
                    >
                      <h3
                        style={{
                          margin: 0,
                          fontSize: "var(--ant-font-size-lg)",
                          fontWeight: "var(--ant-font-weight-strong)",
                        }}
                      >
                        {plan.name}
                      </h3>
                      {/* Sorotan paket adalah LENCANA BERTEKS, bukan sekadar
                          tepi berwarna: tepi saja tidak terbaca oleh siapa pun
                          yang tidak membedakan warnanya (MASTER.md
                          §Anti-Patterns). */}
                      {plan.isRecommended && (
                        /* `default`, bukan `success` — "direkomendasikan" adalah
                           keputusan penjualan, bukan status berhasil. */
                        <Badge variant="default">
                          {t("landing.pricingRecommended")}
                        </Badge>
                      )}
                    </CardHeader>
                    <CardContent
                      style={{
                        display: "flex",
                        flex: 1,
                        flexDirection: "column",
                        gap: "var(--ant-margin-sm)",
                      }}
                    >
                      {/* ══ NOMINAL: DUA BLOK, SATU YANG TAMPAK (#413) ════════
                          Kedua siklus DIRENDER — `data-landing-price="monthly"`
                          dan `="yearly"` — dan sakelar di atas kisi
                          (`[data-landing-billing]`, radio + `:has()` di
                          `landing-scale.ts`) memilih yang tampak. Tanpa
                          JavaScript: keadaan sakelar hidup di `:checked`,
                          dan halamannya tetap dokumen yang memuat kedua
                          harga (mesin pencari, cetak, pembaca layar yang
                          membaca DOM). Peramban tanpa `:has()` selalu melihat
                          blok bulanan — sakelarnya diam, tidak rusak.

                          Paket berharga rundingan TIDAK memajang nominal:
                          kolom harganya berisi 0, dan "Rp 0" di kartu
                          penjualan bukan sekadar salah — ia terbaca sebagai
                          gratis. */}
                      {plan.contactOnly ? (
                        <p style={PRICE}>{t("landing.pricingContactPrice")}</p>
                      ) : (
                        <>
                          <div data-landing-price="monthly">
                            <p style={PRICE_ROW}>
                              <span style={PRICE}>
                                {formatMoney(plan.priceMonthly, plan.currency)}
                              </span>
                              <span style={PRICE_UNIT}>
                                {t("platform.plansPerMonth")}
                              </span>
                            </p>
                            {plan.priceYearly !== null && (
                              <p
                                style={{
                                  ...LANDING_NOTE,
                                  marginTop: "var(--ant-margin-xxs)",
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                {formatMoney(plan.priceYearly, plan.currency)}
                                {t("platform.plansPerYear")}
                                {/* Hemat tahunan — dihitung, tidak diketik. */}
                                {hemat &&
                                  ` · ${t("landing.pricingYearlySaving", {
                                    amount: formatMoney(hemat.hemat, plan.currency),
                                    months: formatBulan(hemat.bulan),
                                  })}`}
                              </p>
                            )}
                          </div>
                          {/* Blok TAHUNAN: yang besar adalah angka yang
                              memang ditagih (harga tahunan), padanan
                              bulanannya kalimat kecil di bawahnya —
                              `priceYearly / 12`, aritmetika dari kolom yang
                              sama, dibulatkan ke satuan mata uang oleh
                              `formatMoney`. Paket tanpa harga tahunan tetap
                              memajang harga bulanannya di blok ini supaya
                              kartunya tidak kosong saat sakelar dipindah. */}
                          <div data-landing-price="yearly">
                            {plan.priceYearly !== null ? (
                              <>
                                <p style={PRICE_ROW}>
                                  <span style={PRICE}>
                                    {formatMoney(plan.priceYearly, plan.currency)}
                                  </span>
                                  <span style={PRICE_UNIT}>
                                    {t("platform.plansPerYear")}
                                  </span>
                                </p>
                                <p
                                  style={{
                                    ...LANDING_NOTE,
                                    marginTop: "var(--ant-margin-xxs)",
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {t("landing.pricingYearlyEquivalent", {
                                    amount: formatMoney(
                                      Math.round(plan.priceYearly / 12),
                                      plan.currency,
                                    ),
                                  })}
                                  {hemat &&
                                    ` · ${t("landing.pricingYearlySaving", {
                                      amount: formatMoney(hemat.hemat, plan.currency),
                                      months: formatBulan(hemat.bulan),
                                    })}`}
                                </p>
                              </>
                            ) : (
                              <p style={PRICE_ROW}>
                                <span style={PRICE}>
                                  {formatMoney(plan.priceMonthly, plan.currency)}
                                </span>
                                <span style={PRICE_UNIT}>
                                  {t("platform.plansPerMonth")}
                                </span>
                              </p>
                            )}
                          </div>
                        </>
                      )}
                      {/* Deskripsi lewat KUNCI KAMUS, bukan kolom basis data
                          (alasan lengkap: `lib/plan-copy.ts`). Paket buatan
                          operator tidak punya kunci dan jatuh ke kolomnya. */}
                      {deskripsi ? <p style={LANDING_NOTE}>{deskripsi}</p> : null}
                      {/* Label "Termasuk" di atas kuota + butir. Tanpa itu
                          angka kuota menggantung di bawah nominal tanpa
                          mengatakan HUBUNGANNYA dengan angka itu — pembaca
                          harus menyimpulkan sendiri bahwa "3 PT" adalah yang
                          ia DAPAT, bukan yang ia bayar. */}
                      <p
                        style={{
                          margin: 0,
                          marginTop: "var(--ant-margin-xxs)",
                          fontSize: "var(--ant-font-size-sm)",
                          fontWeight: "var(--ant-font-weight-strong)",
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "var(--ant-color-text-secondary)",
                        }}
                      >
                        {t("landing.pricingIncluded")}
                      </p>
                      {plan.contactOnly ? (
                        /* Angka kuota paket rundingan adalah bawaan katalog,
                           bukan janji: yang berlaku disalin ke tenant saat
                           paketnya dipasang, dan justru itulah yang
                           dirundingkan. Tiga butir (#402/#404) — kuota
                           dirundingkan, migrasi & pelatihan, ketentuan khusus
                           — semuanya JUJUR dan tanpa jam layanan/SLA (§KLAIM
                           HARUS PUNYA SUMBER). */
                        <ul style={QUOTA_LIST}>
                          <li style={QUOTA_ROW}>
                            <CheckOutlined aria-hidden="true" style={CHECK} />
                            <span>{t("landing.pricingContactQuota")}</span>
                          </li>
                          <li style={QUOTA_ROW}>
                            <CheckOutlined aria-hidden="true" style={CHECK} />
                            <span>{t("landing.pricingContactSupport")}</span>
                          </li>
                          <li style={QUOTA_ROW}>
                            <CheckOutlined aria-hidden="true" style={CHECK} />
                            <span>{t("landing.pricingContactTerms")}</span>
                          </li>
                        </ul>
                      ) : (
                        <>
                          {/* Ubin kuota: DUA ubin sebaris — PT & pengguna —
                              angka dari kolom `plans` yang sama dengan halaman
                              paket di dalam aplikasi. Labelnya kata benda
                              polos (`pricingQuotaCompaniesLabel/UsersLabel`),
                              bukan kalimat berjumlah — supaya bahasa Inggris
                              tidak melahirkan "1 companies" lagi (#404). Sebagai
                              daftar (`<ul>`), pembaca layar membacanya "1, PT;
                              3, Pengguna". */}
                          <ul
                            data-landing-quota=""
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                              gap: "var(--ant-margin-xs)",
                              listStyle: "none",
                              margin: 0,
                              padding: 0,
                            }}
                          >
                            <li style={QUOTA_TILE}>
                              <span style={QUOTA_NUMBER}>{plan.maxCompanies}</span>
                              <span style={QUOTA_LABEL}>
                                {t("landing.pricingQuotaCompaniesLabel")}
                              </span>
                            </li>
                            <li style={QUOTA_TILE}>
                              <span style={QUOTA_NUMBER}>{plan.maxUsers}</span>
                              <span style={QUOTA_LABEL}>
                                {t("landing.pricingQuotaUsersLabel")}
                              </span>
                            </li>
                          </ul>
                          {/* Butir di luar kuota (#404) — hanya paket yang
                              punya janji bersumber (`lib/plan-copy.ts`
                              §SOROTAN); paket lain tidak mendapat butir
                              hiasan, dan daftarnya tidak dirender kosong. */}
                          {sorotan.length > 0 && (
                            <ul style={QUOTA_LIST}>
                              {sorotan.map((k) => (
                                <li key={k} style={QUOTA_ROW}>
                                  <CheckOutlined aria-hidden="true" style={CHECK} />
                                  <span>{t(k)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                      {/* Tombolnya menuju PENDAFTARAN apa adanya, TANPA
                          `?plan=`. Pendaftaran tidak menerima pilihan paket:
                          setiap tenant baru lahir di paket `trial`
                          (`registration-store.ts`), dan paket sungguhan
                          dipilih sesudah akunnya jadi. Parameter yang tidak
                          dibaca siapa pun akan terlihat seperti janji bahwa
                          paket ini sudah dipilih. */}
                      {/* ══ JALUR RUNDINGAN DI KAKI KARTU TERATAS (#408) ══════
                          Enterprise tidak lagi punya kartu sendiri: dua kartu
                          teratas bersaing untuk pembeli yang sama, dan funel
                          publik kini tiga anak tangga. Yang tersisa darinya
                          adalah SATU kalimat + tautan kontak di sini — hanya
                          bagi yang melewati kuota paket pemikulnya, dengan
                          angka kuota dari kolom katalog yang sama yang dirender
                          di butir "termasuk" di atas (bukan diketik). Tautannya
                          tautan teks (pola `faqMoreCta`), BUKAN tombol kedua:
                          kartu ini sudah memikul satu primer, dan dua tombol
                          bertumpuk berarti dua ajakan yang bersaing di kartu
                          yang justru ingin orang bayar sendiri. Tanpa alamat
                          kontak, kalimatnya tetap dan yang kurang disebut
                          sebagai konfigurasi (`pricingContactMissing`).
                          Diletakkan DI ATAS blok tombol, bukan di bawahnya:
                          tombol memakai `marginTop: auto` supaya berdiri di
                          dasar kartu sejajar dengan tombol kartu tetangga, dan
                          paragraf sesudahnya akan mendorong tombol Business
                          naik sendirian (terlihat di produksi 2026-08-17). */}
                      {planCarriesNegotiation(plan.key) && !plan.contactOnly && (
                        <p
                          data-landing-negotiate=""
                          style={{
                            ...LANDING_NOTE,
                            marginTop: "var(--ant-margin-xs)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {t("landing.pricingNegotiateNote", {
                            companies: plan.maxCompanies,
                            users: plan.maxUsers,
                          })}{" "}
                          {contactEmail ? (
                            <a
                              href={`mailto:${contactEmail}?subject=${encodeURIComponent("Enterprise")}`}
                              data-landing-link=""
                              style={{
                                color: "var(--ant-color-link)",
                                textDecoration: "none",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {t("landing.pricingContactCta")} →
                            </a>
                          ) : (
                            t("landing.pricingContactMissing")
                          )}
                        </p>
                      )}
                      {plan.contactOnly && !contactEmail ? (
                        <p style={{ ...LANDING_NOTE, marginTop: "auto" }}>
                          {t("landing.pricingContactMissing")}
                        </p>
                      ) : (
                        /* Tombol MELEBAR PENUH di layar sempit dan menyusut ke
                           lebarnya sendiri di ≥576px — dan itu datang dari arah
                           kolomnya (`[data-landing-actions]`), bukan dari lebar
                           yang dipaksakan pada tombolnya: anak flex melar sendiri
                           di kolom, dan menyusut sendiri di baris. */
                        /* Ini SATU-SATUNYA primer di repo ini yang lahir dari
                           `.map()` di luar `/select-company` — dan ia lolos
                           karena alasan yang berbeda: bukan "pilihan setara
                           berulang", melainkan pengecualian pendaratan. Ketiga
                           kartu paket menuju tempat yang SAMA (`/register`,
                           tanpa `?plan=`), jadi tiga blok biru di sini adalah
                           satu ajakan yang diulang, bukan tiga pilihan yang
                           bersaing. Paket rundingan `outline`: tujuannya beda
                           (mailto), dan itu memang aksi lain. */
                        <div
                          data-landing-actions=""
                          style={{ marginTop: "auto" }}
                        >
                          {plan.contactOnly ? (
                            <Button
                              href={`mailto:${contactEmail}?subject=${encodeURIComponent(plan.name)}`}
                              variant="outline"
                            >
                              {t("landing.pricingContactCta")}
                            </Button>
                          ) : (
                            /* `ButtonLink` — rute internal (#289). Kartu
                               rundingan di atas tetap `Button href` karena
                               tujuannya `mailto:`, yaitu justru tautan KELUAR
                               yang tidak boleh dinavigasi sisi-klien. */
                            <ButtonLink href="/register" variant="primary">
                              {t("landing.heroPrimary")}
                            </ButtonLink>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
          </div>

          {/* ══ YANG DIDAPAT SETIAP PAKET — SATU KALIMAT, BUKAN STRIP KEDUA ══
              Kartu paket hanya menjawab "apa BEDANYA" (kuota). Yang tidak
              dijawab siapa pun sampai kalimat ini ada adalah pertanyaan yang
              justru lebih dulu muncul: *apa yang saya dapat terlepas dari
              paket mana pun.* Tanpa itu pembaca menyimpulkan bahwa modul,
              bahasa, dan mata uang ikut dijatah — padahal `Plan` hanya punya
              `maxCompanies` & `maxUsers` (`prisma/platform/schema.prisma`).

              Sampai #397 jawabannya berbentuk `<dl>` tiga angka besar —
              SALINAN PERSIS strip bukti di hero (`landing-stats.tsx`), yang
              muncul dua kali identik di satu halaman. Bentuk yang tetap ada
              di sini adalah kalimatnya: seksi harga sudah memikul tiga kartu
              berisi nominal, dan tiga angka besar lagi di bawahnya bersaing
              dengan harga yang seharusnya paling dibaca. Yang menjawab "apa
              yang saya dapat" adalah KALIMAT; yang menjawab "seberapa banyak"
              adalah strip di hero, sekali. Alasan pilihannya:
              `pages/landing.md` §Strip fakta muncul sekali.

              Ketiga angkanya tetap DIHITUNG dari registri yang sama dengan
              strip hero, bukan diketik: modul baru muncul di sini tanpa ada
              yang perlu ingat. */}
          <p
            style={{
              ...LANDING_NOTE,
              marginTop: "var(--ant-margin-lg)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {t("landing.pricingAllNote", {
              modules: BUSINESS_MODULES.length,
              languages: LOCALES.length,
              currencies: CURRENCIES.join(" · "),
            })}
          </p>

          {/* Catatan uji coba & PPN. Keduanya mengubah angka yang baru saja
              dibaca orang (yang tertagih = harga + PPN), jadi keduanya berdiri
              tepat di bawah kartunya. */}
          <p
            style={{
              ...LANDING_NOTE,
              marginTop: "var(--ant-margin-xs)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {/* Uji coba disebut DI SINI, di sebelah harganya — dan sejak #397
                juga di tombol hero (`heroTrialCta`), dari konstanta yang sama:
                setiap tenant baru memang lahir di paket `trial` selama
                TRIAL_DAYS hari. */}
            {t("landing.pricingTrialNote", { days: TRIAL_DAYS })}
            {ppnEnabled &&
              ` ${t("landing.pricingTaxNote", { rate: DEFAULT_TAX_RATE })}`}
          </p>
        </>
      )}
    </LandingSection>
  );
}
