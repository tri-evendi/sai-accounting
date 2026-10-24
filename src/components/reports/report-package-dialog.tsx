"use client";

/**
 * Dialog PAKET LAPORAN — jalan masuk "Unduh paket laporan" di Pusat Laporan
 * (09 §5, keputusan pemilik 24 Okt 2026).
 *
 * Satu formulir sederhana: periode (bulanan / kuartalan / tahunan / rentang
 * khusus), daftar laporan dengan SET PENUTUPAN BULANAN tercentang lebih dulu,
 * dan format (PDF dan/atau Excel). Menekan "Buat paket" menerbitkan pekerjaan
 * (`/api/reports/package`), menampilkan kemajuan NYATA dari pelarinya, lalu
 * mengunduh SATU berkas ZIP — pola yang sama dengan ekspor besar lain
 * (`src/lib/report-files.ts`: 202 → tunggu di rute hasil → unduh).
 *
 * Daftar laporannya datang dari halaman (server), sudah diterjemahkan, beserta
 * tanda laporan yang modulnya tidak aktif / perannya tidak boleh buka. Laporan
 * itu TETAP bisa dicentang — server yang memutuskan dan mencatatnya di halaman
 * ringkasan paket sebagai "tidak disertakan" beserta alasannya, sehingga
 * berkasnya sendiri jujur tentang apa yang tidak ada di dalamnya.
 */
import { useState } from "react";
import { FileZipOutlined } from "@ant-design/icons";
import { Flex } from "antd";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@sai/ui/dialog";
import { Button } from "@sai/ui/button";
import { Checkbox } from "@sai/ui/checkbox";
import { Input } from "@sai/ui/input";
import { Select } from "@sai/ui/select";
import { Progress } from "@sai/ui/progress";
import { useToast } from "@sai/ui/toast";
import { useT } from "@sai/core/i18n/client";
import { businessParts } from "@sai/core/business-date";
import { HasilKedaluwarsaError, PaketDitolakError, unduhPaketLaporan, type PermintaanPaket } from "@/lib/report-files";
import { PACKAGE_DEFAULT_REPORTS } from "@/lib/report-package-text";

const PANE_PADDING = 20;
const FOOTER_PADDING = 16;
const CLOSE_GUTTER = 48;
const FIELD_GAP = 20;
const FIELD_MIN_WIDTH = 160;
const OPTION_ROW: React.CSSProperties = { minHeight: 40, alignItems: "center" };

export interface PackageReportOption {
  id: string;
  title: string;
  /** Kenapa laporan ini akan dikecualikan server, bila begitu — untuk catatan kecil di sampingnya. */
  blocked: "module" | "role" | null;
}

type PeriodKind = PermintaanPaket["period"]["kind"];

/** Bulan LALU menurut kalender Jakarta — paket paling sering diminta untuk penutupan bulan yang baru lewat. */
function bulanLalu(): { year: number; month: number } {
  const p = businessParts(new Date());
  return p.month === 0 ? { year: p.year - 1, month: 12 } : { year: p.year, month: p.month };
}

