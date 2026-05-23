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

export default function UploadDocumentPage() {
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
      setError("Please select a file");
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
      setError(data.error || "Failed to upload file");
      setLoading(false);
    } else {
      router.push("/documents");
      router.refresh();
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Upload Document</h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>Document Details</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* File Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-2 text-gray-400" />
                      {file ? (
                        <p className="text-sm text-gray-700 font-medium">{file.name}</p>
                      ) : (
                        <>
                          <p className="text-sm text-gray-500">Click to upload</p>
                          <p className="text-xs text-gray-400 mt-1">JPG, PNG, GIF, PDF (max 10MB)</p>
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
                label="Document Type"
                placeholder="-- Select Type --"
                options={[
                  { value: "bl", label: "Bill of Lading" },
                  { value: "invoice", label: "Invoice" },
                  { value: "coo", label: "Certificate of Origin" },
                  { value: "fumigation", label: "Fumigation Certificate" },
                  { value: "contract", label: "Contract" },
                  { value: "other", label: "Other" },
                ]}
              />

              <Select
                id="contractId"
                name="contractId"
                label="Related Contract (optional)"
                placeholder="-- No Contract --"
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
            {loading ? "Uploading..." : "Upload Document"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/documents")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
