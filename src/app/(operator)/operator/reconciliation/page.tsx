/**
 * Laporan REKONSILIASI platform ↔ kendali — konsol operator (issue #154).
 *
 * Keluaran `runReconciliation` (scripts/reconcile-platform.ts) sebagai
 * halaman, bukan stdout: pemeriksaan yang sama persis dengan
 * `bun run reconcile:platform` dan putaran penjadwal — membaca kedua sisi,
 * TIDAK memperbaiki apa pun (setiap perbaikan penagihan adalah keputusan uang
 * yang diambil orang). Platform tak terjangkau → kalimat jujur, bukan 500.
 *
 * ── Setelah AntD (issue #200) ────────────────────────────────────────────
 * Tabel temuan pindah ke `StaticTable`: halaman ini murni MENAMPILKAN, dan
 * daftar temuannya berukuran belasan baris — rc-table di sini adalah ±80 KB
 * gzip untuk kemampuan yang tidak dipakai (aturan #189).
 *
 * Warnanya variabel token AntD `var(--ant-…)` (#203). Konsol operator memang
 * tidak menggambar satu pun komponen AntD di atas isinya, tapi sejak #227 kelas
 * `ANTD_CSS_VAR_KEY` dipikul `<html>` oleh root layout — jadi variabelnya
 * teratasi di sini juga, dan token `:root` aplikasi yang dulu dipakai sudah
 * dicabut `globals.css` oleh #203. `Badge` dan `EmptyState` memakai token yang
 * sama lewat jalur biasa karena keduanya daun client.
 */

import { CheckCircleOutlined, WarningOutlined } from "@ant-design/icons";
import { Badge } from "@/components/ui/badge";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { requireOperatorPage } from "@/lib/operator/guard";
import { reconciliationForOperator } from "@/lib/operator/store";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const H1: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 700,
  letterSpacing: "-0.025em",
  color: "var(--ant-color-text)",
};

const MUTED: React.CSSProperties = { margin: 0, fontSize: 14, color: "var(--ant-color-text-secondary)" };

/** "Penagihan tidak terjangkau" — kalimat jujur, bukan galat. */
const NOTICE: React.CSSProperties = {
  ...MUTED,
  padding: 12,
  borderRadius: 8,
  border: "1px solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-fill-quaternary)",
  lineHeight: 1.625,
};

/** Dua pita hasil: ikon + kalimat; warnanya penanda kedua, bukan satu-satunya. */
function banner(tone: "clean" | "findings"): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: 16,
    borderRadius: 8,
    fontSize: 14,
    border: `1px solid var(--${tone === "clean" ? "success" : "warning"})`,
    background: `var(--${tone === "clean" ? "success" : "warning"}-soft)`,
    color: `var(--${tone === "clean" ? "success" : "warning"}-strong)`,
  };
}

type Finding = NonNullable<
  Awaited<ReturnType<typeof reconciliationForOperator>>
>["findings"][number];

export default async function OperatorReconciliationPage() {
  await requireOperatorPage();
  const t = await getT();

  const report = await reconciliationForOperator();

  const columns: SaiColumns<Finding> = [
    {
      key: "check",
      title: t("operator.reconciliation.colCheck"),
      align: "left",
      render: (_v, finding) => <Badge variant="warning">{finding.check}</Badge>,
    },
    {
      key: "detail",
      title: t("operator.reconciliation.colDetail"),
      align: "left",
      render: (_v, finding) => (
        <span style={{ whiteSpace: "normal", color: "var(--ant-color-text)" }}>{finding.detail}</span>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 style={H1}>{t("operator.reconciliation.heading")}</h1>
        <p style={MUTED}>{t("operator.reconciliation.description")}</p>
      </div>

      {report === null ? (
        <p style={NOTICE}>{t("operator.reconciliation.unavailable")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ ...MUTED, fontVariantNumeric: "tabular-nums" }}>
            {t("operator.reconciliation.checked", { count: report.subscriptionsChecked })}
          </p>

          {report.findings.length === 0 ? (
            <div role="status" style={banner("clean")}>
              <CheckCircleOutlined aria-hidden="true" style={{ fontSize: 16, marginTop: 2, flexShrink: 0 }} />
              <span>{t("operator.reconciliation.clean")}</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div role="status" style={banner("findings")}>
                <WarningOutlined aria-hidden="true" style={{ fontSize: 16, marginTop: 2, flexShrink: 0 }} />
                <span>
                  {t("operator.reconciliation.findings", { count: report.findings.length })}
                </span>
              </div>
              <StaticTable
                columns={columns}
                rows={report.findings}
                /* Kunci baris ikut membawa INDEKS: satu pemeriksaan yang sama
                   bisa menghasilkan beberapa temuan, jadi `check` sendirian
                   bukan identitas. */
                rowKey={(finding, index) => `${finding.check}-${index ?? 0}`}
              />
            </div>
          )}

          {report.skipped.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h2
                style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--ant-color-text)" }}
              >
                {t("operator.reconciliation.skippedHeading")}
              </h2>
              <ul
                style={{
                  listStyle: "disc",
                  margin: 0,
                  paddingInlineStart: 20,
                  fontSize: 14,
                  color: "var(--ant-color-text-secondary)",
                }}
              >
                {report.skipped.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
