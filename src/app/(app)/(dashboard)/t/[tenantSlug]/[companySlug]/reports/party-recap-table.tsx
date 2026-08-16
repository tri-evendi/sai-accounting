/**
 * Tabel rekap per pihak — dipakai "Penjualan per Pelanggan" dan "Pembelian per
 * Pemasok" (dua laporan berbentuk sama, hanya beda pihak & sumber datanya).
 *
 * Semua nominal IDR base (judul kolom menyatakannya, sel memakai
 * `hideCurrency`). Retur ditampilkan bertanda minus — pengurang, bukan
 * warna-saja. Dokumen valas tanpa kurs tidak ikut dijumlahkan dan disebut
 * terang-terangan per baris + di bawah tabel (pola `lib/receivables.ts`).
 *
 * ── Konversi ke `StaticTable` + token AntD (issue #198) ────────────────────
 * **Tetap dirender di server.** Yang berubah adalah arah penyusunan kolomnya:
 * dulu `columns.map(...)` menggambar `<TableHead>` DAN tiga cabang sel di dalam
 * badan tabel, sekarang satu id kolom menghasilkan satu objek kolom
 * (`columnFor`). Daftar idnya tetap datang dari `partyRecapColumns()` —
 * penentu yang sama dengan PDF & lembar sebarnya — jadi tidak ada daftar kolom
 * kedua yang bisa menyimpang (dikunci `tests/report-export.test.ts`).
 *
 * Keadaan kosong ikut naik menjadi `EmptyState`: baris "belum ada data" yang
 * membentang selebar tabel dulu hanya sebaris teks abu di tengah, dan MASTER.md
 * meminta keadaan kosong yang bermakna.
 */
import { Card } from "@/components/ui/card";
import { StaticTable } from "@/components/ui/static-table";
import { moneyColumn } from "@/components/ui/money-column";
import { Money } from "@/components/ui/money";
import type { SaiColumns } from "@/components/ui/table-columns";
import { EmptyState } from "@/components/ui/empty-state";
import { FundOutlined, InfoCircleOutlined } from "@ant-design/icons";
import type { PartyRecapResult, PartyRecapRow } from "@/lib/party-recap";
import type { PartyRecapColumnId } from "@/lib/statement-layout";

/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;
/** `marginXXS` 4 · `margin` 16 · `marginSM` 12 — token AntD sebagai angka. */
const NOTE_GAP = 6;
const NOTE_MARGIN = 16;
const NOTE_MARGIN_TOP = 12;
const ICON_SIZE = 16;

/** Catatan bergaris ikon di atas/bawah tabel — satu bentuk, dua pemakai. */
function Note({
  children,
  tone,
  style,
}: {
  children: React.ReactNode;
  tone?: "muted" | "pending";
  style?: React.CSSProperties;
}) {
  return (
    <p
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: NOTE_GAP,
        margin: 0,
        color:
          tone === "pending"
            ? "var(--ant-color-money-pending)"
            : "var(--ant-color-text-secondary)",
        ...style,
      }}
    >
      {children}
    </p>
  );
}

