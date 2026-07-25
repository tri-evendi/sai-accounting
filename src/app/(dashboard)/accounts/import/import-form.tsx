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
import { useRouter } from "next/navigation";
import { Download, Upload, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { ACCURATE_TYPE_LEGEND } from "@/lib/coa-import";

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
  const router = useRouter();
  const { toast } = useToast();
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
      setError("Pilih file Excel terlebih dahulu.");
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.set("file", file);
    const res = await fetch("/api/accounts/import", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Gagal mengimpor file.");
      if (Array.isArray(data.rowErrors)) setRowErrors(data.rowErrors);
      return;
    }
    setResult(data as ImportResult);
    toast(`${data.created} akun ditambahkan${data.skipped ? `, ${data.skipped} dilewati` : ""}.`);
    router.refresh();
  }

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[{ label: "Akun Perkiraan", href: "/accounts" }, { label: "Impor dari Excel" }]}
        title="Impor Akun Perkiraan"
        description="Tambahkan banyak akun sekaligus dari file Excel. Unduh template, isi, lalu unggah di sini."
      />

      {/* Persiapan file — mengikuti konvensi Accurate yang biasa dipakai staff. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Persiapan File</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>File harus berformat Excel (<code>.xlsx</code>). Baris pertama adalah judul kolom dan tidak diimpor.</li>
            <li>Kolom berurutan: <strong>Kode · Nama · Tipe · Mata Uang</strong>. Mata uang boleh dikosongkan (default IDR).</li>
            <li>Kolom <strong>Tipe</strong> memakai kode berikut; saldo normal ditentukan otomatis dari tipe.</li>
          </ul>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            {ACCURATE_TYPE_LEGEND.map((t) => (
              <div key={t.code} className="flex gap-2">
                <code className="font-mono text-foreground">{t.code}</code>
                <span>= {t.label}</span>
              </div>
            ))}
          </div>
          <a href="/api/accounts/import" download>
            <Button variant="secondary" type="button" className="mt-2">
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              Unduh Template Excel
            </Button>
          </a>
        </CardContent>
      </Card>

      {/* Unggah */}
      <Card>
        <CardHeader>
          <CardTitle>Unggah &amp; Impor</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <label
              htmlFor="coa-file"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-6 py-10 text-center transition-colors hover:bg-muted"
            >
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">
                {file ? file.name : "Pilih file Excel (.xlsx)"}
              </span>
              <span className="text-xs text-muted-foreground">Maksimal 5 MB · hingga 10.000 baris</span>
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
                {loading ? "Mengimpor…" : "Impor Akun"}
              </Button>
              <Button variant="secondary" type="button" onClick={() => router.push("/accounts")}>
                Batal
              </Button>
            </div>
          </form>

          {/* Ringkasan sukses */}
          {result && (
            <div className="mt-6 rounded-lg border border-success-strong/20 bg-success-soft p-4">
              <p className="flex items-center gap-2 font-medium text-success-strong">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Impor selesai
              </p>
              <p className="mt-1 text-sm text-success-strong">
                {result.created} akun ditambahkan
                {result.skipped > 0 && ` · ${result.skipped} dilewati (kode sudah ada)`} dari {result.total} baris.
              </p>
              {result.skippedCodes.length > 0 && (
                <p className="mt-1 text-xs text-success-strong/80">
                  Kode dilewati: {result.skippedCodes.join(", ")}
                </p>
              )}
            </div>
          )}

          {/* Galat per-baris — tidak ada yang diimpor sampai semua bersih. */}
          {rowErrors.length > 0 && (
            <div className="mt-6 rounded-lg border border-destructive-strong/20 bg-destructive-soft p-4">
              <p className="font-medium text-destructive-strong">
                Perbaiki {rowErrors.length} baris berikut, lalu unggah ulang. Belum ada yang diimpor.
              </p>
              <div className="mt-3 max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-destructive-strong/80">
                      <th className="py-1 pr-4 font-medium">Baris</th>
                      <th className="py-1 font-medium">Masalah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowErrors.map((r, i) => (
                      <tr key={i} className="border-t border-destructive-strong/10">
                        <td className="py-1 pr-4 tabular-nums text-destructive-strong">{r.row}</td>
                        <td className="py-1 text-destructive-strong">{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
