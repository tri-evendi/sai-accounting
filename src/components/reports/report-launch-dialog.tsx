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
 *
 * ══ KONVERSI ANT DESIGN (issue #198) ═══════════════════════════════════════
 * Dialognya SUDAH berdiri di atas `Modal` AntD sejak #190 — primitif `Dialog`
 * adalah `Modal` dengan `footer={null}` dan judul sebagai ANAK. Yang dikerjakan
 * di sini adalah sisa fase C-nya: nol kelas Tailwind, lebar lewat prop `size`
 * (#194) alih-alih `max-w-lg`, dan kotak centang lewat `Checkbox` AntD yang
 * membawa labelnya sendiri.
 *
 * Yang SENGAJA tidak dilakukan: memindahkan judul & tombol ke prop `title`/
 * `footer` milik `Modal` mentah. Pemicunya adalah `DialogTrigger` — sebuah
 * elemen tombol asli yang membungkus seluruh kartu laporan — dan `Modal` mentah
 * tidak punya pemicu sama sekali. Menulisnya sendiri berarti tombol MENTAH
 * (ditolak penjaga primitif) atau `Button` primitif yang memaksa tinggi 40px ke
 * sebuah kartu. Kartu ber-`onClick` bukan pilihan: ia kehilangan Enter/Spasi
 * dan urutan Tab, dan tak satu pun tes akan berteriak.
 *
 * Satu kelas yang hilang tanpa pengganti sebaris: `focus-visible:ring-2` pada
 * pemicu. Ia dulu ditulis bersama `focus:outline-none`, jadi keduanya dicabut
 * BERSAMAAN — yang tersisa adalah cincin fokus bawaan peramban, yang memang
 * terlihat. Mencabut hanya cincinnya akan menghasilkan tombol tanpa penanda
 * fokus sama sekali.
 */
import { useState } from "react";
import { ArrowRightOutlined, EyeOutlined, FileExcelOutlined, FileTextOutlined } from "@ant-design/icons";
import { Flex } from "antd";
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

/** `padding` 20 · `paddingLG` 16 di kaki — jarak kepala/badan/kaki dialog. */
const PANE_PADDING = 20;
const FOOTER_PADDING = 16;
/** Ruang untuk tombol tutup (X) di pojok kanan atas. */
const CLOSE_GUTTER = 48;
const FIELD_GAP = 20;
const CONTROL_GAP = 12;
/** Lebar minimum satu kolom isian sebelum kisinya turun sebaris (breakpoint `sm`). */
const FIELD_MIN_WIDTH = 200;
/** Target sentuh satu baris pilihan — `min-h-10` lama. */
const OPTION_ROW: React.CSSProperties = { minHeight: 40, alignItems: "center" };
const ICON_SIZE = 16;

/**
 * Pemicu = SELURUH kartu. Tanpa gaya tombol bawaan, tetapi tetap sebuah tombol:
 * Radix diganti `DialogTrigger` primitif, yang merender elemen tombol asli
 * jadi Enter/Spasi bekerja dan fokusnya masuk urutan Tab.
 */
const TRIGGER_STYLE: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  padding: 0,
  border: "none",
  background: "none",
  textAlign: "start",
  cursor: "pointer",
  borderRadius: "var(--ant-border-radius-lg)",
};

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
      <DialogTrigger style={TRIGGER_STYLE}>{children}</DialogTrigger>

      <DialogContent size="sm" aria-describedby={undefined}>
        <div
          style={{
            padding: PANE_PADDING,
            paddingInlineEnd: CLOSE_GUTTER,
            borderBottom: "1px solid var(--ant-color-border-secondary)",
          }}
        >
          <DialogTitle
            style={{
              margin: 0,
              fontSize: "var(--ant-font-size-lg)",
              fontWeight: "var(--ant-font-weight-strong)",
            }}
          >
            {title}
          </DialogTitle>
          <DialogDescription
            style={{ margin: 0, marginTop: 4, color: "var(--ant-color-text-secondary)" }}
          >
            {description}
          </DialogDescription>
        </div>

        <Flex
          vertical
          gap={FIELD_GAP}
          style={{ flex: 1, overflowY: "auto", padding: PANE_PADDING }}
        >
          {report.paramKind === "period" && (
            <Flex vertical gap={CONTROL_GAP}>
              <Flex wrap gap={8}>
                <Button type="button" variant="outline" size="sm" onClick={() => preset("month")}>
                  {t("reports.dialog.presetMonth")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => preset("quarter")}>
                  {t("reports.dialog.presetQuarter")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => preset("year")}>
                  {t("reports.dialog.presetYear")}
                </Button>
              </Flex>
              <div
                style={{
                  display: "grid",
                  gap: CONTROL_GAP,
                  gridTemplateColumns: `repeat(auto-fit, minmax(${FIELD_MIN_WIDTH}px, 1fr))`,
                }}
              >
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
            </Flex>
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
            <Flex vertical gap={CONTROL_GAP}>
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
                  diabaikan.

                  Labelnya kini milik `Checkbox` AntD (ia MEMANG sebuah
                  `<label>`), jadi seluruh barisnya tetap bisa ditekan tanpa
                  `htmlFor` yang dirakit tangan; `minHeight` menjaga target
                  sentuhnya 40px. */}
              <Checkbox
                id={`${report.id}-whole-year`}
                checked={wholeYear}
                onCheckedChange={(checked) => setWholeYear(checked === true)}
                style={OPTION_ROW}
              >
                {t("reports.dialog.wholeYear")}
              </Checkbox>
            </Flex>
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
            <fieldset style={{ margin: 0, padding: 0, border: "none" }}>
              <legend
                style={{ padding: 0, fontWeight: "var(--ant-font-weight-strong)" }}
              >
                {t("reports.dialog.columns")}
              </legend>
              <p
                style={{
                  margin: 0,
                  marginBottom: 8,
                  color: "var(--ant-color-text-secondary)",
                }}
              >
                {t("reports.dialog.columnsHint")}
              </p>
              <div
                style={{
                  display: "grid",
                  gap: 4,
                  gridTemplateColumns: `repeat(auto-fit, minmax(${FIELD_MIN_WIDTH}px, 1fr))`,
                }}
              >
                {/* Kotak centang AntD SUDAH sebuah `<label>` yang membungkus
                    isian dan katanya, jadi target sentuhnya seluruh baris —
                    bukan kotak 20px-nya saja. */}
                {columnSpecs.map((c) => (
                  <Checkbox
                    key={c.id}
                    id={`${report.id}-col-${c.id}`}
                    checked={columns.includes(c.id)}
                    disabled={c.fixed}
                    onCheckedChange={(checked) => toggleColumn(c.id, checked === true)}
                    style={OPTION_ROW}
                  >
                    {c.label}
                  </Checkbox>
                ))}
              </div>
            </fieldset>
          )}

          {report.paramKind === "none" && !showCostCenter && columnSpecs.length === 0 && (
            <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>
              {t("reports.dialog.noParams")}
            </p>
          )}

          {!exportable && (
            // Kejujuran yang sama dengan katalognya. Dua kalimat, bukan satu:
            // "belum punya ekspor" dan "ekspornya di halamannya, dalam format
            // khusus" adalah dua keadaan berbeda, dan menyamakannya mengirim
            // orang mencari fitur yang sudah dimilikinya.
            <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>
              {report.exportOnPage ? t("reports.dialog.exportOnPage") : t("reports.dialog.noExport")}
            </p>
          )}
        </Flex>

        <Flex
          wrap
          align="center"
          justify="flex-end"
          gap={8}
          style={{
            padding: FOOTER_PADDING,
            borderTop: "1px solid var(--ant-color-border-secondary)",
          }}
        >
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
                <FileTextOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE, marginInlineEnd: 4 }} />
                {busy === "pdf" ? t("pdf.preparing") : t("reports.dialog.exportPdf")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => download("xlsx")}
                disabled={busy !== null}
              >
                <FileExcelOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE, marginInlineEnd: 4 }} />
                {busy === "xlsx" ? t("pdf.preparing") : t("reports.dialog.exportExcel")}
              </Button>
            </>
          )}
          {/* Primer, meski ia NAVIGASI — dan pengecualiannya tertulis di
              aturannya: "kecuali ia satu-satunya jalan maju" (#267). Dialog
              ini tidak punya tugas lain; ia dibuka untuk membuka laporan.
              Ekspor PDF/Excel di sebelahnya `secondary` karena keduanya jalan
              samping, dan overlay adalah layarnya sendiri — tak ada tombol
              halaman katalog di belakangnya yang ikut bersaing. */}
          {report.href && (
            <Button type="button" variant="primary" onClick={openReport} disabled={busy !== null}>
              {exportable ? (
                <EyeOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE, marginInlineEnd: 4 }} />
              ) : (
                <ArrowRightOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE, marginInlineEnd: 4 }} />
              )}
              {exportable ? t("reports.dialog.preview") : t("reports.dialog.open")}
            </Button>
          )}
        </Flex>
      </DialogContent>
    </Dialog>
  );
}
