/**
 * `/operator` — RINGKASAN konsol operator.
 *
 * ══ KENAPA HALAMAN INI ADA ═════════════════════════════════════════════════
 * Sampai sekarang pendaratan konsol adalah DAFTAR TENANT: satu tabel tujuh
 * kolom berisi setiap pelanggan platform. Tabel itu benar dan tetap ada
 * (`./tenants`), tetapi ia bukan jawaban atas pertanyaan yang dibawa seseorang
 * ketika ia membuka `ops.` — "apakah ada yang perlu saya tangani hari ini?".
 * Menjawabnya dari tabel itu berarti membaca empat belas baris status satu per
 * satu dan menjumlahkannya di kepala sendiri.
 *
 * Yang dipajang di sini karena itu bukan "angka yang menarik" melainkan angka
 * yang MENUNTUT TINDAKAN: uji coba yang hampir berakhir (menelepon sebelum,
 * bukan sesudah), uji coba yang sudah lewat tapi statusnya belum bergerak
 * (penjadwal tidak jalan — lihat ubin putaran terakhir), tagihan yang lewat
 * jatuh tempo, dan tenant yang baru masuk.
 *
 * ══ DUA BIDANG, SATU YANG BOLEH MATI ═══════════════════════════════════════
 * Bagian KENDALI selalu tampil; bagian PLATFORM (`sai_platform`) jatuh ke satu
 * kalimat saat tak terjangkau — pola `billingOverviewForTenant`, dan alasannya
 * ada di `lib/operator/store.ts`. Halaman yang menjawab "apakah platformnya
 * sehat?" tidak boleh menjadi halaman pertama yang mati bersamanya.
 *
 * ══ `StatCard` DIPAKAI APA ADANYA, DAN ITU DISENGAJA ═══════════════════════
 * Ia tinggal di `components/dashboard/`, dan bidang operator memang dijaga
 * bersih dari chrome pelanggan — tetapi yang dilarang di sana adalah MENU,
 * SESI, dan IZIN pelanggan (lihat kepala `(operator)/layout.tsx`). `StatCard`
 * tidak memuat satu pun dari ketiganya: ia server component yang hanya
 * mengimpor `components/ui` dan tidak pernah menyentuh `auth()`, Prisma,
 * maupun modul bertenant. Menyalinnya ke `components/operator/` akan
 * menghasilkan ubin kedua dengan padding, ukuran, dan anak tangga warnanya
 * sendiri — yaitu persis keluhan yang `components/ui/stat-tile.ts` lahir untuk
 * mengakhiri.
 */

import Link from "next/link";
import { TeamOutlined } from "@ant-design/icons";

import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { requireOperatorPage } from "@/lib/operator/guard";
import { operatorOverview, type OperatorOverview } from "@/lib/operator/store";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { formatMoney } from "@/lib/money-format";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(d);
}

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

/** Status tenant yang berarti "buku terkunci" — sama dengan daftar tenant. */
const READ_ONLY_STATUSES = new Set(["suspended", "cancelled"]);

/** Teks sekunder di bawah ubin — sama dengan daftar tenant. */
const MUTED: React.CSSProperties = { color: "var(--ant-color-text-secondary)" };

/** "Penagihan tidak terjangkau" — kalimat jujur, bukan galat. */
const NOTICE: React.CSSProperties = {
  margin: 0,
  padding: "var(--ant-padding)",
  borderRadius: "var(--ant-border-radius-lg)",
  background: "var(--ant-color-fill-quaternary)",
  fontSize: "var(--ant-font-size)",
  color: "var(--ant-color-text-secondary)",
};

const SECTION_HEADING: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  color: "var(--ant-color-text)",
};

/**
 * Kisi ubin — `auto-fit` + `minmax`, bukan jumlah kolom tetap.
 *
 * Jumlah ubinnya BERUBAH menurut data (status langganan yang benar-benar ada),
 * jadi kolom tetap akan meninggalkan sel kosong pada sebagian pemasangan. Dan
 * sesuai catatan `PlatformShell`: yang menjaga keterbacaan di monitor lebar
 * adalah kisi yang menambah kolom, bukan wadah yang dikurung di tengah.
 */
const TILE_GRID: React.CSSProperties = {
  display: "grid",
  gap: "var(--ant-margin)",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
};

type NewestRow = OperatorOverview["control"]["newest"][number];

