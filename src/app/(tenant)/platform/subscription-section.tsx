/**
 * Langganan, kuota, dan riwayat tagihan — bagian OWNER SAJA dari `/platform`
 * (issue #172; isinya berasal dari halaman /tenant issue #140/#141).
 *
 * ══ KENAPA BERKAS TERSENDIRI ═══════════════════════════════════════════════
 * Sejak /platform menjadi pendaratan pasca-masuk SETIAP anggota tenant, apa
 * yang dilihat seorang `member` dan apa yang dilihat owner berbeda jauh — dan
 * pemisahannya tidak boleh berupa selusin `{canX && …}` yang berserak di satu
 * berkas panjang, tempat satu tanda kurung yang lepas mengubah siapa melihat
 * apa tanpa satu pun tes berbunyi.
 *
 * Karena itu seluruh permukaan berizin `tenant.billing` tinggal di sini, dan
 * halamannya memanggil komponen ini HANYA di dalam cabang izinnya. Datanya pun
 * diambil di dalam cabang yang sama dan dioper sebagai prop: untuk yang tidak
 * berhak, query langganan TIDAK PERNAH BERJALAN — bukan sekadar hasilnya tak
 * dirender.
 *
 * Riwayat tagihan datang dari `sai_platform` dan boleh gagal dengan tenang
 * ("penagihan tidak terjangkau"): penagihan mati tidak boleh mematikan halaman
 * yang menjelaskan keadaan langganan. Paket/kuota datang dari basis data
 * KENDALI (snapshot #140) dan selalu terjawab.
 *
 * ══ DUA KARTU, DAN KENAPA TABELNYA BARU SEKARANG MUAT ══════════════════════
 * Isinya dipisah menurut ASALNYA, yang juga pemisahan yang benar bagi
 * pembacanya: apa yang saya punya (paket, dari KENDALI, selalu terjawab) vs
 * apa yang harus saya bayar (tagihan + profil, dari PLATFORM, boleh mati).
 *
 * ⚠ KUOTA TIDAK LAGI DI SINI. Angka pemakaian vs kuota naik ke baris kartu
 * ringkasan di kepala halaman (`page.tsx`) — itu yang paling sering dicari
 * pemilik, dan di sini ia terkubur di tengah gulungan. Yang ikut pindah adalah
 * `usageHeading`-nya: angka yang sama muncul di satu tempat saja, sebab dua
 * salinan akan berbeda pada hari salah satunya diubah.
 *
 * ══ SETELAH ANTD (issue #200) ══════════════════════════════════════════════
 * Tabel tagihan pindah ke `StaticTable` (aturan #189: dirender server, tanpa
 * satu pun kendali interaktif), dan kolom nominalnya `moneyColumn` dengan mata
 * uang DIBACA PER BARIS — tagihan tenant tidak selalu IDR.
 *
 * Warna: seluruh isi berkas ini dirender DI DALAM `Card`, dan `Card` adalah
 * komponen AntD yang membawa `css-var-root`, jadi variabel `--ant-…` teratasi
 * di sini (#227). Tidak ada satu pun token `:root` aplikasi yang dipakai.
 */
import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { moneyColumn } from "@/components/ui/money-column";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { formatMoney, type CurrencyCode } from "@/lib/money-format";
import { formatDateMedium } from "@/lib/utils";
import {
  isReadOnlyTenantStatus,
  platformInvoiceAmounts,
  trialCountdown,
} from "@/lib/subscription-lifecycle";
import type { BillingOverview } from "@/lib/subscription-store";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

import { BillingProfileForm, PayInvoice } from "./billing-actions";

const CARD_HEADING: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  color: "var(--ant-color-text)",
};

const SUB_HEADING: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  color: "var(--ant-color-text)",
};

const BODY: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.625,
  color: "var(--ant-color-text-secondary)",
};

const SMALL: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-sm)",
  lineHeight: 1.625,
  color: "var(--ant-color-text-secondary)",
};

const STACK_SM: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const STACK_MD: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 16 };

type Invoice = NonNullable<BillingOverview["billing"]>["invoices"][number];

