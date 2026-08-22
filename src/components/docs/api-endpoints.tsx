/**
 * Daftar endpoint `/api/v1` — DIBANGKITKAN, tidak pernah diketik ke prosa.
 *
 * ── Kenapa dibangkitkan ────────────────────────────────────────────────────
 * Alasan yang sama persis dengan `permission-matrix.tsx`: sebuah daftar
 * endpoint yang diketik ke dalam dokumen adalah daftar yang mulai berbohong
 * pada endpoint berikutnya — dan di dokumentasi API, yang berbohong baru
 * ketahuan dari integrator yang programnya sudah jalan. Berkas ini karena itu
 * tidak memuat satu pun nama endpoint maupun nama izin; ia membaca `ENDPOINTS`
 * dari `lib/api-v1-spec.ts`, sumber yang SAMA yang menyusun
 * `/api/v1/openapi.json` dan yang dipaksa sejalan dengan route-nya oleh
 * `tests/api-v1-spec.test.ts` (setiap route punya entri, setiap entri punya
 * route, dan izin yang ditulis = izin yang dituntut `requireApiToken`).
 *
 * Jadi endpoint keenam muncul di halaman dokumentasi ini tanpa berkas ini
 * maupun `lib/docs-content.ts` disentuh — dan endpoint yang lahir tanpa entri
 * spesifikasi tidak pernah sampai ke sini, sebab ia sudah merah di
 * `bun run verify`.
 *
 * ── Kenapa nama kolomnya dari kamus, tetapi isinya tidak ───────────────────
 * Kerangka halaman dokumentasi tetap trilingual (keputusan 3 di `lib/docs.ts`);
 * PROSA-nya bahasa Indonesia, dan `summary` di spesifikasi adalah prosa.
 * Menerjemahkannya di sini berarti menjanjikan tiga bahasa pada setiap
 * endpoint baru — janji yang sama yang sudah ditolak untuk isi dokumentasi.
 *
 * ── Kenapa `StaticTable` ───────────────────────────────────────────────────
 * Lima baris tanpa satu pun kendali. `DataTable` menambah +80 KB gzip (#199)
 * demi sortir yang tidak berguna pada tabel sependek ini — dan permukaan ini
 * dibaca tanpa sesi.
 */

import { StaticTable } from "@/components/ui/static-table";
import { textColumn, type SaiColumns } from "@/components/ui/table-columns";
import { ENDPOINTS } from "@/lib/api-v1-spec";
import { V1_ROOT } from "@/lib/api-v1";
import { getT } from "@/lib/i18n/server";

interface Baris {
  segment: string;
  /** `GET /api/v1/<segment>` — dirakit di sini, bukan diketik di spesifikasi. */
  jalur: string;
  izin: string;
  isi: string;
}

const JUDUL_TABEL: React.CSSProperties = {
  margin: 0,
  marginBottom: "var(--ant-margin-xs)",
  /* Di bawah judul halaman (30px) dan di bawah sub-judul isi (20px). */
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: 600,
  color: "var(--ant-color-text)",
};

/** Alamat & nama izin dibaca karakter per karakter — monospace, seperti nomor jurnal. */
const MONO: React.CSSProperties = {
  fontFamily: "var(--ant-font-family-code)",
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-text)",
};

export async function ApiEndpointTable() {
  const t = await getT();

  const rows: Baris[] = ENDPOINTS.map((endpoint) => ({
    segment: endpoint.segment,
    jalur: `GET ${V1_ROOT}/${endpoint.segment}`,
    izin: endpoint.permission,
    isi: endpoint.summary,
  }));

  const columns: SaiColumns<Baris> = [
    {
      key: "jalur",
      dataIndex: "jalur",
      title: t("docs.apiColEndpoint"),
      align: "left",
      render: (_value: unknown, row: Baris) => <span style={MONO}>{row.jalur}</span>,
    },
    textColumn<Baris>({ dataIndex: "isi", title: t("docs.apiColSummary") }),
    {
      key: "izin",
      dataIndex: "izin",
      title: t("docs.apiColPermission"),
      align: "left",
      render: (_value: unknown, row: Baris) => <span style={MONO}>{row.izin}</span>,
    },
  ];

  return (
    <section>
      <h3 style={JUDUL_TABEL}>{t("docs.apiTableTitle")}</h3>
      <StaticTable columns={columns} rows={rows} rowKey={(row) => row.segment} size="small" />
    </section>
  );
}
