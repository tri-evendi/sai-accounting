/**
 * `/platform/billing/plans` — katalog paket, dibaca pelanggan sendiri.
 *
 * ══ PERTANYAAN YANG SELAMA INI TIDAK PUNYA HALAMAN ═════════════════════════
 * "Bagaimana kalau saya butuh lebih dari 3 perusahaan?" sampai sekarang hanya
 * dijawab satu kalimat di bawah kartu paket: *hubungi pengelola platform*.
 * Kalimat itu benar tapi tidak cukup — ia menyuruh orang bertanya tanpa
 * memberinya bahan untuk bertanya. Halaman ini adalah bahan itu: apa saja yang
 * dijual, berapa harganya, dan kuota apa yang didapat.
 *
 * ══ TIGA KEPUTUSAN YANG MENJADIKANNYA SWALAYAN ═════════════════════════════
 * Mesinnya sudah lama ada — `changeTenantPlan`, ber-audit, dipakai konsol
 * operator. Yang belum ada adalah tiga jawaban KOMERSIAL, dan tak satu pun
 * boleh ditebak oleh kode. Ketiganya kini terjawab (aritmetikanya di
 * `lib/plan-change.ts`, tempat ia bisa diuji tanpa basis data):
 *
 *   • PRORATA SELISIH. Naik paket di hari ke-20 dari 30 membayar
 *     `(baru − lama) × 10/30`, dan tanggal tagihan berikutnya TIDAK bergeser.
 *   • PPN mengikuti tagihan langganan biasa — `platformInvoiceAmounts()` yang
 *     sama, tarif dari `lib/tax.ts`, sakelar `PLATFORM_PPN_DISABLED`. Tidak ada
 *     aturan pajak kedua yang bisa menyimpang dari yang pertama.
 *   • TURUN PAKET DITOLAK bila pemakaian melampaui kuota baru — bukan
 *     "diizinkan dengan peringatan" seperti di konsol operator, sebab di sana
 *     ada manusia yang membaca peringatannya dan tahu buku mana yang boleh
 *     ditutup. Di sini tidak ada.
 *
 * Keputusannya sendiri TIDAK dihitung di halaman ini: tombolnya memanggil
 * `/api/tenant/billing/plan-change`, dan server yang menimbang kuota, prorata,
 * dan penolakan dari pemakaian NYATA. Halaman ini hanya menyediakan
 * perbandingan dan kalimat konfirmasi yang menyebut konsekuensinya.
 *
 * Katalog boleh gagal dengan tenang (`activePlans()` → `null`): platform mati
 * tidak boleh mematikan halaman yang menjelaskan langganan.
 *
 * ══ ⚠ HALAMAN HARGA DI DALAM APLIKASI, BUKAN HALAMAN PEMASARAN (#200) ══════
 * Ini satu-satunya tempat di aplikasi internal yang menampilkan DAFTAR HARGA,
 * dan sejak semua permukaan memakai token AntD yang sama, batas antara ia dan
 * halaman pendaratan publik `/` menjadi lebih mudah kabur — bukan lebih sulit.
 * Yang menjaganya bukan palet melainkan BENTUK, dan ketiganya disengaja:
 *
 *   • kepalanya `PageHeader` + breadcrumb (Akun → Langganan → Paket), jadi ia
 *     terbaca sebagai HALAMAN DI DALAM panel akun, bukan sebagai pendaratan;
 *   • tidak ada hero, tidak ada kartu "paling populer", tidak ada paket yang
 *     dibesarkan atau ditinggikan — perbandingan datar, urutan katalog;
 *   • CTA-nya menyebut TINDAKANNYA ("Pilih paket ini") dan berujung pada
 *     dialog yang menyebut konsekuensi uangnya, bukan "Mulai sekarang".
 *
 * Kerapatan MASTER.md (6/10) berlaku penuh di sini; kelonggaran `py-16 sm:py-24`
 * di `design-system/sai-accounting/pages/landing.md` berlaku HANYA untuk `/`.
 * Berkas ini juga tidak mengimpor satu pun komponen dari `components/landing/**`.
 *
 * ⚠ **Sejak #303 halaman ini BERWARNA, dan itu tidak melonggarkan satu pun
 * kalimat di atas.** Kepala kartu paket memakai nada
 * (`components/tenant/platform-tone.ts`) — resep `color-mix` yang sama dengan
 * pendaratan, kadar yang diukur sendiri, lingkup `[data-platform]` sendiri, dan
 * NOL impor lintas batas. Ketiga penjaga bentuk tetap berlaku: masih ada
 * `PageHeader` + breadcrumb, masih tidak ada hero, dan masih tidak ada kartu
 * "paling populer" — nada terkuat halaman ini menandai paket **yang sedang
 * berjalan**, sebuah fakta tentang tenant ini, bukan sebuah anjuran membeli.
 */