export default async function OperatorOverviewPage() {
  await requireOperatorPage();
  const t = await getT();
  const { control, revenue, platform } = await operatorOverview();

  const statusLabel = (value: string) => t(`tenantSettings.status.${value}` as DictionaryKey);

  const columns: SaiColumns<NewestRow> = [
    {
      key: "name",
      title: t("operator.tenants.colName"),
      align: "left",
      render: (_v, row) => (
        <Link
          href={`/operator/tenants/${row.id}`}
          style={{ color: "var(--ant-color-link)", fontWeight: 500 }}
        >
          {row.name}
        </Link>
      ),
    },
    {
      key: "slug",
      title: t("operator.tenants.colSlug"),
      align: "left",
      render: (_v, row) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>{row.slug}</span>
      ),
    },
    {
      key: "status",
      title: t("operator.tenants.colStatus"),
      align: "left",
      render: (_v, row) => (
        <Badge
          variant={
            READ_ONLY_STATUSES.has(row.status)
              ? "danger"
              : row.status === "active"
                ? "success"
                : "warning"
          }
        >
          {statusLabel(row.status)}
        </Badge>
      ),
    },
    {
      key: "created",
      title: t("operator.tenants.colCreated"),
      align: "left",
      render: (_v, row) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>
          {formatDate(row.createdAt)}
        </span>
      ),
    },
  ];

  const aktif = control.byStatus.active ?? 0;
  const ujiCoba = control.byStatus.trialing ?? 0;
  const menunggak = control.byStatus.past_due ?? 0;
  const ditangguhkan =
    (control.byStatus.suspended ?? 0) + (control.byStatus.cancelled ?? 0);

  return (
    <div>
      <PageHeader
        title={t("operator.overview.heading")}
        description={t("operator.overview.description")}
        actions={
          <ButtonLink href="/operator/tenants" variant="outline" size="sm">
            {t("operator.overview.openTenants")}
          </ButtonLink>
        }
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        {/* ── Bidang KENDALI: selalu benar, bahkan saat penagihan mati ───── */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={SECTION_HEADING}>{t("operator.overview.controlHeading")}</h2>
          <div style={TILE_GRID}>
            <StatCard
              title={t("operator.overview.tenantsTotal")}
              value={control.total}
              href="/operator/tenants"
            />
            <StatCard
              title={t("operator.overview.tenantsActive")}
              value={aktif}
              tone="success"
              href="/operator/tenants?status=active"
            />
            <StatCard
              title={t("operator.overview.tenantsTrialing")}
              value={ujiCoba}
              href="/operator/tenants?status=trialing"
              /* Dua angka yang MENUNTUT TINDAKAN, dan keduanya ada di baris
                 kedua ubin ini supaya "15 uji coba" tidak terbaca sebagai
                 kabar baik ketika sembilan di antaranya sudah kedaluwarsa. */
              hint={t("operator.overview.trialHint", {
                soon: control.trialsEndingSoon,
                expired: control.trialsExpired,
              })}
              tone={control.trialsExpired > 0 ? "warning" : "neutral"}
            />
            <StatCard
              title={t("operator.overview.tenantsPastDue")}
              value={menunggak}
              tone={menunggak > 0 ? "warning" : "neutral"}
              href="/operator/tenants?status=past_due"
            />
            {/* TANPA `href`, dan itu disengaja: ubin ini menjumlahkan DUA
                status (`suspended` + `cancelled`), sementara saringan daftar
                tenant hanya menerima satu. Tautan ke `?status=suspended` akan
                mendarat di daftar yang jumlahnya BERBEDA dari angka yang baru
                saja ditekan orangnya — bentuk kebohongan kecil yang membuat
                orang berhenti memercayai ubin lain di baris yang sama. */}
            <StatCard
              title={t("operator.overview.tenantsSuspended")}
              value={ditangguhkan}
              tone={ditangguhkan > 0 ? "danger" : "neutral"}
            />
            <StatCard title={t("operator.overview.companies")} value={control.companies} />
            <StatCard title={t("operator.overview.users")} value={control.users} />
          </div>
        </section>

        {/* ── PENDAPATAN (§8) ────────────────────────────────────────────
             Berdiri SEBELUM bidang platform, dan itu urutan yang disengaja:
             "berapa pendapatan kita" adalah pertanyaan pertama yang dibawa
             seseorang ke layar ini, dan sampai hari ini ia tidak punya jawaban
             di tabel mana pun. Definisi setiap angkanya di
             `lib/platform-revenue.ts`. ── */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={SECTION_HEADING}>{t("operator.overview.revenueHeading")}</h2>
          {revenue === null ? (
            <p style={NOTICE}>{t("operator.tenant.billingUnavailable")}</p>
          ) : (
            <>
              <div style={TILE_GRID}>
                <StatCard
                  title={t("operator.overview.payingTenants")}
                  value={revenue.payingTenants}
                  tone={revenue.payingTenants > 0 ? "success" : "neutral"}
                  /* Konversi `null` = belum ada pendaftar sama sekali; itu
                     BEDA dari 0% dan ditulis sebagai tanda pisah, bukan nol
                     (Prinsip Inti #4). */
                  hint={
                    revenue.conversionAllTime === null
                      ? undefined
                      : t("operator.overview.conversionHint", {
                          percent: (revenue.conversionAllTime * 100).toFixed(0),
                          total: control.total,
                        })
                  }
                />
                <StatCard
                  title={t("operator.overview.mrr")}
                  value={formatMoney(revenue.mrr)}
                  size="phrase"
                  tone={revenue.mrr > 0 ? "success" : "neutral"}
                  hint={t("operator.overview.arrHint", { amount: formatMoney(revenue.arr) })}
                />
                <StatCard
                  title={t("operator.overview.billableSubs")}
                  value={revenue.billableSubscriptions}
                  hint={t("operator.overview.billableHint")}
                />
                <StatCard
                  title={t("operator.overview.outstanding")}
                  value={revenue.outstandingCount}
                  tone={revenue.outstandingCount > 0 ? "warning" : "neutral"}
                  hint={
                    revenue.outstandingCount === 0
                      ? formatMoney(0)
                      : t("operator.overview.outstandingHint", {
                          amount: formatMoney(revenue.outstandingTotal),
                          days: revenue.oldestOutstandingDays ?? 0,
                        })
                  }
                />
              </div>
              {/* Apa yang TIDAK dihitung, dikatakan di layar: angka pendapatan
                  yang definisinya hanya hidup di kepala seseorang adalah angka
                  yang suatu hari dibaca salah oleh orang lain. */}
              <p style={{ margin: 0, fontSize: 14, ...MUTED }}>
                {t("operator.overview.revenueNote")}
              </p>
            </>
          )}
        </section>

        {/* ── Bidang PLATFORM: boleh mati, dan mengatakannya sebagai kalimat ─ */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={SECTION_HEADING}>{t("operator.overview.platformHeading")}</h2>
          {platform === null ? (
            <p style={NOTICE}>{t("operator.tenant.billingUnavailable")}</p>
          ) : (
            <div style={TILE_GRID}>
              <StatCard
                title={t("operator.overview.invoicesOverdue")}
                value={platform.overdueInvoices}
                tone={platform.overdueInvoices > 0 ? "danger" : "neutral"}
                hint={formatMoney(platform.overdueTotal)}
              />
              <StatCard
                title={t("operator.overview.invoicesOpen")}
                value={platform.openInvoices}
                hint={formatMoney(platform.openTotal)}
              />
              <StatCard
                title={t("operator.overview.subscriptionsActive")}
                value={platform.subscriptionsByStatus.active ?? 0}
                tone="success"
              />
              <StatCard
                title={t("operator.overview.subscriptionsPastDue")}
                value={platform.subscriptionsByStatus.past_due ?? 0}
                tone={(platform.subscriptionsByStatus.past_due ?? 0) > 0 ? "warning" : "neutral"}
              />
              {/* Putaran penjadwal terakhir — ubin yang menjelaskan ubin lain:
                  uji coba kedaluwarsa yang menumpuk dan tagihan yang tidak
                  pernah terbit hampir selalu BERARTI penjadwalnya tidak jalan,
                  bukan pelanggannya yang diam. */}
              <StatCard
                title={t("operator.overview.schedulerLastRun")}
                value={
                  platform.lastRun
                    ? formatDateTime(platform.lastRun.finishedAt)
                    : t("operator.overview.schedulerNever")
                }
                size="phrase"
                tone={
                  platform.lastRun === null
                    ? "warning"
                    : platform.lastRun.status === "ok" && platform.lastRun.errorCount === 0
                      ? "success"
                      : "danger"
                }
                hint={
                  platform.lastRun
                    ? t("operator.overview.schedulerHint", {
                        status: platform.lastRun.status,
                        errors: platform.lastRun.errorCount,
                      })
                    : undefined
                }
                href="/operator/scheduler"
              />
            </div>
          )}
        </section>

        {/* ── Pendaftar terbaru ──────────────────────────────────────────── */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={SECTION_HEADING}>{t("operator.overview.newestHeading")}</h2>
          <StaticTable
            columns={columns}
            rows={control.newest}
            rowKey={(row) => row.id}
            empty={
              <EmptyState
                icon={<TeamOutlined aria-hidden="true" style={{ fontSize: 48 }} />}
                title={t("operator.tenants.empty")}
              />
            }
          />
        </section>
      </div>
    </div>
  );
}
