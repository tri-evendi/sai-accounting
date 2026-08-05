"use client";

/**
 * Dialog parameter laporan — jalan masuk ke setiap laporan di Pusat Laporan.
 *
 * ══ KENAPA DIALOG, BUKAN LANGSUNG BUKA ═════════════════════════════════════
 * Sebelumnya kartu laporan adalah tautan: tekan, dan halamannya terbuka dengan
 * periode BAWAAN — awal tahun sampai hari ini. Orang yang menginginkan bulan
 * lalu baru mengetahui bahwa periodenya bisa diatur setelah laporan yang salah
 * sudah dihitung dan dirender, lalu mengaturnya lagi dari penyaring di atas
 * tabel. Dua kali hitung, dua kali tunggu, untuk satu pertanyaan yang sudah ada
 * di kepalanya sebelum ia menekan apa pun.
 *
 * Dialog ini menanyakannya lebih dulu — periode, saringan, dan (untuk laporan
 * bertipe daftar) kolom mana yang ingin dibawa — lalu menawarkan tiga jalan
 * keluar: lihat di layar, unduh PDF, unduh Excel.
 *
 * ══ APA YANG DIRENDER DITENTUKAN KATALOG ═══════════════════════════════════
 * Tak ada satu pun kendali di sini yang ditulis per laporan: seluruhnya lahir
 * dari deklarasi di `lib/report-catalog` (`paramKind`, `filters`, `columns`,
 * `payloadKind`). Itu sengaja — kendali yang tidak dibaca halaman tujuan adalah
 * kendali yang berbohong, dan satu-satunya cara memastikannya tidak terjadi
 * adalah membuat katalog satu-satunya sumber bagi dialog, halaman, DAN berkas
 * ekspornya.
 *
 * Karena itu pula tombol unduh hanya muncul bila laporannya punya
 * `payloadKind`. Tiga entri sengaja tidak punya: Realisasi Target Penjualan
 * (satu bagian di dalam laporan anggaran, bukan dokumen sendiri), Rekonsiliasi
 * Bank (alur kerja pencocokan, bukan laporan cetak), dan e-Faktur (ekspornya
 * berkas impor DJP di halamannya sendiri). Bagi mereka dialog menawarkan "Buka"
 * saja — beserta kalimat yang membedakan "belum punya ekspor" dari "ekspornya
 * ada di halamannya".
 */
import { useState } from "react";
import { ArrowRight, Eye, FileSpreadsheet, FileText } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useAppRouter } from "@/components/ui/app-link";
import { useCompanyIdentity } from "@/lib/company-identity-client";
import { useT } from "@/lib/i18n/client";
import { downloadStatementPdf, downloadStatementWorkbook, fetchReportPayload } from "@/lib/report-files";
import type { ReportDefinition } from "@/lib/report-catalog";

/** Hari ini & awal tahun dalam bentuk ISO — bawaan yang sama dengan `resolvePeriod`. */
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoStartOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface ReportLaunchDialogProps {
  report: ReportDefinition;
  /** Judul & penjelasan yang SUDAH diterjemahkan (kamus dibaca halaman katalog). */
  title: string;
  description: string;
  /** Pilihan pusat biaya, hanya bila laporan ini menyatakan saringannya. */
  costCenterOptions?: { value: string; label: string }[];
  /** Kartu laporannya — dirender sebagai isi tombol pemicu. */
  children: React.ReactNode;
}