export function PartyRecapTable({
  result,
  columns,
  labels,
}: {
  result: PartyRecapResult;
  /**
   * Kolom yang ditampilkan — dari dialog parameter (`?cols=`), diputuskan
   * `partyRecapColumns()` yang sama dengan PDF & lembar sebarnya. Pratinjau
   * yang memperlihatkan kolom berbeda dari berkasnya adalah laporan yang tidak
   * dipercaya dua kali.
   */
  columns: PartyRecapColumnId[];
  labels: {
    party: string;
    documents: string;
    gross: string;
    returns: string;
    net: string;
    total: string;
    /** Label for the null-party bucket (e.g. "Tanpa pelanggan"). */
    noParty: string;
    empty: string;
    /** e.g. "Nilai kotor termasuk PPN; retur pada periode yang sama dikurangkan." */
    grossNote: string;
    /** Row-level "{count} dokumen tanpa kurs" text, already interpolated per row. */
    rowUnrated: (count: number) => string;
    /** Footer "{count} dokumen valas tanpa kurs …" text, already interpolated. */
    unratedNote: (count: number) => string;
  };
}) {
  const { rows, totals } = result;
  const HEADERS: Record<PartyRecapColumnId, string> = {
    party: labels.party,
    docCount: labels.documents,
    gross: labels.gross,
    returns: labels.returns,
    net: labels.net,
  };

  /** Retur sebagai PENGURANG: tandanya minus, bukan sekadar warna. */
  const returnValue = (value: number) => (value > 0 ? -value : 0);

  /** Satu id kolom -> satu kolom tabel. Tidak ada daftar kolom kedua. */
  function columnFor(id: PartyRecapColumnId): SaiColumns<PartyRecapRow>[number] {
    switch (id) {
      case "docCount":
        return {
          key: "docCount",
          dataIndex: "docCount",
          title: HEADERS.docCount,
          align: "right",
          render: (_v, r) => (
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.docCount}</span>
          ),
        };
      case "gross":
        return moneyColumn<PartyRecapRow>({
          dataIndex: "grossBase",
          key: "gross",
          title: HEADERS.gross,
          hideCurrency: true,
        });
      case "returns":
        return {
          ...moneyColumn<PartyRecapRow>({
            dataIndex: "returnBase",
            key: "returns",
            title: HEADERS.returns,
            hideCurrency: true,
          }),
          render: (_v, r) => <Money value={returnValue(r.returnBase)} hideCurrency />,
        };
      case "net":
        return {
          ...moneyColumn<PartyRecapRow>({
            dataIndex: "netBase",
            key: "net",
            title: HEADERS.net,
            hideCurrency: true,
          }),
          render: (_v, r) => (
            <Money
              value={r.netBase}
              hideCurrency
              style={{ fontWeight: "var(--ant-font-weight-strong)" }}
            />
          ),
        };
      case "party":
      default:
        return {
          key: "party",
          dataIndex: "partyName",
          title: HEADERS.party,
          align: "left",
          render: (_v, r) => (
            <>
              {r.partyName ?? (
                <span style={{ color: "var(--ant-color-text-secondary)" }}>{labels.noParty}</span>
              )}
              {r.unratedCount > 0 && (
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--ant-font-size-sm)",
                    color: "var(--ant-color-money-pending)",
                  }}
                >
                  {labels.rowUnrated(r.unratedCount)}
                </span>
              )}
            </>
          ),
        };
    }
  }

  const tableColumns: SaiColumns<PartyRecapRow> = columns.map(columnFor);

  // Baris total dipetakan per KUNCI kolom, jadi ia ikut menyusut bersama
  // pilihan kolom pengguna dan tak bisa meleset satu kolom.
  const summary: Record<string, React.ReactNode> = {
    party: labels.total,
    docCount: <span style={{ fontVariantNumeric: "tabular-nums" }}>{totals.docCount}</span>,
    gross: <Money value={totals.grossBase} hideCurrency />,
    returns: <Money value={returnValue(totals.returnBase)} hideCurrency />,
    net: <Money value={totals.netBase} hideCurrency />,
  };

  return (
    <>
      <Note style={{ marginBottom: NOTE_MARGIN }}>
        <InfoCircleOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE, flexShrink: 0, marginTop: 2 }} />
        <span>{labels.grossNote}</span>
      </Note>

      <Card>
        <StaticTable<PartyRecapRow>
          columns={tableColumns}
          rows={rows}
          rowKey={(r) => r.partyId ?? "none"}
          summary={summary}
          empty={<EmptyState icon={<FundOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />} title={labels.empty} />}
        />
      </Card>

      {totals.unratedCount > 0 && (
        <Note tone="pending" style={{ marginTop: NOTE_MARGIN_TOP }}>
          <span>{labels.unratedNote(totals.unratedCount)}</span>
        </Note>
      )}
    </>
  );
}
