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
import Link from "next/link";
import { CheckOutlined } from "@ant-design/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getT } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money-format";
import { activePlans } from "@/lib/plan-catalog";
import { TRIAL_DAYS } from "@/lib/registration";
import { DEFAULT_TAX_RATE } from "@/lib/tax";

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
    <section id="harga" className="scroll-mt-20 border-t border-border bg-muted/40 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t("landing.pricingHeading")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {t("landing.pricingBody")}
          </p>
        </div>

        {plans === null ? (
          <Card className="mt-8">
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("landing.pricingUnavailable")}
              </p>
            </CardContent>
          </Card>
        ) : plans.length === 0 ? (
          <Card className="mt-8">
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("landing.pricingEmpty")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <li key={plan.key}>
                  <Card
                    className={
                      plan.isRecommended
                        ? "flex h-full flex-col border-primary ring-1 ring-primary"
                        : "flex h-full flex-col"
                    }
                  >
                    <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                      {/* Sorotan paket adalah LENCANA BERTEKS, bukan sekadar
                          tepi berwarna: tepi saja tidak terbaca oleh siapa pun
                          yang tidak membedakan warnanya (MASTER.md
                          §Anti-Patterns). */}
                      {plan.isRecommended && <Badge variant="success">{t("landing.pricingRecommended")}</Badge>}
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-3">
                      {/* Paket berharga rundingan TIDAK memajang nominal.
                          Kolom harganya berisi 0, dan "Rp 0" di kartu penjualan
                          bukan sekadar salah — ia terbaca sebagai gratis. */}
                      {plan.contactOnly ? (
                        <p className="text-2xl font-bold text-foreground">
                          {t("landing.pricingContactPrice")}
                        </p>
                      ) : (
                        <>
                          <p className="text-2xl font-bold tabular-nums text-foreground">
                            {formatMoney(plan.priceMonthly, plan.currency)}
                            <span className="text-sm font-normal text-muted-foreground">
                              {t("platform.plansPerMonth")}
                            </span>
                          </p>
                          {plan.priceYearly !== null && (
                            <p className="text-sm tabular-nums text-muted-foreground">
                              {formatMoney(plan.priceYearly, plan.currency)}
                              {t("platform.plansPerYear")}
                            </p>
                          )}
                        </>
                      )}
                      {plan.description && (
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {plan.description}
                        </p>
                      )}
                      {/* Kuota memakai kunci yang SAMA dengan halaman paket di
                          dalam aplikasi: dua kalimat untuk angka yang sama akan
                          berbeda pada hari salah satunya disunting. */}
                      <ul className="space-y-1.5 text-sm text-foreground">
                        {plan.contactOnly ? (
                          /* Angka kuota paket rundingan adalah bawaan katalog,
                             bukan janji: kuota yang berlaku disalin ke tenant
                             saat paketnya dipasang, dan justru itulah yang
                             dirundingkan. Memajangnya berarti menjanjikan
                             angka yang belum disepakati siapa pun. */
                          <li className="flex items-start gap-2">
                            <CheckOutlined className="mt-0.5 shrink-0 text-success" aria-hidden style={{ fontSize: 16 }} />
                            <span>{t("landing.pricingContactQuota")}</span>
                          </li>
                        ) : (
                          <>
                            <li className="flex items-start gap-2">
                              <CheckOutlined className="mt-0.5 shrink-0 text-success" aria-hidden style={{ fontSize: 16 }} />
                              <span className="tabular-nums">
                                {t("platform.plansQuotaCompanies", { max: plan.maxCompanies })}
                              </span>
                            </li>
                            <li className="flex items-start gap-2">
                              <CheckOutlined className="mt-0.5 shrink-0 text-success" aria-hidden style={{ fontSize: 16 }} />
                              <span className="tabular-nums">
                                {t("platform.plansQuotaUsers", { max: plan.maxUsers })}
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
                      {plan.contactOnly ? (
                        contactEmail ? (
                          <Button asChild variant="outline" className="mt-auto w-full sm:w-auto">
                            <a href={`mailto:${contactEmail}?subject=${encodeURIComponent(plan.name)}`}>
                              {t("landing.pricingContactCta")}
                            </a>
                          </Button>
                        ) : (
                          <p className="mt-auto text-sm text-muted-foreground">
                            {t("landing.pricingContactMissing")}
                          </p>
                        )
                      ) : (
                        <Button asChild className="mt-auto w-full sm:w-auto">
                          <Link href="/register">{t("landing.heroPrimary")}</Link>
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-sm tabular-nums text-muted-foreground">
              {/* Uji coba disebut DI SINI, di sebelah harganya, bukan sebagai
                  janji terpisah di hero: setiap tenant baru memang lahir di
                  paket `trial` selama TRIAL_DAYS hari, dan angkanya diambil
                  dari konstanta yang sama dengan yang menghitungnya. */}
              {t("landing.pricingTrialNote", { days: TRIAL_DAYS })}
              {ppnEnabled && ` ${t("landing.pricingTaxNote", { rate: DEFAULT_TAX_RATE })}`}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
