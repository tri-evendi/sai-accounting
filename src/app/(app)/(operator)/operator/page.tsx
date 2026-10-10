/**
 * `/operator` — RINGKASAN konsol operator.
 *
 * ══ KENAPA HALAMAN INI ADA ═════════════════════════════════════════════════
 * Sampai `/operator` ada, pendaratan konsol adalah DAFTAR TENANT: satu tabel
 * tujuh kolom berisi setiap pelanggan platform. Tabel itu benar dan tetap ada
 * (`./tenants`), tetapi ia bukan jawaban atas pertanyaan yang dibawa seseorang
 * ketika ia membuka `ops.` — "apakah ada yang perlu saya tangani hari ini?".
 *
 * ══ KENAPA HALAMAN INI DITULIS ULANG ═══════════════════════════════════════
 * Karena jawaban pertamanya ternyata bentuk lain dari pertanyaan yang sama.
 * Sebelum perombakan ini halaman memajang **enam belas ubin berbobot sama**
 * dalam empat kisi yang serupa: "9 uji coba kedaluwarsa" berdiri dengan ukuran
 * angka, tebal huruf, dan tepi yang persis sama dengan "41 pengguna terdaftar".
 * Yang satu menuntut telepon hari ini; yang lain tidak pernah menuntut apa pun.
 * Enam belas angka setara tidak menjawab "apa yang perlu ditangani" — ia
 * memindahkan penyaringannya ke kepala orang yang membuka halaman, yaitu
 * pekerjaan yang ia buka konsol untuk hindari.
 *
 * Bentuknya sekarang punya SATU hal yang dibaca lebih dulu:
 *
 *   1. **Perlu ditangani** — hanya keadaan yang menuntut tindakan, berurut
 *      menurut mendesaknya, masing-masing bertaut ke tempat tindakannya.
 *      Kosong = satu kalimat tenang, bukan enam baris nol. Penyaringnya murni
 *      dan teruji (`lib/operator/attention.ts`).
 *   2. **Pendapatan** (§8) — pertanyaan kedua yang selalu dibawa ke layar ini.
 *   3. **Pelanggan** dan **Kesehatan platform** — angka latar yang menjawab
 *      "seberapa besar" dan "apakah mesinnya jalan", bukan "apa yang harus
 *      saya lakukan".
 *   4. **Pendaftar terbaru**.
 *
 * Angkanya tidak satu pun berubah; yang berubah urutan membacanya.
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
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  FieldTimeOutlined,
  LockOutlined,
  TeamOutlined,
  WarningOutlined,
} from "@ant-design/icons";

import { StatCard } from "@/components/dashboard/stat-card";
import {
  ConsoleNotice,
  ConsolePanel,
  ConsoleSection,
  CONSOLE_MUTED,
  CONSOLE_PAGE,
  CONSOLE_TILES,
} from "@/components/operator/console-ui";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { requireOperatorPage } from "@/lib/operator/guard";
import { attentionItems, type AttentionItem } from "@/lib/operator/attention";
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

type NewestRow = OperatorOverview["control"]["newest"][number];

/**
 * Ikon per baris "perlu ditangani".
 *
 * Ikonnya BUKAN hiasan dan bukan pula penanda tunggal: tiap baris tetap
 * membawa teksnya sendiri (MASTER.md — warna & bentuk tak pernah sendirian).
 * Yang ia kerjakan adalah membuat daftar berurut bisa dipindai tanpa dibaca —
 * jam untuk waktu, gembok untuk buku terkunci, seru untuk uang.
 */
const ATTENTION_ICON: Record<AttentionItem["key"], React.ReactNode> = {
  schedulerNever: <CloseCircleOutlined aria-hidden="true" />,
  schedulerFailing: <WarningOutlined aria-hidden="true" />,
  trialsExpired: <FieldTimeOutlined aria-hidden="true" />,
  invoicesOverdue: <ExclamationCircleOutlined aria-hidden="true" />,
  tenantsPastDue: <ExclamationCircleOutlined aria-hidden="true" />,
  tenantsSuspended: <LockOutlined aria-hidden="true" />,
  trialsEndingSoon: <ClockCircleOutlined aria-hidden="true" />,
};

/**
 * Kunci kamus per baris — DITULIS UTUH, bukan dirakit.
 *
 * `t(`operator.attention.${item.key}`)` akan jauh lebih pendek dan ia yang
 * ditulis lebih dulu; `tests/i18n-orphan-keys.test.ts` menolaknya, dan
 * penolakannya benar. Kunci yang hanya ada sebagai potongan string membuat
 * penjaga kunci yatim buta terhadap empat belas kunci sekaligus — sehingga
 * kalau kelak satu baris dihapus dari `lib/operator/attention.ts`, dua kunci
 * kamusnya akan tinggal di tiga berkas kamus selamanya tanpa ada yang
 * memberitahu. Tabel di bawah membuat keempat belasnya terlihat parser, dan
 * `Record<…>` membuat baris baru tidak bisa lupa membawa kalimat sebabnya.
 */
const ATTENTION_TEXT: Record<
  AttentionItem["key"],
  { label: DictionaryKey; why: DictionaryKey }
> = {
  schedulerNever: {
    label: "operator.attention.schedulerNever",
    why: "operator.attention.schedulerNeverWhy",
  },
  schedulerFailing: {
    label: "operator.attention.schedulerFailing",
    why: "operator.attention.schedulerFailingWhy",
  },
  trialsExpired: {
    label: "operator.attention.trialsExpired",
    why: "operator.attention.trialsExpiredWhy",
  },
  invoicesOverdue: {
    label: "operator.attention.invoicesOverdue",
    why: "operator.attention.invoicesOverdueWhy",
  },
  tenantsPastDue: {
    label: "operator.attention.tenantsPastDue",
    why: "operator.attention.tenantsPastDueWhy",
  },
  tenantsSuspended: {
    label: "operator.attention.tenantsSuspended",
    why: "operator.attention.tenantsSuspendedWhy",
  },
  trialsEndingSoon: {
    label: "operator.attention.trialsEndingSoon",
    why: "operator.attention.trialsEndingSoonWhy",
  },
};