export async function SubscriptionSection({
  overview,
}: {
  overview: BillingOverview | null;
}) {
  const t = await getT();

  if (!overview) {
    return (
      <Card>
        <CardHeader>
          <h2 style={CARD_HEADING}>{t("tenantSettings.title")}</h2>
        </CardHeader>
        <CardContent>
          <p style={BODY}>{t("tenantSettings.noSubscription")}</p>
        </CardContent>
      </Card>
    );
  }

  const statusKey = (status: string) => t(`tenantSettings.status.${status}` as DictionaryKey);
  const readOnly = isReadOnlyTenantStatus(overview.tenant.status);

  /* Hitung mundur hanya bermakna selama benar-benar UJI COBA — tenant `active`
   * yang kebetulan masih menyimpan `trial_ends_at` lama tidak boleh melihat
   * spanduk yang menakut-nakuti tentang tagihan yang sudah lewat. */
  const trial =
    overview.tenant.status === "trialing" ? trialCountdown(overview.tenant.trialEndsAt) : null;
  const subscriptionPrice = overview.billing?.subscription?.price;
  const trialCharge =
    trial && subscriptionPrice
      ? formatMoney(
          Number(
            platformInvoiceAmounts(
              subscriptionPrice,
              process.env.PLATFORM_PPN_DISABLED !== "true"
            ).total
          ),
          overview.billing?.subscription?.currency ?? "IDR"
        )
      : null;

  const invoiceColumns: SaiColumns<Invoice> = [
    {
      key: "number",
      title: t("tenantSettings.invoiceNumber"),
      align: "left",
      render: (_v, invoice) => (
        <span
          style={{
            fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
            color: "var(--ant-color-text)",
          }}
        >
          {invoice.number}
        </span>
      ),
    },
    {
      key: "due",
      title: t("tenantSettings.invoiceDue"),
      align: "left",
      render: (_v, invoice) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>
          {formatDateMedium(invoice.dueDate)}
        </span>
      ),
    },
    /* Nominal lewat `moneyColumn`: rata kanan, tabular, format id-ID, dan mata
       uang DIBACA PER BARIS — bukan diketik ulang per sel. */
    moneyColumn<Invoice>({
      dataIndex: "total",
      title: t("tenantSettings.invoiceTotal"),
      currency: (invoice) => invoice.currency as CurrencyCode,
    }),
    {
      key: "status",
      title: t("tenantSettings.statusLabel"),
      align: "left",
      render: (_v, invoice) => (
        <Badge variant={invoice.status === "paid" ? "success" : "default"}>
          {t(`tenantSettings.invoiceStatus.${invoice.status}` as DictionaryKey)}
        </Badge>
      ),
    },
    {
      key: "pay",
      title: t("billing.payColumn"),
      align: "left",
      /* "Bayar" hanya untuk tagihan TERBUKA (issue #141) — VA/QRIS;
         tagih-lalu-ingatkan, bukan auto-debit. */
      render: (_v, invoice) =>
        invoice.status === "issued" ? (
          <PayInvoice invoiceId={invoice.id} pending={invoice.pendingPayment} />
        ) : (
          <span
            style={{ fontSize: "var(--ant-font-size-sm)", color: "var(--ant-color-text-secondary)" }}
          >
            —
          </span>
        ),
    },
  ];

  return (
    <>
      {/* Paket, status & pemakaian — dari KENDALI (snapshot), selalu tampil.
          Berdampingan pada layar lebar: keduanya menjawab satu pertanyaan
          ("apa yang saya punya, dan berapa yang sudah terpakai"). */}
      <Card>
        <CardHeader>
          <h2 style={CARD_HEADING}>{t("tenantSettings.title")}</h2>
          <p style={{ ...BODY, marginTop: "var(--ant-margin-xxs)" }}>
            {t("tenantSettings.description")}
          </p>
        </CardHeader>
        <CardContent>
          <section style={STACK_SM}>
            <h3 style={SUB_HEADING}>{t("tenantSettings.planHeading")}</h3>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
                fontSize: "var(--ant-font-size)",
              }}
            >
              <Badge variant="default">{overview.tenant.planKey}</Badge>
              <span style={{ color: "var(--ant-color-text-secondary)" }}>
                {t("tenantSettings.statusLabel")}:
              </span>
              <Badge variant={readOnly ? "warning" : "success"}>
                {statusKey(overview.tenant.status)}
              </Badge>
            </div>
            {overview.tenant.trialEndsAt && (
              <p style={BODY}>
                {t("tenantSettings.trialEndsAt")}: {formatDateMedium(overview.tenant.trialEndsAt)}
              </p>
            )}
            {trial && (
              /* ⚠ SPANDUK UJI COBA — bukan hiasan.
               *
               * Sejak uji coba menjadi uji coba paket PRO, hari terakhirnya
               * tidak berakhir dengan tagihan Rp 0 melainkan dengan TAGIHAN
               * SUNGGUHAN. Sampai spanduk ini ada, satu-satunya petunjuknya
               * adalah baris abu-abu berisi tanggal di atas — kalimat yang
               * benar dan tidak memberi tahu apa pun tentang apa yang akan
               * terjadi. Pelanggan pertama yang terkejut menerima tagihan
               * adalah pelanggan yang tidak pernah membaca tanggal itu.
               *
               * NOMINALNYA LENGKAP DENGAN PPN, lewat `platformInvoiceAmounts`
               * yang SAMA dengan yang menerbitkan tagihannya. Menyebut harga
               * paket telanjang di sini akan mengulang persis kesalahan yang
               * ditutup di halaman harga: angka yang tidak akan sama dengan
               * yang tertagih.
               *
               * Warna TIDAK sendirian: ada ikon dan ada kalimat yang menyebut
               * sisa harinya (MASTER.md §Anti-Patterns). */
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: 16,
                  borderRadius: "var(--ant-border-radius-lg)",
                  border: `1px solid var(${
                    trial.urgent ? "--ant-color-warning-border" : "--ant-color-border-secondary"
                  })`,
                  background: `var(${
                    trial.urgent ? "--ant-color-warning-bg" : "--ant-color-fill-quaternary"
                  })`,
                  color: `var(${
                    trial.urgent ? "--ant-color-money-pending" : "--ant-color-text"
                  })`,
                }}
              >
                <CalendarClock size={20} style={{ marginTop: 2, flexShrink: 0 }} aria-hidden />
                <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "var(--ant-font-size)",
                      fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
                    }}
                  >
                    {trial.days > 0
                      ? t("tenantSettings.trialDaysLeft", { days: trial.days })
                      : t("tenantSettings.trialOver")}
                  </p>
                  {trialCharge && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: "var(--ant-font-size)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {t("tenantSettings.trialFirstInvoice", { amount: trialCharge })}
                    </p>
                  )}
                  <p style={{ margin: 0, fontSize: "var(--ant-font-size)" }}>
                    {t("tenantSettings.trialUnpaidNote")}
                  </p>
                </div>
                <Button asChild size="sm" variant={trial.urgent ? "primary" : "outline"}>
                  <Link href="/platform/billing/plans">{t("platform.plansViewLabel")}</Link>
                </Button>
              </div>
            )}
            <p style={SMALL}>{t("tenantSettings.planChangeNote")}</p>
          </section>
        </CardContent>
      </Card>

      {/* Riwayat tagihan — dari PLATFORM, dan boleh "mati". */}
      <Card>
        <CardHeader>
          <h2 style={CARD_HEADING}>{t("tenantSettings.billingHeading")}</h2>
        </CardHeader>
        <CardContent>
          <div style={STACK_MD}>
            {overview.billing === null ? (
              <p
                style={{
                  ...BODY,
                  padding: 12,
                  borderRadius: "var(--ant-border-radius-lg)",
                  border: "1px solid var(--ant-color-border-secondary)",
                  background: "var(--ant-color-fill-quaternary)",
                }}
              >
                {t("tenantSettings.billingUnavailable")}
              </p>
            ) : (
              <>
                {overview.billing.subscription ? (
                  <p style={BODY}>
                    {t("tenantSettings.price", {
                      amount: formatMoney(
                        Number(overview.billing.subscription.price),
                        overview.billing.subscription.currency
                      ),
                      cycle:
                        overview.billing.subscription.billingCycle === "yearly"
                          ? t("tenantSettings.cycleYearly")
                          : t("tenantSettings.cycleMonthly"),
                    })}{" "}
                    ·{" "}
                    {t("tenantSettings.period", {
                      date: formatDateMedium(overview.billing.subscription.currentPeriodEnd),
                    })}
                  </p>
                ) : (
                  <p style={BODY}>{t("tenantSettings.noSubscription")}</p>
                )}
                {overview.billing.invoices.length === 0 ? (
                  <p style={BODY}>{t("tenantSettings.noInvoices")}</p>
                ) : (
                  <StaticTable
                    columns={invoiceColumns}
                    rows={overview.billing.invoices}
                    rowKey={(invoice) => invoice.id}
                  />
                )}
              </>
            )}
            {/* Profil penagihan — NPWP lawan transaksi untuk Faktur Pajak KAMI
                (issue #141). ⚠ Kewajiban PPN/e-Faktur langganan harus dikonfirmasi
                penasihat pajak; ini mekanisme datanya. Digarisi di atas: ia
                formulir yang bisa disimpan, bukan lanjutan bacaan tabel. */}
            <div
              style={{
                ...STACK_SM,
                paddingTop: 16,
                borderTop: "1px solid var(--ant-color-border-secondary)",
              }}
            >
              <h3 style={SUB_HEADING}>{t("billing.profileHeading")}</h3>
              <p style={SMALL}>{t("billing.profileHint")}</p>
              <BillingProfileForm profile={overview.billing?.profile ?? null} />
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
