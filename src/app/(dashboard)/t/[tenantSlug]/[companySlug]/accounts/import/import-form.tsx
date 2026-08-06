"use client";

/**
 * Form impor Daftar Akun dari Excel — dikonversi ke token Ant Design pada
 * issue #196.
 *
 * Alur: unduh template → isi → unggah. Server memvalidasi seluruh baris; bila
 * ada yang salah, seluruh file ditolak dan galat per-baris ditampilkan di sini
 * (tak ada impor sebagian). Bila bersih, akun baru dibuat dan kode yang sudah
 * ada dilewati — ringkasannya ditampilkan.
 *
 * ── `<input type="file">` tersembunyi SENGAJA dipertahankan ────────────────
 * Issue #196 menawarkan menggantinya dengan `Upload` AntD. Itu tidak diambil,
 * dan alasannya bukan kemalasan:
 *
 *  • MASTER.md secara eksplisit menyatakan `<input type="file">` tersembunyi
 *    SAH dan berada DI LUAR aturan primitif ("Bukan tombol, jadi di luar
 *    aturan ini") — jadi tidak ada daftar pengecualian yang perlu diperbarui,
 *    dan `tests/design-system-primitives.test.ts` memang tidak menyebutnya
 *    sama sekali. Premis "daftar pengecualiannya wajib ikut diperbarui" tidak
 *    berlaku di pohon ini.
 *  • `Upload` AntD membawa antrian berkas, `beforeUpload`, `customRequest`,
 *    dan daftar berkas terpilihnya sendiri. Alur di sini adalah SATU berkas,
 *    dikirim `FormData` ke alamat bertenant yang SAMA dengan tombol unduh
 *    template (lihat catatan `endpoint` di bawah) — memindahkannya berarti
 *    memindahkan pengiriman itu ke `customRequest` tanpa satu pun kemampuan
 *    baru bagi pengguna.
 *  • `src/components/ui` dibekukan untuk gelombang ini (#229), jadi tidak ada
 *    primitif `Upload`/`FileField` untuk dipakai ulang, dan menempelkan
 *    komponen AntD mentah di satu halaman justru membuat permukaan berkas ini
 *    menyimpang dari 40 layar lain.
 *
 * Yang berubah: kotak jatuhkannya kini bergaya token (tepi putus-putus,
 * `colorFillQuaternary`), dan kedua panel hasil menjadi `Alert` AntD sehingga
 * ikon + warna + kata datang dari satu komponen, bukan dirakit tangan.
 */
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Alert, Col, Flex, Row, theme } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Download, Upload, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { ACCURATE_TYPE_LEGEND } from "@/lib/coa-import";
import { useDictionary, useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";
import { parseTenantPath, tenantApiPath } from "@/lib/tenant-routes";

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

/**
 * Pengganti `sr-only`: isian berkasnya tak terlihat tapi TETAP di pohon
 * aksesibilitas dan tetap bisa difokuskan keyboard. `display: none` akan
 * membuat label di atasnya berhenti bisa dijangkau Tab.
 */
const VISUALLY_HIDDEN: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  borderWidth: 0,
};

/** Tinggi maksimum daftar galat baris sebelum ia menggulung sendiri. */
const ERROR_LIST_MAX_HEIGHT = 256;

/** Ikon kotak jatuhkan berkas — `h-8 w-8` lama. */
const DROPZONE_ICON_SIZE = 32;