import { CheckOutlined } from "@ant-design/icons";
import { platformChip, platformHead } from "@/components/tenant/platform-tone";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { activePlans } from "@/lib/plan-catalog";
import { planDescriptionKey, planHighlightKeys } from "@/lib/plan-copy";
import { periodDaysFor } from "@/lib/plan-change";
import { formatMoney } from "@/lib/money-format";

import { PlanAction } from "./plan-actions";
import { getT } from "@/lib/i18n/server";
import { billingOverviewForTenant } from "@/lib/subscription-store";
import { requireTenantPagePermission } from "@/lib/tenant-guard";

export const dynamic = "force-dynamic";

/*
 * Seluruh isi halaman ini dirender DI DALAM `Card`, dan `Card` adalah komponen
 * AntD yang membawa `css-var-root` — jadi variabel `--ant-…` teratasi di sini
 * (#227). Tidak ada token `:root` aplikasi maupun hex di berkas ini.
 */
const CARD_HEADING: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  color: "var(--ant-color-text)",
};

const BODY: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.625,
  color: "var(--ant-color-text-secondary)",
};

/** Harga: 24px tebal. Sengaja `fontSizeHeading3`, BUKAN ukuran hero. */
const PRICE: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-heading-3)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  fontVariantNumeric: "tabular-nums",
  color: "var(--ant-color-text)",
};

/**
 * Kepala kartu paket — bidang bernada (#303).
 *
 * ⚠ Dua radius itu WAJIB dan hanya terlihat sesudah kepalanya berwarna: kepala
 * adalah anak PERTAMA `.ant-card` (badan kartu `display: contents`, lihat
 * `ui/card.tsx`), dan `.ant-card` tidak memasang `overflow: hidden`. Tanpa
 * keduanya bidang berwarnanya menyembul sebagai dua sudut siku di luar tepi
 * kartu yang membulat.
 */
const PLAN_HEADER: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  borderTopLeftRadius: "var(--ant-border-radius-lg)",
  borderTopRightRadius: "var(--ant-border-radius-lg)",
};

/** Kisi paket yang membagi lebarnya sendiri — bekas `sm:grid-cols-2 lg:grid-cols-3`. */
const PLAN_GRID: React.CSSProperties = {
  listStyle: "none",
  display: "grid",
  gap: 16,
  margin: 0,
  padding: 0,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
};