export function ReportLaunchDialog({
  report,
  title,
  description,
  costCenterOptions,
  children,
}: ReportLaunchDialogProps) {
  const t = useT();
  const router = useAppRouter();
  const { toast } = useToast();
  const company = useCompanyIdentity();

  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(isoStartOfYear);
  const [to, setTo] = useState(isoToday);
  const [asOf, setAsOf] = useState(isoToday);
  // `YYYY-MM` dari isian bulan; `wholeYear` mengirim `month=0`, bentuk yang
  // sudah lama dipakai `/budget/report` untuk "setahun penuh".
  const [monthValue, setMonthValue] = useState(() => isoToday().slice(0, 7));
  const [wholeYear, setWholeYear] = useState(false);
  const [costCenter, setCostCenter] = useState("");
  const [busy, setBusy] = useState<null | "pdf" | "xlsx">(null);

  const columnSpecs = report.columns ?? [];
  const [columns, setColumns] = useState<string[]>(() =>
    columnSpecs.filter((c) => c.fixed || c.defaultOn !== false).map((c) => c.id)
  );

  const exportable = report.payloadKind !== undefined;
  const showCostCenter = report.filters?.includes("costCenter") && costCenterOptions;

  /** Parameter yang benar-benar dibaca tujuannya — tak ada yang dikirim asal. */
  function queryParams(): Record<string, string | undefined> {
    const p: Record<string, string | undefined> = {};
    if (report.paramKind === "period") {
      p.from = from;
      p.to = to;
    }
    if (report.paramKind === "as_of") p.asOf = asOf;
    if (report.paramKind === "period_month") {
      const [year, month] = monthValue.split("-");
      p.year = year;
      p.month = wholeYear ? "0" : String(Number(month));
    }
    if (showCostCenter && costCenter) p.costCenter = costCenter;
    if (columnSpecs.length > 0) p.cols = columns.join(",");
    return p;
  }

  function queryString(): string {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams())) {
      if (value) q.set(key, value);
    }
    const s = q.toString();
    return s ? `?${s}` : "";
  }

  function openReport() {
    if (!report.href) return;
    setOpen(false);
    router.push(`${report.href}${queryString()}`);
  }

  async function download(format: "pdf" | "xlsx") {
    setBusy(format);
    try {
      const payload = await fetchReportPayload(report.id, queryParams());
      if (format === "pdf") await downloadStatementPdf(payload, company);
      else await downloadStatementWorkbook(payload);
      toast(format === "pdf" ? t("reports.dialog.pdfDownloaded") : t("excel.downloaded"));
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast(format === "pdf" ? t("pdf.generateFailed") : t("excel.failed"), "error");
    }
    setBusy(null);
  }

  function toggleColumn(id: string, checked: boolean) {
    setColumns((prev) => (checked ? [...prev, id] : prev.filter((c) => c !== id)));
  }

  /** Rentang cepat: bulan berjalan, kuartal berjalan, tahun berjalan. */
  function preset(kind: "month" | "quarter" | "year") {
    const now = new Date();
    const start =
      kind === "month"
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : kind === "quarter"
          ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
          : new Date(now.getFullYear(), 0, 1);
    setFrom(iso(start));
    setTo(iso(now));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/*
        Pemicunya adalah SELURUH kartu, dan ia sungguh sebuah tombol: Radix
        merender elemen tombol asli (bertipe "button"), jadi Enter/Spasi bekerja
        dan fokusnya masuk urutan Tab — hal yang hilang kalau kartu ini hanya
        sebuah `div` ber-onClick.
      */}
      <DialogTrigger className="block h-full w-full cursor-pointer rounded-xl text-left transition-shadow duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none">
        {children}
      </DialogTrigger>

      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <div className="border-b border-border p-5 pr-12">
          <DialogTitle className="text-lg font-semibold text-foreground">{title}</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            {description}
          </DialogDescription>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {report.paramKind === "period" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => preset("month")}>
                  {t("reports.dialog.presetMonth")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => preset("quarter")}>
                  {t("reports.dialog.presetQuarter")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => preset("year")}>
                  {t("reports.dialog.presetYear")}
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  id={`${report.id}-from`}
                  type="date"
                  label={t("common.from")}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
                <Input
                  id={`${report.id}-to`}
                  type="date"
                  label={t("common.to")}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
          )}

          {report.paramKind === "as_of" && (
            <Input
              id={`${report.id}-asOf`}
              type="date"
              label={t("reports.asOfDate")}
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          )}

          {report.paramKind === "period_month" && (
            <div className="space-y-3">
              <Input
                id={`${report.id}-month`}
                type="month"
                label={t("reports.dialog.month")}
                value={monthValue}
                onChange={(e) => setMonthValue(e.target.value)}
                disabled={wholeYear}
              />
              {/* Setahun penuh memakai bulannya sebagai TAHUN saja — isian bulan
                  dinonaktifkan supaya tidak terlihat seperti pilihan yang
                  diabaikan. */}
              <label
                htmlFor={`${report.id}-whole-year`}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted"
              >
                <Checkbox
                  id={`${report.id}-whole-year`}
                  checked={wholeYear}
                  onCheckedChange={(checked) => setWholeYear(checked === true)}
                />
                <span className="text-sm text-foreground">{t("reports.dialog.wholeYear")}</span>
              </label>
            </div>
          )}

          {showCostCenter && (
            <Select
              id={`${report.id}-costCenter`}
              label={t("costCenters.filterLabel")}
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value)}
              options={costCenterOptions}
            />
          )}

          {columnSpecs.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">
                {t("reports.dialog.columns")}
              </legend>
              <p className="text-sm text-muted-foreground">{t("reports.dialog.columnsHint")}</p>
              <div className="grid gap-1 sm:grid-cols-2">
                {columnSpecs.map((c) => {
                  const id = `${report.id}-col-${c.id}`;
                  return (
                    // Label membungkus baris penuh: target sentuhnya seluruh
                    // baris (40px), bukan kotak 20px-nya saja.
                    <label
                      key={c.id}
                      htmlFor={id}
                      className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted"
                    >
                      <Checkbox
                        id={id}
                        checked={columns.includes(c.id)}
                        disabled={c.fixed}
                        onCheckedChange={(checked) => toggleColumn(c.id, checked === true)}
                      />
                      <span className="text-sm text-foreground">{c.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {report.paramKind === "none" && !showCostCenter && columnSpecs.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("reports.dialog.noParams")}</p>
          )}

          {!exportable && (
            // Kejujuran yang sama dengan katalognya. Dua kalimat, bukan satu:
            // "belum punya ekspor" dan "ekspornya di halamannya, dalam format
            // khusus" adalah dua keadaan berbeda, dan menyamakannya mengirim
            // orang mencari fitur yang sudah dimilikinya.
            <p className="text-sm text-muted-foreground">
              {report.exportOnPage ? t("reports.dialog.exportOnPage") : t("reports.dialog.noExport")}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border p-4">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {t("common.cancel")}
            </Button>
          </DialogClose>
          {exportable && (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => download("pdf")}
                disabled={busy !== null}
              >
                <FileText className="mr-1 h-4 w-4" aria-hidden="true" />
                {busy === "pdf" ? t("pdf.preparing") : t("reports.dialog.exportPdf")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => download("xlsx")}
                disabled={busy !== null}
              >
                <FileSpreadsheet className="mr-1 h-4 w-4" aria-hidden="true" />
                {busy === "xlsx" ? t("pdf.preparing") : t("reports.dialog.exportExcel")}
              </Button>
            </>
          )}
          {report.href && (
            <Button type="button" onClick={openReport} disabled={busy !== null}>
              {exportable ? (
                <Eye className="mr-1 h-4 w-4" aria-hidden="true" />
              ) : (
                <ArrowRight className="mr-1 h-4 w-4" aria-hidden="true" />
              )}
              {exportable ? t("reports.dialog.preview") : t("reports.dialog.open")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