export function ImportAccountsForm() {
  const router = useAppRouter();
  const { toast } = useToast();
  const t = useT();
  const { token } = theme.useToken();
  // Legenda kode tipe Accurate: kodenya dari `lib/coa-import.ts`, artinya dari
  // kamus. Di luar LocaleProvider jatuh ke label bahasa Indonesia di modul itu.
  const legend = useDictionary()?.accounts.accurateType;
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);

  /*
   * Alamat route-nya menyebut perusahaan (issue #158). Bukan gaya: tombol
   * "Unduh template" adalah `<a href download>` biasa, dan sebuah tautan tidak
   * melewati `apiFetch()` — tidak ada tempat menyisipkan header lingkup di
   * sana. Unggahannya memakai alamat yang SAMA, supaya tidak pernah ada dua
   * jawaban berbeda tentang "perusahaan mana" di satu layar.
   */
  const pathname = usePathname();
  const scope = pathname ? parseTenantPath(pathname) : null;
  const endpoint = scope
    ? tenantApiPath(scope.tenantSlug, scope.companySlug, "/accounts/import")
    : "";

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
    const res = await apiFetch(endpoint, { method: "POST", body: formData });
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

  const errorColumns: SaiColumns<RowError> = [
    {
      key: "row",
      dataIndex: "row",
      title: t("accounts.colRow"),
      align: "right",
      width: 80,
      render: (_v, r) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.row}</span>
      ),
    },
    { key: "message", dataIndex: "message", title: t("accounts.colProblem"), align: "left" },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("accounts.breadcrumb"), href: "/accounts" },
          { label: t("accounts.importFromExcel") },
        ]}
        title={t("accounts.importTitle")}
        description={t("accounts.importDescription")}
      />

      {/* Persiapan file — mengikuti konvensi Accurate yang biasa dipakai staff. */}
      <Card style={{ marginBottom: token.marginLG }}>
        <CardHeader>
          <CardTitle>{t("accounts.prepTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Flex vertical gap={token.marginSM} style={{ color: token.colorTextSecondary }}>
            <ul style={{ margin: 0, paddingInlineStart: token.paddingLG }}>
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

            {/* Legenda kode tipe — dua kolom di ponsel, tiga sejak `sm`. */}
            <Row gutter={[token.marginLG, token.marginXXS]}>
              {ACCURATE_TYPE_LEGEND.map((row) => (
                <Col key={row.code} xs={12} sm={8}>
                  <Flex gap={token.marginXS}>
                    <code
                      style={{
                        fontFamily: token.fontFamilyCode,
                        color: token.colorText,
                      }}
                    >
                      {row.code}
                    </code>
                    <span>= {legend?.[row.code as keyof typeof legend] ?? row.label}</span>
                  </Flex>
                </Col>
              ))}
            </Row>

            <div>
              <a href={endpoint} download>
                <Button variant="secondary" type="button">
                  <Download aria-hidden="true" />
                  {t("accounts.downloadTemplate")}
                </Button>
              </a>
            </div>
          </Flex>
        </CardContent>
      </Card>

      {/* Unggah */}
      <Card>
        <CardHeader>
          <CardTitle>{t("accounts.uploadTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <Flex vertical gap={token.margin}>
              {/*
               * Label = seluruh kotak jatuhkan; isiannya tersembunyi tapi tetap
               * bisa difokuskan keyboard (lihat `VISUALLY_HIDDEN`).
               */}
              <label
                htmlFor="coa-file"
                style={{
                  display: "flex",
                  cursor: "pointer",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: token.marginXS,
                  borderRadius: token.borderRadiusLG,
                  border: `${token.lineWidth}px dashed ${token.colorBorder}`,
                  background: token.colorFillQuaternary,
                  paddingInline: token.paddingLG,
                  paddingBlock: token.paddingXL,
                  textAlign: "center",
                }}
              >
                <FileSpreadsheet
                  size={DROPZONE_ICON_SIZE}
                  aria-hidden="true"
                  style={{ color: token.colorTextSecondary }}
                />
                <span style={{ fontWeight: token.fontWeightStrong, color: token.colorText }}>
                  {file ? file.name : t("accounts.filePlaceholder")}
                </span>
                <small style={{ color: token.colorTextSecondary }}>
                  {t("accounts.fileLimits")}
                </small>
                <input
                  id="coa-file"
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  style={VISUALLY_HIDDEN}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setError("");
                    setRowErrors([]);
                    setResult(null);
                  }}
                />
              </label>

              {error && (
                <div role="alert">
                  <Alert type="error" showIcon message={error} />
                </div>
              )}

              <Flex wrap align="center" gap={token.marginSM}>
                <Button type="submit" disabled={loading || !file}>
                  <Upload aria-hidden="true" />
                  {loading ? t("accounts.importing") : t("accounts.importSubmit")}
                </Button>
                <Button variant="secondary" type="button" onClick={() => router.push("/accounts")}>
                  {t("common.cancel")}
                </Button>
              </Flex>
            </Flex>
          </form>

          {/* Ringkasan sukses — ikon + kata + warna datang dari `Alert`. */}
          {result && (
            <div style={{ marginTop: token.marginLG }}>
              <Alert
                type="success"
                showIcon
                message={t("accounts.doneTitle")}
                description={
                  <>
                    <p style={{ margin: 0 }}>
                      {result.skipped > 0
                        ? t("accounts.summaryWithSkipped", {
                            created: result.created,
                            skipped: result.skipped,
                            total: result.total,
                          })
                        : t("accounts.summary", { created: result.created, total: result.total })}
                    </p>
                    {result.skippedCodes.length > 0 && (
                      <p style={{ margin: 0, marginTop: token.marginXXS }}>
                        <small>
                          {t("accounts.skippedCodes", { codes: result.skippedCodes.join(", ") })}
                        </small>
                      </p>
                    )}
                  </>
                }
              />
            </div>
          )}

          {/* Galat per-baris — tidak ada yang diimpor sampai semua bersih.
              Judul kolomnya lengket (`sticky` + `maxHeight`, #229): daftar galat
              yang panjang tetap terbaca "baris berapa" saat digulir. */}
          {rowErrors.length > 0 && (
            <div style={{ marginTop: token.marginLG }}>
              <Alert
                type="error"
                showIcon
                message={t("accounts.rowErrorsTitle", { count: rowErrors.length })}
                description={
                  <StaticTable
                    columns={errorColumns}
                    rows={rowErrors}
                    rowKey={(_r, index) => index ?? 0}
                    size="small"
                    sticky
                    maxHeight={ERROR_LIST_MAX_HEIGHT}
                  />
                }
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