export default async function PlatformPlansPage() {
  const { tenant } = await requireTenantPagePermission("tenant.billing");
  const t = await getT();

  const [plans, overview] = await Promise.all([
    activePlans(),
    billingOverviewForTenant(tenant.tenantId),
  ]);

  /* Paket berjalan datang dari snapshot KENDALI (`tenants.plan_key`), bukan
   * dari katalog: itu yang benar-benar berlaku bagi tenant ini, termasuk bila
   * paketnya sudah ditarik dari penjualan dan karena itu tidak ada di daftar. */
  const currentKey = overview?.tenant.planKey ?? null;

  /* Tombol pindah paket hanya muncul bila ada LANGGANAN BERJALAN: tanpa
   * periode dan harga snapshot-nya, tidak ada dasar untuk menghitung prorata —
   * dan tombol yang tidak bisa menghitung apa pun lebih buruk daripada tidak
   * ada tombol. Tenant tanpa langganan (platform mati / belum di-seed) karena
   * itu tetap melihat katalog, tapi tanpa aksi. */
  const subscription = overview?.billing?.subscription ?? null;
  const period = subscription
    ? periodDaysFor(subscription.currentPeriodStart, subscription.currentPeriodEnd, new Date())
    : null;

  return (
    <>
      <PageHeader
        title={t("platform.plansTitle")}
        description={t("platform.plansDescription")}
        breadcrumbs={[
          { label: t("platform.title"), href: "/platform" },
          { label: t("tenantSettings.title"), href: "/platform/billing" },
          { label: t("platform.plansTitle") },
        ]}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {plans === null ? (
          <Card>
            <CardContent>
              <p style={BODY}>{t("platform.plansUnavailable")}</p>
            </CardContent>
          </Card>
        ) : plans.length === 0 ? (
          <Card>
            <CardContent>
              <p style={BODY}>{t("platform.plansEmpty")}</p>
            </CardContent>
          </Card>
        ) : (
          <ul style={PLAN_GRID}>
            {plans.map((plan) => {
              const current = plan.key === currentKey;
              return (
                <li key={plan.key}>
                  {/* Paket berjalan ditandai TEPI + LENCANA BERTEKS + NADA
                      TERKUAT; ia tidak dibesarkan atau ditinggikan — tak ada
                      paket yang "dijual lebih keras" di sini. */}
                  <Card
                    style={{
                      height: "100%",
                      ...(current
                        ? {
                            borderColor: "var(--ant-color-primary)",
                            boxShadow: "0 0 0 1px var(--ant-color-primary)",
                          }
                        : null),
                    }}
                  >
                    {/* ══ KENAPA KEPALANYA BERNADA DAN BADANNYA TIDAK ══════
                        Badan kartu inilah yang MEMIKUL TOMBOL ("Pilih paket
                        ini", `variant="default"` = isian primer). Isian itu
                        berjarak 3,55:1 dari `colorBgContainer` di tema gelap —
                        sudah tipis, dan setiap nada menerangkan latarnya
                        sehingga MEMAKAN jarak tersebut. Nada 32% menjatuhkannya
                        ke 2,59–2,97:1, di bawah ambang 3:1 untuk grafis
                        non-teks (MASTER.md §Ambang kontras): tombolnya berhenti
                        bisa ditemukan sebagai bidang.

                        Karena itu nada tinggal di KEPALA, tempat yang hanya
                        berisi teks dan lencana. Angkanya dihitung ulang tiap
                        suite di `tests/platform-colors.test.ts`.

                        Hue-nya SATU untuk semua kartu (violet = wilayah
                        "katalog paket"). Hue yang berputar per kartu akan
                        terbaca sebagai peringkat yang tidak ada — tidak ada
                        pembaca yang bisa menyimpulkan "violet lebih tinggi
                        dari cyan". Yang membedakan kartu berjalan dari sisanya
                        adalah KADAR-nya (32% vs 16%), dan itu pun penanda
                        ketiga sesudah lencana berteks dan tepi merek. */}
                    <CardHeader
                      style={{
                        ...PLAN_HEADER,
                        background: current ? platformChip("violet") : platformHead("violet"),
                      }}
                    >
                      <h2 style={CARD_HEADING}>{plan.name}</h2>
                      {/* Penanda paket berjalan adalah LENCANA BERTEKS, bukan
                          sekadar tepi berwarna — tepi saja tidak terbaca oleh
                          siapa pun yang tidak membedakan warnanya. */}
                      {current && <Badge variant="success">{t("platform.plansCurrent")}</Badge>}
                    </CardHeader>
                    <CardContent>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {/* Paket berharga RUNDINGAN tidak memajang nominal: kolom
                            harganya berisi 0, dan "Rp 0" di sini terbaca sebagai
                            gratis. Tombol swalayannya pun tidak dirender — tapi
                            yang MENOLAK adalah route `plan-change`, bukan cabang
                            ini (tombol yang hilang bukan penjaga). */}
                        {plan.contactOnly ? (
                          <p style={{ ...PRICE, fontVariantNumeric: "normal" }}>
                            {t("landing.pricingContactPrice")}
                          </p>
                        ) : (
                          <>
                            <p style={PRICE}>
                              {formatMoney(plan.priceMonthly, plan.currency)}
                              <span
                                style={{
                                  fontSize: "var(--ant-font-size-sm)",
                                  fontWeight: 400,
                                  color: "var(--ant-color-text-secondary)",
                                }}
                              >
                                {t("platform.plansPerMonth")}
                              </span>
                            </p>
                            {plan.priceYearly !== null && (
                              <p
                                style={{
                                  ...BODY,
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                {formatMoney(plan.priceYearly, plan.currency)}
                                {t("platform.plansPerYear")}
                              </p>
                            )}
                          </>
                        )}
                        {/* Deskripsi lewat kunci kamus — sama persis dengan
                            kartu paket di pendaratan. Halaman ini berbahasa
                            pengguna yang sudah masuk, jadi kolom basis data
                            berbahasa Indonesia di sini menghasilkan kegagalan
                            yang sama, hanya tanpa saksi dari luar. Alasannya di
                            `lib/plan-copy.ts`. */}
                        {(() => {
                          const kunci = planDescriptionKey(plan.key);
                          const deskripsi = kunci ? t(kunci) : plan.description;
                          return deskripsi ? <p style={BODY}>{deskripsi}</p> : null;
                        })()}
                        <ul
                          style={{
                            listStyle: "none",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            margin: 0,
                            padding: 0,
                            fontSize: "var(--ant-font-size)",
                            color: "var(--ant-color-text)",
                          }}
                        >
                          {[
                            t("platform.plansQuotaCompanies", { max: plan.maxCompanies }),
                            t("platform.plansQuotaUsers", { max: plan.maxUsers }),
                            /* Butir bersumber di luar kuota (#404) — daftar
                               yang SAMA dengan kartu harga publik, supaya
                               yang dijanjikan di luar tidak berbeda dengan
                               yang tampak di dalam. */
                            ...planHighlightKeys(plan.key).map((kunci) => t(kunci)),
                          ].map((line) => (
                            <li
                              key={line}
                              style={{ display: "flex", alignItems: "flex-start", gap: 8 }}
                            >
                              {/* Centang = IKON (non-teks), jadi warna penuh
                                  `colorSuccess` sah di sini — ambangnya 3:1. */}
                              <CheckOutlined aria-hidden="true" style={{ fontSize: 16, marginTop: 2,
                                  flexShrink: 0,
                                  color: "var(--ant-color-success)" }} />
                              <span style={{ fontVariantNumeric: "tabular-nums" }}>{line}</span>
                            </li>
                          ))}
                        </ul>
                        {/* Paket berjalan tidak punya tombol menuju dirinya
                            sendiri; lencana di kepala kartu yang menyatakannya. */}
                        {!current && !plan.contactOnly && subscription && period && (
                          <PlanAction
                            planKey={plan.key}
                            planName={plan.name}
                            priceMonthly={plan.priceMonthly}
                            currentPrice={Number(subscription.price)}
                            remainingDays={period.remainingDays}
                            periodDays={period.periodDays}
                          />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        {/* Prosesnya apa adanya. Tidak menyebutkannya sama sekali akan membuat
            halaman ini terlihat seperti toko yang tombol belinya hilang. */}
        <Card>
          <CardHeader style={{ ...PLAN_HEADER, background: platformHead("violet") }}>
            <h2 style={CARD_HEADING}>{t("platform.plansUpgradeHeading")}</h2>
          </CardHeader>
          <CardContent>
            <p style={BODY}>{t("platform.plansUpgradeBody")}</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
