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
 * Bidang tagihan itulah yang dulu paling menderita di kolom
 * `max-w-md`: tabel tagihan LIMA KOLOM di dalam ruang isi 384px menggeser
 * dirinya sendiri secara mendatar bahkan di layar 1440px. Pembungkus
 * `overflow-x-auto` tangan yang dulu melapisinya juga dilepas — primitif
 * `Table` sudah membawa pembungkus geser sendiri (MASTER.md §Primitif), jadi
 * yang dihasilkan lapisan kedua hanyalah dua batang gulung bersarang.
 */
import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money-format";
import {
  isReadOnlyTenantStatus,
  platformInvoiceAmounts,
  trialCountdown,
} from "@/lib/subscription-lifecycle";
import type { BillingOverview } from "@/lib/subscription-store";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

import { BillingProfileForm, PayInvoice } from "./billing-actions";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(d);
}

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
          <h2 className="text-lg font-semibold text-foreground">{t("tenantSettings.title")}</h2>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("tenantSettings.noSubscription")}
          </p>
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

  return (
    <>
      {/* Paket, status & pemakaian — dari KENDALI (snapshot), selalu tampil.
          Berdampingan pada layar lebar: keduanya menjawab satu pertanyaan
          ("apa yang saya punya, dan berapa yang sudah terpakai"). */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-foreground">{t("tenantSettings.title")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {t("tenantSettings.description")}
          </p>
        </CardHeader>
        <CardContent>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {t("tenantSettings.planHeading")}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="default">{overview.tenant.planKey}</Badge>
              <span className="text-muted-foreground">{t("tenantSettings.statusLabel")}:</span>
              <Badge variant={readOnly ? "warning" : "success"}>
                {statusKey(overview.tenant.status)}
              </Badge>
            </div>
            {overview.tenant.trialEndsAt && (
              <p className="text-sm text-muted-foreground">
                {t("tenantSettings.trialEndsAt")}: {formatDate(overview.tenant.trialEndsAt)}
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
                className={
                  trial.urgent
                    ? "flex flex-wrap items-start gap-3 rounded-lg border border-warning bg-warning-soft p-4 text-warning-strong"
                    : "flex flex-wrap items-start gap-3 rounded-lg border border-border bg-muted p-4 text-foreground"
                }
              >
                <CalendarClock className="mt-0.5 size-5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium">
                    {trial.days > 0
                      ? t("tenantSettings.trialDaysLeft", { days: trial.days })
                      : t("tenantSettings.trialOver")}
                  </p>
                  {trialCharge && (
                    <p className="text-sm tabular-nums">
                      {t("tenantSettings.trialFirstInvoice", { amount: trialCharge })}
                    </p>
                  )}
                  <p className="text-sm">{t("tenantSettings.trialUnpaidNote")}</p>
                </div>
                <Button asChild size="sm" variant={trial.urgent ? "primary" : "outline"}>
                  <Link href="/platform/billing/plans">{t("platform.plansViewLabel")}</Link>
                </Button>
              </div>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("tenantSettings.planChangeNote")}
            </p>
          </section>
        </CardContent>
      </Card>

      {/* Riwayat tagihan — dari PLATFORM, dan boleh "mati". */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-foreground">
            {t("tenantSettings.billingHeading")}
          </h2>
        </CardHeader>
        <CardContent className="space-y-4">
          {overview.billing === null ? (
            <p className="rounded-lg border border-border bg-muted p-3 text-sm leading-relaxed text-muted-foreground">
              {t("tenantSettings.billingUnavailable")}
            </p>
          ) : (
            <>
              {overview.billing.subscription ? (
                <p className="text-sm text-muted-foreground">
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
                    date: formatDate(overview.billing.subscription.currentPeriodEnd),
                  })}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("tenantSettings.noSubscription")}
                </p>
              )}
              {overview.billing.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("tenantSettings.noInvoices")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t("tenantSettings.invoiceNumber")}</TableHead>
                      <TableHead>{t("tenantSettings.invoiceDue")}</TableHead>
                      <TableHead className="text-right">
                        {t("tenantSettings.invoiceTotal")}
                      </TableHead>
                      <TableHead>{t("tenantSettings.statusLabel")}</TableHead>
                      <TableHead>{t("billing.payColumn")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.billing.invoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium text-foreground">
                          {invoice.number}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(invoice.dueDate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-foreground">
                          {formatMoney(Number(invoice.total), invoice.currency)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={invoice.status === "paid" ? "success" : "default"}>
                            {t(`tenantSettings.invoiceStatus.${invoice.status}` as DictionaryKey)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {/* "Bayar" hanya untuk tagihan TERBUKA (issue #141) —
                              VA/QRIS; tagih-lalu-ingatkan, bukan auto-debit. */}
                          {invoice.status === "issued" ? (
                            <PayInvoice invoiceId={invoice.id} pending={invoice.pendingPayment} />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
          {/* Profil penagihan — NPWP lawan transaksi untuk Faktur Pajak KAMI
              (issue #141). ⚠ Kewajiban PPN/e-Faktur langganan harus dikonfirmasi
              penasihat pajak; ini mekanisme datanya. Digarisi di atas: ia
              formulir yang bisa disimpan, bukan lanjutan bacaan tabel. */}
          <div className="space-y-2 border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">
              {t("billing.profileHeading")}
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("billing.profileHint")}
            </p>
            <BillingProfileForm profile={overview.billing?.profile ?? null} />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