/** Warna baris — `tone` dari modul murni, dipetakan ke token di sini. */
const ATTENTION_COLOR: Record<AttentionItem["tone"], string> = {
  danger: "var(--ant-color-error)",
  warning: "var(--ant-color-warning)",
  info: "var(--ant-color-text-secondary)",
};

const ATTENTION_ROW: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "var(--ant-margin-sm)",
  padding: "var(--ant-padding-sm) var(--ant-padding-lg)",
  borderTop: "1px solid var(--ant-color-split)",
};

export default async function OperatorOverviewPage() {
  await requireOperatorPage();
  const t = await getT();
  const { control, revenue, platform } = await operatorOverview();
  const perluDitangani = attentionItems({ control, platform });

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

      <div style={CONSOLE_PAGE}>
        {/* ══ 1. PERLU DITANGANI ══════════════════════════════════════════
            Satu-satunya bagian yang boleh membaca seluruh layar; `flush` sebab
            barisnya menggambar pemisahnya sendiri sampai ke tepi kartu. */}
        <ConsolePanel
          title={t("operator.attention.heading")}
          description={t("operator.attention.description")}
          flush
        >
          {perluDitangani.length === 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--ant-margin-xs)",
                padding: "var(--ant-padding-sm) var(--ant-padding-lg)",
                color: "var(--ant-color-success)",
              }}
            >
              <CheckCircleOutlined aria-hidden="true" />
              {/* Keadaan tenang dikatakan SEKALI. Enam baris "0" adalah enam
                  pembacaan yang menghasilkan nol keputusan. */}
              <span style={{ color: "var(--ant-color-text)" }}>
                {t("operator.attention.allClear")}
              </span>
            </div>
          ) : (
            perluDitangani.map((item) => {
              const teks = ATTENTION_TEXT[item.key];
              const label = t(teks.label, { count: item.count });
              const reason = t(teks.why);
              return (
                <div key={item.key} style={ATTENTION_ROW}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-flex",
                      flexShrink: 0,
                      fontSize: 18,
                      color: ATTENTION_COLOR[item.tone],
                    }}
                  >
                    {ATTENTION_ICON[item.key]}
                  </span>
                  <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                    <div style={{ fontWeight: 500, color: "var(--ant-color-text)" }}>{label}</div>
                    <div style={{ ...CONSOLE_MUTED, fontSize: "var(--ant-font-size-sm)" }}>
                      {reason}
                    </div>
                  </div>
                  {/* Tautan, bukan tombol: baris ini membawa ke suatu tempat.
                      Yang tanpa `href` memang tidak punya tujuan yang jumlahnya
                      cocok — alasannya di `lib/operator/attention.ts`. */}
                  {item.href && (
                    <Link
                      href={item.href}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "var(--ant-margin-xxs)",
                        flexShrink: 0,
                        fontWeight: 500,
                        color: "var(--ant-color-link)",
                      }}
                    >
                      {t("operator.attention.open")}
                      <ArrowRightOutlined aria-hidden="true" style={{ fontSize: 12 }} />
                    </Link>
                  )}
                </div>
              );
            })
          )}
        </ConsolePanel>

        {/* ══ 2. PENDAPATAN (§8) ══════════════════════════════════════════
            Definisi setiap angkanya di `lib/platform-revenue.ts`. */}
        <ConsoleSection title={t("operator.overview.revenueHeading")}>
          {revenue === null ? (
            <ConsoleNotice>{t("operator.tenant.billingUnavailable")}</ConsoleNotice>
          ) : (
            <>
              <div style={CONSOLE_TILES}>
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
              <p style={{ ...CONSOLE_MUTED, fontSize: "var(--ant-font-size-sm)" }}>
                {t("operator.overview.revenueNote")}
              </p>
            </>
          )}
        </ConsoleSection>

        {/* ══ 3. PELANGGAN — "seberapa besar", bukan "apa yang harus saya
               lakukan". Ia turun ke bawah pendapatan dengan sengaja. ══════ */}
        <ConsoleSection title={t("operator.overview.controlHeading")}>
          <div style={CONSOLE_TILES}>
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
                 kabar baik ketika sembilan di antaranya sudah kedaluwarsa.
                 Keduanya juga punya barisnya sendiri di "Perlu ditangani" —
                 pengulangan yang disengaja: ubin ini menjawab "berapa", baris
                 di atas menjawab "lakukan apa". */
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
        </ConsoleSection>

        {/* ══ 4. KESEHATAN PLATFORM — boleh mati, dan mengatakannya sebagai
               kalimat ════════════════════════════════════════════════════ */}
        <ConsoleSection title={t("operator.overview.platformHeading")}>
          {platform === null ? (
            <ConsoleNotice>{t("operator.tenant.billingUnavailable")}</ConsoleNotice>
          ) : (
            <div style={CONSOLE_TILES}>
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
        </ConsoleSection>

        {/* ══ 5. PENDAFTAR TERBARU ═══════════════════════════════════════ */}
        <ConsolePanel
          title={t("operator.overview.newestHeading")}
          actions={
            <ButtonLink href="/operator/tenants" variant="ghost" size="sm">
              {t("operator.overview.openTenants")}
            </ButtonLink>
          }
          flush
        >
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
        </ConsolePanel>
      </div>
    </div>
  );
}
