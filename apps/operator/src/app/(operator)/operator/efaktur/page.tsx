/**
 * `/operator/efaktur` — e-FAKTUR TAGIHAN PLATFORM, dari layar.
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
            action="/operator/efaktur"
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
                <Button href={`/operator/efaktur/unduh${qs ? `?${qs}` : ""}`} variant="primary" download>
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
      </div>
    </div>
  );
}
