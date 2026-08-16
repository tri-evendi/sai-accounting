"use client";

/**
 * Impor Data Awal — pelanggan, pemasok, barang (issue #381, tahap 2).
 *
 * Alur: pilih jenis → unduh templat → isi → unggah. Server memvalidasi SELURUH
 * baris; bila ada satu saja yang salah, tidak ada yang disimpan dan setiap
 * barisnya dilaporkan beserta nomor barisnya.
 *
 * ══ SATU LAYAR, TIGA JENIS ══════════════════════════════════════════════════
 * Bukan tiga halaman. Orang yang memindahkan datanya dari Excel mengerjakan
 * ketiganya dalam satu duduk, dan tiga halaman berarti tiga kali mempelajari
 * bentuk yang sama. Yang berganti hanyalah templat dan alamat unggahnya; alur,
 * pesan, dan cara galat ditampilkan identik — itulah gunanya satu layar.
 *
 * ══ ALAMATNYA MENYEBUT PERUSAHAAN (issue #158) ═════════════════════════════
 * Alasan yang sama persis dengan impor daftar akun: tombol "Unduh templat"
 * adalah `<a href download>` biasa, dan sebuah tautan tidak melewati
 * `apiFetch()` — tidak ada tempat menyisipkan header lingkup di sana.
 * Unggahannya memakai alamat yang SAMA, supaya tidak pernah ada dua jawaban
 * berbeda tentang "perusahaan mana" di satu layar.
 */

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Alert, Flex, Typography, theme } from "antd";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { apiFetch } from "@/lib/api-fetch";
import { parseTenantPath, tenantApiPath } from "@/lib/tenant-routes";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";

const { Text } = Typography;

type Kind = "customers" | "suppliers" | "items";

interface RowError {
  row: number;
  message: string;
}

interface ImportResult {
  created: number;
  skipped: number;
  total: number;
  truncated?: boolean;
}

export function MasterImportForm({ allowed }: { allowed: Kind[] }) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const { toast } = useToast();

  const [kind, setKind] = useState<Kind>(allowed[0]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);

  const pathname = usePathname();
  const scope = pathname ? parseTenantPath(pathname) : null;
  const endpoint = scope
    ? `${tenantApiPath(scope.tenantSlug, scope.companySlug, "/master/import")}?kind=${kind}`
    : "";

  const KIND_LABEL: Record<Kind, string> = {
    customers: t("masterImport.kindCustomers"),
    suppliers: t("masterImport.kindSuppliers"),
    items: t("masterImport.kindItems"),
  };

  /** Ganti jenis = mulai dari nol. Hasil impor pemasok yang masih terpampang
   *  saat orang beralih ke barang adalah angka yang akan dibaca sebagai milik
   *  barang. */
  function pickKind(next: Kind) {
    setKind(next);
    setFile(null);
    setError("");
    setRowErrors([]);
    setResult(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setRowErrors([]);
    setResult(null);
    if (!file) {
      setError(t("masterImport.pickFileFirst"));
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.set("file", file);
    const res = await apiFetch(endpoint, { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error || t("masterImport.failed"));
      if (Array.isArray(data.rowErrors)) setRowErrors(data.rowErrors);
      return;
    }
    setResult(data as ImportResult);
    toast(t("masterImport.toastImported", { created: data.created }));
    router.refresh();
  }

  const errorColumns: SaiColumns<RowError> = [
    {
      key: "row",
      dataIndex: "row",
      title: t("masterImport.colRow"),
      align: "right",
      width: 80,
      render: (_v, r) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.row}</span>,
    },
    { key: "message", dataIndex: "message", title: t("masterImport.colProblem"), align: "left" },
  ];

  return (
    <div>
      <PageHeader
        title={t("masterImport.title")}
        description={t("masterImport.description")}
      />

      <Card style={{ marginBottom: token.marginLG }}>
        <CardHeader>
          <CardTitle level={2}>{t("masterImport.step1Title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Flex vertical gap={token.marginSM}>
            <Select
              id="kind"
              label={t("masterImport.kindLabel")}
              value={kind}
              onChange={(e) => pickKind(e.target.value as Kind)}
              options={allowed.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            />
            <Text type="secondary">{t("masterImport.templateHint")}</Text>
            {/* `<Button href download>`, BUKAN `<ButtonLink>` (#289): navigasi
                sisi-klien mencegat `download` — dicegat berarti berkasnya tidak
                pernah terunduh dan yang terjadi malah pindah halaman. */}
            <div>
              <Button href={endpoint} download variant="outline">
                <DownloadOutlined aria-hidden="true" style={{ fontSize: 16, marginInlineEnd: 4 }} />
                {t("masterImport.downloadTemplate", { kind: KIND_LABEL[kind] })}
              </Button>
            </div>
          </Flex>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle level={2}>{t("masterImport.step2Title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <Flex vertical gap={token.marginMD}>
              <Text type="secondary">{t("masterImport.uploadHint")}</Text>
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={loading}
                style={{ fontSize: token.fontSize }}
              />
              {error && <Alert type="error" showIcon message={error} />}

              {rowErrors.length > 0 && (
                <div>
                  <Text strong style={{ display: "block", marginBottom: token.marginXS }}>
                    {t("masterImport.rowErrorsTitle", { count: rowErrors.length })}
                  </Text>
                  <StaticTable
                    columns={errorColumns}
                    rows={rowErrors}
                    rowKey={(r) => `${r.row}-${r.message}`}
                    size="small"
                  />
                </div>
              )}

              {result && (
                <Alert
                  type="success"
                  showIcon
                  message={t("masterImport.doneTitle")}
                  description={
                    <>
                      {t("masterImport.doneBody", {
                        created: result.created,
                        skipped: result.skipped,
                        total: result.total,
                      })}
                      {result.truncated ? ` ${t("masterImport.truncated")}` : ""}
                    </>
                  }
                />
              )}

              <div>
                <Button type="submit" variant="primary" disabled={loading || !file}>
                  <UploadOutlined aria-hidden="true" style={{ fontSize: 16, marginInlineEnd: 4 }} />
                  {loading ? t("masterImport.uploading") : t("masterImport.upload")}
                </Button>
              </div>
            </Flex>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
