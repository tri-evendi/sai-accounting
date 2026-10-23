/**
 * `/efaktur` — e-FAKTUR TAGIHAN PLATFORM, dari layar.
 *
 * Sampai halaman ini ekspornya hanya `bun run efaktur:platform` lewat SSH ke
 * dalam jaringan compose. Isinya dibangun `platformEfaktur()` yang sama dengan
 * skrip, dan PRATINJAU-nya — berapa baris, tagihan mana yang TIDAK ikut dan
 * kenapa — tampil sebelum tombol unduh, sebab berkas yang diam-diam kehilangan
 * tiga tagihan adalah berkas yang dilaporkan ke DJP tanpa tiga tagihan.
 */
import { Button } from "@sai/ui/button";
import { Input } from "@sai/ui/input";
import { PageHeader } from "@sai/ui/page-header";
import { ConsoleNotice, ConsolePanel, CONSOLE_MUTED, CONSOLE_PAGE } from "@op/components/operator/console-ui";
import { controlDb } from "@sai/core/control-db";
import { platformDb } from "@sai/platform/platform-db";
import { platformEfaktur } from "@sai/platform/billing/platform-efaktur";
import { getT } from "@sai/platform/i18n/server";
import { requireOperatorPage } from "@op/lib/operator/guard";
import { operatorCan } from "@op/lib/operator/roles";
import { efakturConnectionsForOperator, type EfakturConnectionRow } from "@op/lib/operator/efaktur-connections";
import { StaticTable } from "@sai/ui/static-table";
import type { SaiColumns } from "@sai/ui/table-columns";
import { Badge } from "@sai/ui/badge";
import { EmptyState } from "@sai/ui/empty-state";

export const dynamic = "force-dynamic";

const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

export default async function OperatorEfakturPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { operator } = await requireOperatorPage();
  const t = await getT();
  const params = await searchParams;
  const from = params.from && TANGGAL.test(params.from) ? params.from : "";
  const to = params.to && TANGGAL.test(params.to) ? params.to : "";
  const boleh = operatorCan(operator.role, "tenant.billing");

  let preview: Awaited<ReturnType<typeof platformEfaktur>> | null = null;
  try {
    preview = await platformEfaktur(
      { platform: platformDb, control: controlDb },
      { from: from || null, to: to || null }
    );
  } catch (error) {
    console.error("[operator-efaktur] pratinjau gagal:", error);
  }

  /* Sambungan PJAP per PT (docs/EFAKTUR.md) — e-Faktur PELANGGAN, berbeda
     dari ekspor tagihan platform di atasnya. Hanya keadaan, tanpa rahasia. */
  const koneksi = await efakturConnectionsForOperator();
  const kolomKoneksi: SaiColumns<EfakturConnectionRow> = [
    { key: "label", dataIndex: "label", title: t("operator.efaktur.colCompany") },
    {
      key: "provider",
      dataIndex: "ringkasan",
      title: t("operator.efaktur.colProvider"),
      render: (_raw, r) =>
        r.ringkasan === null ? (
          <Badge variant="warning">{t("operator.efaktur.unreadable")}</Badge>
        ) : r.ringkasan.penyedia ? (
          <Badge variant="outline">{r.ringkasan.penyedia}</Badge>
        ) : (
          <span style={CONSOLE_MUTED}>{t("operator.efaktur.providerNone")}</span>
        ),
    },
    {
      key: "mode",
      dataIndex: "ringkasan",
      title: t("operator.efaktur.colMode"),
      render: (_raw, r) =>
        r.ringkasan?.penyedia ? (r.ringkasan.produksi ? t("operator.efaktur.production") : t("operator.efaktur.sandbox")) : "—",
    },
    {
      key: "credential",
      dataIndex: "ringkasan",
      title: t("operator.efaktur.colCredential"),
      render: (_raw, r) =>
        r.ringkasan?.penyedia
          ? r.ringkasan.adaKredensial
            ? t("operator.efaktur.credentialStored")
            : t("operator.efaktur.credentialMissing")
          : "—",
    },
    {
      key: "submissions",
      dataIndex: "ringkasan",
      title: t("operator.efaktur.colSubmissions"),
      render: (_raw, r) => {
        const st = r.ringkasan?.status ?? {};
        const isi = Object.entries(st);
        return isi.length === 0 ? (
          "—"
        ) : (
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{isi.map(([k, n]) => `${k} ${n}`).join(" · ")}</span>
        );
      },
    },
  ];

  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  const sellerMissing = !process.env.PLATFORM_SELLER_NPWP?.trim();

  return (
    <div>
      <PageHeader title={t("operator.efaktur.heading")} description={t("operator.efaktur.description")} />
      <div style={CONSOLE_PAGE}>
        {sellerMissing && <ConsoleNotice>{t("operator.efaktur.sellerMissing")}</ConsoleNotice>}
        <ConsolePanel>
          <form
            method="get"
            action="/efaktur"
            style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "var(--ant-margin-sm)" }}
          >
            <div style={{ width: "100%", maxWidth: 200 }}>
              <Input type="date" name="from" label={t("operator.efaktur.from")} defaultValue={from} />
            </div>
            <div style={{ width: "100%", maxWidth: 200 }}>
              <Input type="date" name="to" label={t("operator.efaktur.to")} defaultValue={to} />
            </div>
            <Button type="submit" variant="outline">
              {t("operator.efaktur.preview")}
            </Button>
          </form>
        </ConsolePanel>

        {preview === null ? (
          <ConsoleNotice>{t("operator.efaktur.unavailable")}</ConsoleNotice>
        ) : (
          <ConsolePanel
            title={t("operator.efaktur.summary", { rows: preview.rowCount, problems: preview.problems.length })}
            actions={
              boleh && preview.rowCount > 0 ? (
                <Button href={`/efaktur/unduh${qs ? `?${qs}` : ""}`} variant="primary" download>
                  {t("operator.efaktur.download")}
                </Button>
              ) : undefined
            }
            footnote={!boleh ? t("operator.roleCannotEdit") : t("operator.efaktur.note")}
          >
            {preview.problems.length === 0 ? (
              <p style={{ ...CONSOLE_MUTED, margin: 0 }}>{t("operator.efaktur.noProblems")}</p>
            ) : (
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                {preview.problems.map((p) => (
                  <li key={p.invoiceNo}>
                    <strong>{p.invoiceNo}</strong>
                    <span style={CONSOLE_MUTED}> — {t("operator.efaktur.missing")}: {p.missing.join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </ConsolePanel>
        )}

        <ConsolePanel title={t("operator.efaktur.pjapTitle")} footnote={t("operator.efaktur.pjapDescription")}>
          {koneksi === null ? (
            <p style={{ ...CONSOLE_MUTED, margin: 0 }}>{t("operator.efaktur.pjapUnavailable")}</p>
          ) : (
            <StaticTable
              columns={kolomKoneksi}
              rows={koneksi}
              rowKey={(r) => r.label}
              empty={<EmptyState title={t("operator.efaktur.pjapEmpty")} />}
            />
          )}
        </ConsolePanel>
      </div>
    </div>
  );
}