export function ReportPackageDialog({
  reports,
  retentionDays,
  monthNames,
}: {
  reports: PackageReportOption[];
  retentionDays: number;
  /** Nama bulan 1–12 dalam bahasa pengguna (kamus `month.m1…m12`). */
  monthNames: string[];
}) {
  const t = useT();
  const { toast } = useToast();
  const awal = bulanLalu();

  const bawaan = () => reports.filter((r) => (PACKAGE_DEFAULT_REPORTS as readonly string[]).includes(r.id)).map((r) => r.id);

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PeriodKind>("month");
  const [year, setYear] = useState(awal.year);
  const [month, setMonth] = useState(awal.month);
  const [quarter, setQuarter] = useState(Math.floor((awal.month - 1) / 3) + 1);
  const [from, setFrom] = useState(`${awal.year}-${String(awal.month).padStart(2, "0")}-01`);
  const [to, setTo] = useState(() => {
    const d = new Date(Date.UTC(awal.year, awal.month, 0)).getUTCDate();
    return `${awal.year}-${String(awal.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  });
  const [selected, setSelected] = useState<string[]>(bawaan);
  const [formats, setFormats] = useState<("pdf" | "xlsx")[]>(["pdf", "xlsx"]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const tahunIni = businessParts(new Date()).year;
  const years = Array.from({ length: 8 }, (_, i) => tahunIni - i).map((y) => ({ value: String(y), label: String(y) }));

  function period(): PermintaanPaket["period"] {
    if (kind === "month") return { kind, year, month };
    if (kind === "quarter") return { kind, year, quarter };
    if (kind === "year") return { kind, year };
    return { kind, from, to };
  }

  function toggle<T extends string>(list: T[], id: T, on: boolean): T[] {
    return on ? (list.includes(id) ? list : [...list, id]) : list.filter((x) => x !== id);
  }

  async function submit() {
    if (selected.length === 0) {
      toast(t("reports.package.needReport"), "error");
      return;
    }
    if (formats.length === 0) {
      toast(t("reports.package.needFormat"), "error");
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      /* Urutan kanonik paket ditentukan server; yang dikirim cukup himpunannya. */
      await unduhPaketLaporan(
        { period: period(), reports: selected, formats },
        (p) => setProgress(p),
        (info) => {
          if (info.reused) toast(t("reports.package.reused"));
        }
      );
      toast(t("reports.package.done"));
      setOpen(false);
    } catch (err) {
      console.error(err);
      const pesan =
        err instanceof PaketDitolakError || err instanceof HasilKedaluwarsaError ? err.message : t("reports.package.failed");
      toast(pesan, "error");
    }
    setBusy(false);
  }

  const kinds: { value: PeriodKind; label: string }[] = [
    { value: "month", label: t("reports.package.kindMonth") },
    { value: "quarter", label: t("reports.package.kindQuarter") },
    { value: "year", label: t("reports.package.kindYear") },
    { value: "custom", label: t("reports.package.kindCustom") },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
      {/* Pemicunya `Button` primitif biasa, bukan `DialogTrigger`: pemicu itu
          sendiri elemen tombol asli, dan membungkus `Button` di dalamnya berarti
          tombol di dalam tombol. Dialognya terkendali (`open`). */}
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} title={t("reports.package.entryHint")}>
        <FileZipOutlined aria-hidden="true" style={{ marginInlineEnd: 4 }} />
        {t("reports.package.entry")}
      </Button>

      <DialogContent size="md" aria-describedby={undefined}>
        <div
          style={{
            padding: PANE_PADDING,
            paddingInlineEnd: CLOSE_GUTTER,
            borderBottom: "1px solid var(--ant-color-border-secondary)",
          }}
        >
          <DialogTitle style={{ margin: 0, fontSize: "var(--ant-font-size-lg)", fontWeight: "var(--ant-font-weight-strong)" }}>
            {t("reports.package.title")}
          </DialogTitle>
          <DialogDescription style={{ margin: 0, marginTop: 4, color: "var(--ant-color-text-secondary)" }}>
            {t("reports.package.description")}
          </DialogDescription>
        </div>

        <Flex vertical gap={FIELD_GAP} style={{ flex: 1, overflowY: "auto", padding: PANE_PADDING }}>
          <div
            style={{
              display: "grid",
              gap: 8,
              gridTemplateColumns: `repeat(auto-fit, minmax(${FIELD_MIN_WIDTH}px, 1fr))`,
            }}
          >
            <Select
              id="package-period-kind"
              label={t("reports.package.period")}
              value={kind}
              onChange={(e) => setKind(e.target.value as PeriodKind)}
              options={kinds}
              disabled={busy}
            />
            {kind !== "custom" && (
              <Select
                id="package-year"
                label={t("reports.package.year")}
                value={String(year)}
                onChange={(e) => setYear(Number(e.target.value))}
                options={years}
                disabled={busy}
              />
            )}
            {kind === "month" && (
              <Select
                id="package-month"
                label={t("reports.package.month")}
                value={String(month)}
                onChange={(e) => setMonth(Number(e.target.value))}
                options={monthNames.map((m, i) => ({ value: String(i + 1), label: m }))}
                disabled={busy}
              />
            )}
            {kind === "quarter" && (
              <Select
                id="package-quarter"
                label={t("reports.package.quarter")}
                value={String(quarter)}
                onChange={(e) => setQuarter(Number(e.target.value))}
                options={[1, 2, 3, 4].map((q) => ({ value: String(q), label: t("reports.package.quarterN", { n: q }) }))}
                disabled={busy}
              />
            )}
            {kind === "custom" && (
              <>
                <Input id="package-from" type="date" label={t("common.from")} value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy} />
                <Input id="package-to" type="date" label={t("common.to")} value={to} onChange={(e) => setTo(e.target.value)} disabled={busy} />
              </>
            )}
          </div>

          <fieldset style={{ margin: 0, padding: 0, border: "none" }}>
            <legend style={{ padding: 0, fontWeight: "var(--ant-font-weight-strong)" }}>{t("reports.package.reports")}</legend>
            <p style={{ margin: 0, marginBottom: 8, color: "var(--ant-color-text-secondary)" }}>{t("reports.package.reportsHint")}</p>
            <Flex wrap gap={8} style={{ marginBottom: 8 }}>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelected(bawaan())} disabled={busy}>
                {t("reports.package.selectDefault")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelected(reports.map((r) => r.id))} disabled={busy}>
                {t("reports.package.selectAll")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelected([])} disabled={busy}>
                {t("reports.package.selectNone")}
              </Button>
            </Flex>
            <div style={{ display: "grid", gap: 4, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {reports.map((r) => (
                <Checkbox
                  key={r.id}
                  id={`package-report-${r.id}`}
                  checked={selected.includes(r.id)}
                  onCheckedChange={(c) => setSelected((prev) => toggle(prev, r.id, c === true))}
                  disabled={busy}
                  style={OPTION_ROW}
                >
                  {r.title}
                  {r.blocked && (
                    <span style={{ color: "var(--ant-color-text-secondary)", marginInlineStart: 4 }}>
                      ({r.blocked === "module" ? t("reports.package.blockedModule") : t("reports.package.blockedRole")})
                    </span>
                  )}
                </Checkbox>
              ))}
            </div>
          </fieldset>

          <fieldset style={{ margin: 0, padding: 0, border: "none" }}>
            <legend style={{ padding: 0, fontWeight: "var(--ant-font-weight-strong)" }}>{t("reports.package.formats")}</legend>
            <Flex vertical gap={4}>
              <Checkbox
                id="package-format-pdf"
                checked={formats.includes("pdf")}
                onCheckedChange={(c) => setFormats((prev) => toggle(prev, "pdf", c === true))}
                disabled={busy}
                style={OPTION_ROW}
              >
                {t("reports.package.formatPdf")}
              </Checkbox>
              <Checkbox
                id="package-format-xlsx"
                checked={formats.includes("xlsx")}
                onCheckedChange={(c) => setFormats((prev) => toggle(prev, "xlsx", c === true))}
                disabled={busy}
                style={OPTION_ROW}
              >
                {t("reports.package.formatXlsx")}
              </Checkbox>
            </Flex>
          </fieldset>

          {busy && (
            <Flex vertical gap={4}>
              <span>{t("reports.package.working", { pct: progress })}</span>
              <Progress value={progress / 100} label={t("reports.package.title")} />
            </Flex>
          )}
          <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>
            {t("reports.package.retentionNote", { days: retentionDays })}
          </p>
        </Flex>

        <Flex
          wrap
          align="center"
          justify="flex-end"
          gap={8}
          style={{ padding: FOOTER_PADDING, borderTop: "1px solid var(--ant-color-border-secondary)" }}
        >
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={busy}>
              {t("common.cancel")}
            </Button>
          </DialogClose>
          <Button type="button" variant="primary" onClick={submit} disabled={busy}>
            <FileZipOutlined aria-hidden="true" style={{ marginInlineEnd: 4 }} />
            {busy ? t("pdf.preparing") : t("reports.package.submit")}
          </Button>
        </Flex>
      </DialogContent>
    </Dialog>
  );
}
