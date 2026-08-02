"use client";

/**
 * Form impor Daftar Akun dari Excel.
 *
 * Alur: unduh template → isi → unggah. Server memvalidasi seluruh baris; bila
 * ada yang salah, seluruh file ditolak dan galat per-baris ditampilkan di sini
 * (tak ada impor sebagian). Bila bersih, akun baru dibuat dan kode yang sudah
 * ada dilewati — ringkasannya ditampilkan.
 */
import { useState } from "react";
import { useAppRouter } from "@/components/ui/app-link";
import { Download, Upload, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { ACCURATE_TYPE_LEGEND } from "@/lib/coa-import";
import { useDictionary, useT } from "@/lib/i18n/client";

interface RowError {
  row: number;
  message: string;
}
interface ImportResult {
  created: number;
  skipped: number;
  skippedCodes: string[];
  total: number;
}

export function ImportAccountsForm() {
  const router = useAppRouter();
  const { toast } = useToast();
  const t = useT();
  // Legenda kode tipe Accurate: kodenya dari `lib/coa-import.ts`, artinya dari
  // kamus. Di luar LocaleProvider jatuh ke label bahasa Indonesia di modul itu.
  const legend = useDictionary()?.accounts.accurateType;
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setRowErrors([]);
    setResult(null);
    if (!file) {
      setError(t("accounts.pickFileFirst"));
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.set("file", file);
    const res = await fetch("/api/accounts/import", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error || t("accounts.importFailed"));
      if (Array.isArray(data.rowErrors)) setRowErrors(data.rowErrors);
      return;
    }
    setResult(data as ImportResult);
    toast(
      data.skipped
        ? t("accounts.toastImportedWithSkipped", { created: data.created, skipped: data.skipped })
        : t("accounts.toastImported", { created: data.created })
    );
    router.refresh();
  }

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("accounts.breadcrumb"), href: "/accounts" },
          { label: t("accounts.importFromExcel") },
        ]}
        title={t("accounts.importTitle")}
        description={t("accounts.importDescription")}
      />

      {/* Persiapan file — mengikuti konvensi Accurate yang biasa dipakai staff. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("accounts.prepTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              {t("accounts.prepRule1Before")}
              <code>.xlsx</code>
              {t("accounts.prepRule1After")}
            </li>
            <li>
              {t("accounts.prepRule2Before")} <strong>{t("accounts.prepRule2Columns")}</strong>
              {t("accounts.prepRule2After")}
            </li>
            <li>
              {t("accounts.prepRule3Before")} <strong>{t("accounts.prepRule3Strong")}</strong>{" "}
              {t("accounts.prepRule3After")}
            </li>
          </ul>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            {ACCURATE_TYPE_LEGEND.map((row) => (
              <div key={row.code} className="flex gap-2">
                <code className="font-mono text-foreground">{row.code}</code>
                <span>= {legend?.[row.code as keyof typeof legend] ?? row.label}</span>
              </div>
            ))}
          </div>
          <a href="/api/accounts/import" download>
            <Button variant="secondary" type="button" className="mt-2">
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("accounts.downloadTemplate")}
            </Button>
          </a>
        </CardContent>
      </Card>

      {/* Unggah */}
      <Card>
        <CardHeader>
          <CardTitle>{t("accounts.uploadTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <label
              htmlFor="coa-file"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-6 py-10 text-center transition-colors hover:bg-muted"
            >
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">
                {file ? file.name : t("accounts.filePlaceholder")}
              </span>
              <span className="text-xs text-muted-foreground">{t("accounts.fileLimits")}</span>
              <input
                id="coa-file"
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError("");
                  setRowErrors([]);
                  setResult(null);
                }}
              />
            </label>

            {error && (
              <p role="alert" className="text-sm text-destructive-strong">
                {error}
              </p>
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={loading || !file}>
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                {loading ? t("accounts.importing") : t("accounts.importSubmit")}
              </Button>
              <Button variant="secondary" type="button" onClick={() => router.push("/accounts")}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>

          {/* Ringkasan sukses */}
          {result && (
            <div className="mt-6 rounded-lg border border-success-strong/20 bg-success-soft p-4">
              <p className="flex items-center gap-2 font-medium text-success-strong">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {t("accounts.doneTitle")}
              </p>
              <p className="mt-1 text-sm text-success-strong">
                {result.skipped > 0
                  ? t("accounts.summaryWithSkipped", {
                      created: result.created,
                      skipped: result.skipped,
                      total: result.total,
                    })
                  : t("accounts.summary", { created: result.created, total: result.total })}
              </p>
              {result.skippedCodes.length > 0 && (
                <p className="mt-1 text-xs text-success-strong/80">
                  {t("accounts.skippedCodes", { codes: result.skippedCodes.join(", ") })}
                </p>
              )}
            </div>
          )}

          {/* Galat per-baris — tidak ada yang diimpor sampai semua bersih. */}
          {rowErrors.length > 0 && (
            <div className="mt-6 rounded-lg border border-destructive-strong/20 bg-destructive-soft p-4">
              <p className="font-medium text-destructive-strong">
                {t("accounts.rowErrorsTitle", { count: rowErrors.length })}
              </p>
              <div className="mt-3 max-h-64 overflow-y-auto">
                {/* Tabel ringkas di dalam panel galat: padding rapat & warna
                    destructive menimpa bawaan primitif agar tampilannya tetap
                    sama dengan sebelum migrasi. */}
                <Table>
                  <TableHeader className="[&_tr]:border-destructive-strong/10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-auto py-1 pr-4 pl-0 text-destructive-strong/80">{t("accounts.colRow")}</TableHead>
                      <TableHead className="h-auto px-0 py-1 text-destructive-strong/80">{t("accounts.colProblem")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rowErrors.map((r, i) => (
                      <TableRow key={i} className="border-destructive-strong/10 hover:bg-transparent">
                        <TableCell className="py-1 pr-4 pl-0 tabular-nums text-destructive-strong">{r.row}</TableCell>
                        <TableCell className="px-0 py-1 text-destructive-strong">{r.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
