import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportLaunchDialog } from "@/components/reports/report-launch-dialog";
import { costCenterFilterOptions } from "@/lib/cost-center-options";
import {
  BookText,
  TrendingUp,
  Scale,
  Waves,
  Target,
  HandCoins,
  Wallet,
  Users,
  Truck,
  Package,
  PackageOpen,
  Landmark,
  FileSpreadsheet,
  FileBarChart,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { reportsByCategory, type ReportDefinition } from "@/lib/report-catalog";
import { PageHeader } from "@/components/ui/page-header";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

/**
 * Pusat Laporan — dikonversi ke token Ant Design (issue #198).
 *
 * **Tetap server component**, jadi `antd` tidak boleh diimpor di sini; tata
 * letaknya CSS grid sebaris dan warnanya variabel `--ant-…` (sah di server
 * sejak #227).
 *
 * Dua hal yang sengaja tidak berubah:
 *  • **Kartunya tetap TOMBOL.** Yang membuatnya bisa ditekan adalah
 *    `DialogTrigger` — elemen tombol asli, jadi Enter/Spasi bekerja dan
 *    fokusnya masuk urutan Tab. Kartu ber-`onClick` saja adalah regresi
 *    aksesibilitas yang tak satu pun tes akan berteriak.
 *  • **Kartu "segera hadir" bukan tombol sama sekali** — ia dirender apa
 *    adanya, di luar pemicu dialog.
 *
 * ── Yang HILANG di konversi ini, dan kenapa ia tidak diakali ──────────────
 * `hover:shadow-md` tidak punya padanan gaya sebaris, dan padanan AntD-nya —
 * prop `hoverable` milik `Card` — tidak bisa dipakai: primitif `Card`
 * (`src/components/ui/card.tsx`) mengetik propnya sebagai `DivProps`, jadi
 * `hoverable` ditolak `tsc` meski AntD di baliknya menerimanya. Primitif dibekukan
 * di PR ini, jadi kartunya kehilangan elevasi hover-nya; petunjuk "bisa ditekan"
 * yang tersisa adalah kursor penunjuk, kalimat "Buka laporan →", dan cincin
 * fokus keyboard. Dilaporkan sebagai calon issue (meneruskan `hoverable` di
 * primitif `Card`) dengan pemanggil nyata: berkas ini.
 */

/** `padding` 20 ≈ `p-5` lama · lebar minimum kartu sebelum kisi turun sebaris. */
const CARD_PADDING = 20;
const CARD_MIN_WIDTH = 280;
const CARD_GAP = 16;
const GROUP_GAP = 40;
const ICON_SIZE = 24;
const ARROW_SIZE = 16;

/** lucide icon names referenced by the catalogue → components (keeps the catalogue pure). */
const ICONS: Record<string, LucideIcon> = {
  BookText,
  TrendingUp,
  Scale,
  Waves,
  Target,
  HandCoins,
  Wallet,
  Users,
  Truck,
  Package,
  PackageOpen,
  Landmark,
  FileSpreadsheet,
};

/**
 * Judul & penjelasan laporan hidup di kamus, dikunci dari `id` katalog
 * ("trial-balance" → "trial_balance"). Katalog di `lib/report-catalog.ts` tetap
 * pemilik struktur, status, dan href-nya; bila suatu id belum ada di kamus,
 * teks bahasa Indonesia dari katalog yang dipakai.
 */
function catalogText(
  dictionary: Dictionary,
  id: string
): { title: string; description: string } | undefined {
  const entries = dictionary.reports.catalogReport;
  return entries[id.replace(/-/g, "_") as keyof typeof entries];
}

function ReportCard({
  report,
  dictionary,
  t,
  costCenterOptions,
}: {
  report: ReportDefinition;
  dictionary: Dictionary;
  t: (key: "reports.comingSoon" | "reports.openReport") => string;
  costCenterOptions: { value: string; label: string }[];
}) {
  const Icon = ICONS[report.icon] ?? FileBarChart;
  const soon = report.status === "coming_soon";
  const text = catalogText(dictionary, report.id);
  const title = text?.title ?? report.title;
  const description = text?.description ?? report.description;

  const inner = (
    <Card
      style={
        soon
          ? {
              height: "100%",
              borderStyle: "dashed",
              background: "var(--ant-color-fill-quaternary)",
            }
          : { height: "100%" }
      }
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: CARD_PADDING,
        }}
      >
        <div
          style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}
        >
          <Icon
            size={ICON_SIZE}
            style={{
              color: soon ? "var(--ant-color-text-secondary)" : "var(--ant-color-link)",
            }}
            aria-hidden="true"
          />
          {soon && <Badge variant="default">{t("reports.comingSoon")}</Badge>}
        </div>
        <h3
          style={{
            margin: 0,
            marginTop: 12,
            fontSize: "var(--ant-font-size)",
            fontWeight: "var(--ant-font-weight-strong)",
            color: soon ? "var(--ant-color-text-secondary)" : "var(--ant-color-text)",
          }}
        >
          {title}
        </h3>
        <p style={{ margin: 0, marginTop: 4, color: "var(--ant-color-text-secondary)" }}>
          {description}
        </p>
        {!soon && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginTop: "auto",
              paddingTop: 16,
              fontWeight: "var(--ant-font-weight-strong)",
              color: "var(--ant-color-link)",
            }}
          >
            {t("reports.openReport")} <ArrowRight size={ARROW_SIZE} aria-hidden="true" />
          </span>
        )}
      </div>
    </Card>
  );

  if (soon || !report.href) return inner;
  return (
    <ReportLaunchDialog
      report={report}
      title={title}
      description={description}
      costCenterOptions={report.filters?.includes("costCenter") ? costCenterOptions : undefined}
    >
      {inner}
    </ReportLaunchDialog>
  );
}

export default async function ReportsPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  await requirePagePermission("report.read", params);
  const t = await getT();
  const dictionary = await getDictionary(await getLocale());
  const groups = reportsByCategory();
  const categoryText = dictionary.reports.catalogCategory;
  // Diambil SEKALI untuk seluruh katalog, bukan per kartu: hanya laporan yang
  // menyatakan saringan `costCenter` yang menerimanya (lihat ReportCard).
  const costCenterOptions = await costCenterFilterOptions();

  return (
    <div>
      <div data-tour="pusat-laporan">
        {/* `mb-8` lama TIDAK pernah berlaku: `PageHeader` menulis
            `marginBottom` sebaris, dan gaya sebaris selalu menang atas kelas.
            Jaraknya karena itu tetap `marginLG` seperti seluruh halaman lain. */}
        <PageHeader title={t("reports.title")} description={t("reports.description")} />
      </div>

      <div style={{ display: "grid", gap: GROUP_GAP }}>
        {groups.map((group, groupIndex) => (
          <section
            key={group.category}
            data-tour={groupIndex === 0 ? "laporan-kategori-pertama" : undefined}
          >
            <div style={{ marginBottom: 12 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: "var(--ant-font-size-lg)",
                  fontWeight: "var(--ant-font-weight-strong)",
                }}
              >
                {categoryText[group.category]?.label ?? group.label}
              </h2>
              <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>
                {categoryText[group.category]?.description ?? group.description}
              </p>
            </div>
            <div
              style={{
                display: "grid",
                gap: CARD_GAP,
                gridTemplateColumns: `repeat(auto-fit, minmax(${CARD_MIN_WIDTH}px, 1fr))`,
              }}
            >
              {group.reports.map((r) => (
                <ReportCard
                  key={r.id}
                  report={r}
                  dictionary={dictionary}
                  t={t}
                  costCenterOptions={costCenterOptions}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
