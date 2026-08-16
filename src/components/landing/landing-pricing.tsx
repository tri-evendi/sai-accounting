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
import { planDescriptionKey } from "@/lib/plan-copy";
import { TRIAL_DAYS } from "@/lib/registration";
import { DEFAULT_TAX_RATE } from "@/lib/tax";

/**
 * Nominal paket — `fontSizeHeading3` (24px) tebal.
 *
 * Sengaja BUKAN skala hero: yang harus paling besar di halaman ini adalah
 * kalimat yang menjelaskan produknya, bukan angkanya. Halaman yang angkanya
 * lebih besar dari janjinya menjual harga, bukan pekerjaan.
 */
const PRICE: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-heading-3)",
  fontWeight: "var(--ant-font-weight-strong)",
};

const QUOTA_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "var(--ant-margin-xs)",
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

export async function LandingPricing() {
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
          <ul
            style={{
              /* Kolomnya DIHITUNG dari jumlah paket, bukan dipatok 3.
                 Semaian mengapalkan tiga paket dan hanya DUA yang `isPublic`
                 (`internal` milik penyedia tidak ditawarkan), jadi kisi yang
                 dipatok tiga menghasilkan dua kartu setengah lebar dengan
                 rongga di dalamnya — di setiap pemasangan, bukan hanya di
                 lingkungan pengembangan. Dibatasi 3 supaya katalog berisi
                 lima paket tidak melahirkan lima kolom sempit. */
              ...landingGrid(Math.min(plans.length, 3), 260),
              listStyle: "none",
              margin: 0,
              marginTop: "var(--ant-margin-lg)",
              padding: 0,
            }}
          >
            {plans.map((plan) => (
              <li key={plan.key}>
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
                    berteriak bersamaan. */}
                <Card
                  data-landing-card=""
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    background: LANDING_SURFACE,
                    borderRadius: "var(--sai-landing-radius)",
                    /* Sorotan paket: tepi merek + cincin setebal 1px. Ia
                       penanda KETIGA — yang pertama lencana berteks di
                       kepalanya, yang kedua nada kepala itu sendiri. */
                    ...(plan.isRecommended
                      ? {
                          borderColor: "var(--ant-color-primary)",
                          boxShadow: "0 0 0 1px var(--ant-color-primary)",
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
                      background: plan.isRecommended
                        ? landingChip("brand")
                        : landingFill("indigo"),
                      /* Kepala kartu adalah anak PERTAMA `.ant-card` (badan
                         kartu `display: contents`, lihat `ui/card.tsx`), dan
                         `.ant-card` TIDAK memasang `overflow: hidden`. Tanpa
                         dua radius ini bidang berwarnanya menyembul sebagai
                         dua sudut siku di luar tepi kartu yang membulat —
                         cacat yang hanya terlihat sesudah kepalanya berwarna,
                         jadi ia tidak pernah muncul sebelum perubahan ini. */
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
                         keputusan penjualan, bukan status berhasil. Alasan yang
                         sama dengan lencana modul inti. */
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
                    {/* Paket berharga rundingan TIDAK memajang nominal.
                        Kolom harganya berisi 0, dan "Rp 0" di kartu penjualan
                        bukan sekadar salah — ia terbaca sebagai gratis. */}
                    {plan.contactOnly ? (
                      <p style={PRICE}>{t("landing.pricingContactPrice")}</p>
                    ) : (
                      <>
                        <p
                          style={{
                            ...PRICE,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {formatMoney(plan.priceMonthly, plan.currency)}
                          <span
                            style={{
                              fontSize: "var(--ant-font-size)",
                              fontWeight: "normal",
                              color: "var(--ant-color-text-secondary)",
                            }}
                          >
                            {t("platform.plansPerMonth")}
                          </span>
                        </p>
                        {plan.priceYearly !== null && (
                          <p
                            style={{
                              ...LANDING_NOTE,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {formatMoney(plan.priceYearly, plan.currency)}
                            {t("platform.plansPerYear")}
                          </p>
                        )}
                        {/* ══ HEMAT TAHUNAN — DIHITUNG, TIDAK DIKETIK (#397) ══
                            Nominal tahunan sendirian menuntut pembaca
                            mengalikan 12 di kepalanya untuk tahu apakah ia
                            untung. Baris ini menjawabnya: selisih
                            `bulanan×12 − tahunan`, dan padanannya dalam
                            bulan — dari DUA kolom katalog yang sama yang
                            merender kedua harga di atasnya. Katalog yang
                            menghapus diskon tahunan (selisih 0) atau
                            memasang tahunan lebih MAHAL (negatif) membuat
                            barisnya hilang, bukan memajang "hemat Rp 0" /
                            "hemat −Rp …" — kalimat yang benar secara
                            aritmetika tapi terbaca sebagai halaman rusak. */}
                        {(() => {
                          if (plan.priceYearly === null) return null;
                          const hemat =
                            plan.priceMonthly * 12 - plan.priceYearly;
                          if (!(hemat > 0) || !(plan.priceMonthly > 0)) {
                            return null;
                          }
                          const bulan = hemat / plan.priceMonthly;
                          return (
                            <p
                              style={{
                                ...LANDING_NOTE,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {t("landing.pricingYearlySaving", {
                                amount: formatMoney(hemat, plan.currency),
                                /* Satu desimal, format `id-ID` (MASTER.md
                                   §angka): 1.198.000/599.000 = 2,0 → "2";
                                   pecahan yang bermakna tetap tampil ("1,5"). */
                                months: bulan.toLocaleString("id-ID", {
                                  maximumFractionDigits: 1,
                                }),
                              })}
                            </p>
                          );
                        })()}
                      </>
                    )}
                    {/* Deskripsi lewat KUNCI KAMUS, bukan kolom basis data.
                        Sampai perubahan ini baris ini merender
                        `plan.description` apa adanya — literal Indonesia dari
                        `scripts/seed-plans.ts` — sehingga kartu Pro berbahasa
                        Inggris berbunyi "Sampai tiga PT, lima belas pengguna."
                        tepat di atas baris kuota "3 companies / 15 users":
                        satu fakta, dua bahasa, tiga baris berjarak. Alasan
                        lengkap + kenapa bukan kolom per bahasa: `lib/plan-copy.ts`.
                        Paket buatan operator tidak punya kunci dan jatuh ke
                        kolomnya, jadi ia tetap tampil. */}
                    {(() => {
                      const kunci = planDescriptionKey(plan.key);
                      const deskripsi = kunci ? t(kunci) : plan.description;
                      return deskripsi ? (
                        <p style={LANDING_NOTE}>{deskripsi}</p>
                      ) : null;
                    })()}
                    {/* Kuota memakai kunci yang SAMA dengan halaman paket di
                        dalam aplikasi: dua kalimat untuk angka yang sama akan
                        berbeda pada hari salah satunya disunting. */}
                    {/* Label "Termasuk" di atas daftar kuota.
                        Tanpa itu baris centang menggantung tepat di bawah
                        nominal tanpa mengatakan HUBUNGANNYA dengan angka itu —
                        pembaca harus menyimpulkan sendiri bahwa "3 perusahaan"
                        adalah yang ia DAPAT, bukan yang ia bayar. Di kartu
                        harga, menyimpulkan adalah gesekan. */}
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
                    <ul
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "var(--ant-margin-xxs)",
                        listStyle: "none",
                        margin: 0,
                        padding: 0,
                        fontSize: "var(--ant-font-size)",
                      }}
                    >
                      {plan.contactOnly ? (
                        /* Angka kuota paket rundingan adalah bawaan katalog,
                           bukan janji: kuota yang berlaku disalin ke tenant
                           saat paketnya dipasang, dan justru itulah yang
                           dirundingkan. Memajangnya berarti menjanjikan
                           angka yang belum disepakati siapa pun. */
                        <li style={QUOTA_ROW}>
                          <CheckOutlined aria-hidden="true" style={CHECK} />
                          <span>{t("landing.pricingContactQuota")}</span>
                        </li>
                      ) : (
                        <>
                          <li style={QUOTA_ROW}>
                            <CheckOutlined aria-hidden="true" style={CHECK} />
                            <span
                              style={{ fontVariantNumeric: "tabular-nums" }}
                            >
                              {t("platform.plansQuotaCompanies", {
                                max: plan.maxCompanies,
                              })}
                            </span>
                          </li>
                          <li style={QUOTA_ROW}>
                            <CheckOutlined aria-hidden="true" style={CHECK} />
                            <span
                              style={{ fontVariantNumeric: "tabular-nums" }}
                            >
                              {t("platform.plansQuotaUsers", {
                                max: plan.maxUsers,
                              })}
                            </span>
                          </li>
                        </>
                      )}
                    </ul>
                    {/* Tombolnya menuju PENDAFTARAN apa adanya, TANPA
                        `?plan=`. Pendaftaran tidak menerima pilihan paket:
                        setiap tenant baru lahir di paket `trial`
                        (`registration-store.ts`), dan paket sungguhan
                        dipilih sesudah akunnya jadi. Parameter yang tidak
                        dibaca siapa pun akan terlihat seperti janji bahwa
                        paket ini sudah dipilih. */}
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
            ))}
          </ul>

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
