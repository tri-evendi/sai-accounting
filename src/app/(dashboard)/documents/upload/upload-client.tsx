"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload } from "lucide-react";

interface ContractOption {
  id: number;
  contractNo: string;
}

export function UploadClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [contracts, setContracts] = useState<ContractOption[]>([]);

  useEffect(() => {
    fetch("/api/contracts")
      .then((res) => res.json())
      .then((data) => {
        setContracts(
          data.map((c: { id: number; contractNo: string }) => ({
            id: c.id,
            contractNo: c.contractNo,
          }))
        );
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!file) {
      setError("Pilih file terlebih dahulu");
      return;
    }

    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set("file", file);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Gagal mengunggah file");
      setLoading(false);
    } else {
      router.push("/documents");
      router.refresh();
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">Unggah Dokumen</h1>

      {error && (
        <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>Data Dokumen</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* File Input */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">File</label>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-border border-dashed rounded-lg cursor-pointer bg-muted hover:bg-muted">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                      {file ? (
                        <p className="text-sm text-foreground font-medium">{file.name}</p>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground">Klik untuk memilih file</p>
                          <p className="text-xs text-muted-foreground mt-1">JPG, PNG, GIF, PDF (maks 10MB)</p>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept=".jpg,.jpeg,.png,.gif,.pdf"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              </div>

              <Select
                id="type"
                name="type"
                label="Jenis Dokumen"
                placeholder="-- Pilih Jenis --"
                options={[
                  { value: "bl", label: "Bill of Lading (B/L)" },
                  { value: "invoice", label: "Tagihan (Invoice)" },
                  { value: "coo", label: "Surat Keterangan Asal (COO)" },
                  { value: "fumigation", label: "Sertifikat Fumigasi" },
                  { value: "contract", label: "Kontrak" },
                  { value: "other", label: "Lainnya" },
                ]}
              />

              <Select
                id="contractId"
                name="contractId"
                label="Kontrak Terkait (opsional)"
                placeholder="-- Tanpa Kontrak --"
                options={contracts.map((c) => ({
                  value: String(c.id),
                  label: c.contractNo,
                }))}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading || !file}>
            {loading ? "Mengunggah..." : "Unggah Dokumen"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/documents")}>
            Batal
          </Button>
        </div>
      </form>
    </div>
  );
}
