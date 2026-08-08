"use client";

/**
 * Ruang kerja rekonsiliasi bank (issue #24) — dua daftar berdampingan yang
 * dicocokkan satu per satu: gerakan kas milik BUKU di kiri, baris rekening
 * koran BANK di kanan.
 *
 * ── Konversi ke token Ant Design (issue #197, fase C5) ─────────────────────
 * **Titik patah dua kolomnya sengaja TIDAK dinaikkan.** Godaannya besar: sebuah
 * `repeat(auto-fit, minmax(360px, 1fr))` akan memberi dua kolom sejak ~760px dan
 * terlihat "lebih penuh" di tablet. Diukur di 768px, itu memberi dua kolom
 * selebar ±370px yang harus memuat tombol pilih + tanggal + keterangan bebas +
 * nominal bertanda — keterangannya terpotong persis di layar tempat orang
 * membandingkan dua daftar. Karena itu tata letaknya `Row`/`Col xs={24} lg={12}`,
 * padanan tepat `lg:grid-cols-2` lama: SATU kolom sampai 992px, dua di atasnya.
 *
 * Nominal bertanda kini `Money signed` (#186) alih-alih format tangan: tanda
 * +/− dan warnanya datang dari satu tempat, dan panah arah kas tetap dipasang
 * di sini sebagai penanda ketiga — warna tak pernah berdiri sendiri.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Col, Flex, Row, theme, Typography } from "antd";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { PageHeader } from "@/components/ui/page-header";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { ArrowDownOutlined, ArrowUpOutlined, CheckCircleOutlined, DisconnectOutlined, LinkOutlined, LockOutlined, UnlockOutlined, UploadOutlined, WarningOutlined } from "@ant-design/icons";
import { useT } from "@/lib/i18n/client";

const EPSILON = 0.005;

/** Lebar kolom tombol pilih (`w-8` lama) — cukup untuk radio + padding sel. */
const PICK_COLUMN_WIDTH = 40;

interface StatementInfo {
  id: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  closingBalance: number;
  status: string;
}
/**
 * Bagian yang SAMA di kedua sisi pencocokan. Ia ada supaya kolomnya ditulis
 * SEKALI: sebuah baris buku dan sebuah baris rekening koran harus tampil
 * identik, kalau tidak orang membandingkan dua tabel yang berbeda bentuk.
 */
interface MatchRow {
  id: number;
  date: string;
  description: string;
  amount: number;
}
interface BookRow extends MatchRow {
  matched: boolean;
  matchedLineId: number | null;
}
interface LineRow extends MatchRow {
  matched: boolean;
  cashMovementId: number | null;
}
interface Summary {
  difference: number;
  statementNet: number;
  matchedBookTotal: number;
  bookTotal: number;
  statementTotal: number;
  complete: boolean;
  unmatchedBookCount: number;
  unmatchedStatementCount: number;
}

/**
 * Nominal bertanda arah kas: panah + tanda +/− + warna, dalam urutan itu.
 *
 * Angkanya sendiri lewat `Money signed` (#186) — tabular-nums, format id-ID,
 * mata uang eksplisit, dan pasangan warna uang yang lolos 4,5:1 sebagai teks.
 * Yang tinggal di sini hanya panahnya, karena arah kas adalah informasi yang
 * tidak boleh bergantung pada warna.
 */
function Amount({ value, currency }: { value: number; currency: string }) {
  const inflow = value >= 0;
  const Icon = inflow ? ArrowDownOutlined : ArrowUpOutlined;
  return (
    <Flex align="center" justify="flex-end" gap={4} style={{ display: "inline-flex" }}>
      <Icon aria-hidden="true" style={{ fontSize: "0.875em" }} />
      <Money value={value} currency={currency} signed />
    </Flex>
  );
}

export function ReconciliationWorkspace({
  statement,
  bookRows,
  lineRows,
  summary,
}: {
  statement: StatementInfo;
  bookRows: BookRow[];
  lineRows: LineRow[];
  summary: Summary;
}) {
  const router = useRouter();
  const t = useT();
  const { token } = theme.useToken();
  const locked = statement.status === "locked";
  const currency = statement.currency;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const [selectedBook, setSelectedBook] = useState<number | null>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);

  const bookById = useMemo(() => new Map(bookRows.map((b) => [b.id, b])), [bookRows]);
  const lineById = useMemo(() => new Map(lineRows.map((l) => [l.id, l])), [lineRows]);

  const unmatchedBook = bookRows.filter((b) => !b.matched);
  const unmatchedLines = lineRows.filter((l) => !l.matched);
  const matchedLines = lineRows.filter((l) => l.matched);

  const selectedBookRow = selectedBook != null ? bookById.get(selectedBook) : undefined;
  const selectedLineRow = selectedLine != null ? lineById.get(selectedLine) : undefined;
  const amountsAgree =
    selectedBookRow != null &&
    selectedLineRow != null &&
    Math.abs(selectedBookRow.amount - selectedLineRow.amount) < EPSILON;

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    setRowErrors([]);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body != null ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data.rowErrors)) setRowErrors(data.rowErrors);
        const detail = data.details?.fieldErrors;
        const fieldMsg = detail ? Object.values(detail).flat().filter(Boolean)[0] : null;
        setError(String(fieldMsg || data.error || t("reconciliation.genericError")));
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function doMatch() {
    if (selectedBook == null || selectedLine == null) return;
    const ok = await call(`/api/reconciliation/${statement.id}/match`, "POST", {
      lineId: selectedLine,
      cashMovementId: selectedBook,
    });
    if (ok) {
      setSelectedBook(null);
      setSelectedLine(null);
      router.refresh();
    }
  }

  async function doUnmatch(lineId: number) {
    const ok = await call(`/api/reconciliation/${statement.id}/match`, "DELETE", { lineId });
    if (ok) router.refresh();
  }

  async function toggleLock() {
    const ok = await call(
      `/api/reconciliation/${statement.id}/lock`,
      locked ? "DELETE" : "POST"
    );
    if (ok) router.refresh();
  }

  async function addManualLine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const ok = await call(`/api/reconciliation/${statement.id}/lines`, "POST", {
      date: data.get("date"),
      description: data.get("description"),
      amount: Number(data.get("amount")),
    });
    if (ok) {
      form.reset();
      router.refresh();
    }
  }

  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const csv = await file.text();
    e.target.value = "";
    const ok = await call(`/api/reconciliation/${statement.id}/import`, "POST", { csv });
    if (ok) router.refresh();
  }

  /**
   * Kolom satu sisi pencocokan. Judulnya sengaja ADA (dulu kedua daftar tanpa
   * baris judul sama sekali): tiga kolom tanpa nama di layar tempat dua daftar
   * dibandingkan berdampingan adalah tebakan, bukan bacaan.
   */
  function matchColumns(
    group: string,
    selected: number | null,
    onSelect: (id: number) => void,
    ariaLabel: (row: MatchRow) => string
  ): SaiColumns<MatchRow> {
    return [
      {
        key: "pick",
        title: "",
        align: "left",
        width: PICK_COLUMN_WIDTH,
        // `<input type="radio">` native — bukan tombol, jadi di luar aturan
        // primitif tombol (MASTER.md §Primitif Wajib).
        render: (_v, row) => (
          <input
            type="radio"
            name={group}
            aria-label={ariaLabel(row)}
            checked={selected === row.id}
            disabled={locked}
            onChange={() => onSelect(row.id)}
          />
        ),
      },
      {
        key: "date",
        dataIndex: "date",
        title: t("common.date"),
        align: "left",
        render: (_v, row) => (
          <span
            style={{
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
              color: token.colorTextSecondary,
            }}
          >
            {formatDateShort(row.date)}
          </span>
        ),
      },
      {
        key: "description",
        dataIndex: "description",
        title: t("common.description"),
        align: "left",
      },
      {
        key: "amount",
        dataIndex: "amount",
        title: t("reconciliation.colAmount"),
        align: "right",
        render: (_v, row) => <Amount value={row.amount} currency={currency} />,
      },
    ];
  }

  const bookColumns = matchColumns("book", selectedBook, setSelectedBook, (b) =>
    t("reconciliation.pickBookRow", { description: b.description })
  );
  const lineColumns = matchColumns("line", selectedLine, setSelectedLine, (l) =>
    t("reconciliation.pickStatementRow", { description: l.description })
  );

  const matchedColumns: SaiColumns<LineRow> = [
    {
      key: "book",
      title: t("reconciliation.colBook"),
      align: "left",
      render: (_v, l) => {
        const b = l.cashMovementId != null ? bookById.get(l.cashMovementId) : undefined;
        return b ? (
          <>
            <span style={{ color: token.colorTextSecondary }}>{formatDateShort(b.date)}</span> ·{" "}
            {b.description}
          </>
        ) : (
          // Gerakan kas pasangannya tidak lagi ada — dikosongkan "—", bukan
          // dibiarkan kosong seperti sel yang lupa diisi.
          <span style={{ color: token.colorTextSecondary }}>—</span>
        );
      },
    },
    {
      key: "statement",
      title: t("reconciliation.colStatement"),
      align: "left",
      render: (_v, l) => (
        <>
          <span style={{ color: token.colorTextSecondary }}>{formatDateShort(l.date)}</span> ·{" "}
          {l.description}
        </>
      ),
    },
    {
      key: "amount",
      dataIndex: "amount",
      title: t("reconciliation.colAmount"),
      align: "right",
      render: (_v, l) => <Amount value={l.amount} currency={currency} />,
    },
    {
      key: "action",
      title: "",
      align: "right",
      render: (_v, l) =>
        locked ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => doUnmatch(l.id)}
          >
            <DisconnectOutlined aria-hidden="true" /> {t("reconciliation.unmatchAction")}
          </Button>
        ),
    },
  ];

  /** Satu angka ringkasan: keterangan kecil di atas, nilainya di bawah. */
  const summaryCell = (label: string, value: React.ReactNode) => (
    <>
      <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: token.fontSizeSM }}>
        {label}
      </Typography.Paragraph>
      <Typography.Paragraph
        style={{ margin: 0, fontWeight: token.fontWeightStrong, fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </Typography.Paragraph>
    </>
  );

  return (
    <Flex vertical gap={token.marginLG}>
      <PageHeader
        breadcrumbs={[
          { label: t("reconciliation.title"), href: "/reconciliation" },
          { label: t("reconciliation.workspaceTitle", { currency }) },
        ]}
        title={t("reconciliation.workspaceTitle", { currency })}
        description={t("reconciliation.workspacePeriod", {
          from: formatDateShort(statement.periodStart),
          to: formatDateShort(statement.periodEnd),
        })}
        actions={
          <>
            {locked ? (
              <Badge variant="success">
                <LockOutlined aria-hidden="true" />
                <span>{t("reconciliation.statusLocked")}</span>
              </Badge>
            ) : (
              <Badge variant="warning">{t("reconciliation.statusDraft")}</Badge>
            )}
            {/* ⚠ Turun dari `locked ? "secondary" : "primary"` ke `secondary`
                selalu (#267). Ini eskalasi berkondisi yang menaikkan tombolnya
                pada keadaan yang SALAH: saat rekonsiliasi masih terbuka —
                yaitu justru saat pekerjaannya belum selesai — "Kunci" menjadi
                hal paling menyala di layar, di atas "Cocokkan" yang merupakan
                kerja sesungguhnya. Mengunci periode lebih awal berbiaya nyata
                (buku beku, harus dibuka kembali), persis kelas kesalahan yang
                dibuka #267. Aksi utama ruang kerja ini adalah Cocokkan. */}
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={toggleLock}
            >
              {locked ? (
                <>
                  <UnlockOutlined aria-hidden="true" /> {t("reconciliation.reopen")}
                </>
              ) : (
                <>
                  <LockOutlined aria-hidden="true" /> {t("reconciliation.lockAction")}
                </>
              )}
            </Button>
          </>
        }
      />

      {error && (
        <div role="alert">
          <Alert
            type="error"
            showIcon
            message={error}
            description={
              rowErrors.length > 0 ? (
                <ul style={{ margin: 0, paddingInlineStart: token.paddingLG }}>
                  {rowErrors.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Difference summary */}
      <Card>
        <div style={{ padding: token.padding }}>
          <Row gutter={[token.margin, token.margin]}>
            <Col xs={24} sm={12} lg={6}>
              {summaryCell(
                t("reconciliation.summaryOpeningClosing"),
                <>
                  <Money value={statement.openingBalance} currency={currency} /> →{" "}
                  <Money value={statement.closingBalance} currency={currency} />
                </>
              )}
            </Col>
            <Col xs={24} sm={12} lg={6}>
              {summaryCell(
                t("reconciliation.summaryStatementNet"),
                <Amount value={summary.statementNet} currency={currency} />
              )}
            </Col>
            <Col xs={24} sm={12} lg={6}>
              {summaryCell(
                t("reconciliation.summaryMatchedBook"),
                <Amount value={summary.matchedBookTotal} currency={currency} />
              )}
            </Col>
            <Col xs={24} sm={12} lg={6}>
              {summaryCell(
                t("reconciliation.summaryDifference"),
                /*
                 * Selisih nol = rekonsiliasi cocok, jadi arahnya ditentukan
                 * KEADAAN, bukan tanda angkanya. Kalimat di bawah menyebutkan
                 * keadaan itu dengan kata + ikon, sehingga warna di sini tetap
                 * saluran kedua.
                 */
                <Money
                  value={summary.difference}
                  currency={currency}
                  tone={Math.abs(summary.difference) < EPSILON ? "positive" : "negative"}
                  style={{ fontSize: token.fontSizeLG }}
                />
              )}
            </Col>
          </Row>

          <Flex align="center" gap={token.marginXS} style={{ marginTop: token.marginSM }}>
            {summary.complete ? (
              <>
                <CheckCircleOutlined aria-hidden="true" style={{ fontSize: token.fontSize }} />
                <span>{t("reconciliation.summaryComplete")}</span>
              </>
            ) : (
              <>
                <WarningOutlined aria-hidden="true" style={{ fontSize: token.fontSize }} />
                <span>
                  {t("reconciliation.summaryIncomplete", {
                    book: summary.unmatchedBookCount,
                    statement: summary.unmatchedStatementCount,
                  })}
                </span>
              </>
            )}
          </Flex>
        </div>
      </Card>

      {/* Pencocokan: dua kolom — lihat catatan titik patah di kepala berkas. */}
      <Row gutter={[token.margin, token.margin]}>
        <Col xs={24} lg={12}>
          <Card>
            <CardHeader>
              <CardTitle>{t("reconciliation.bookSideTitle")}</CardTitle>
            </CardHeader>
            <StaticTable<MatchRow>
              columns={bookColumns}
              rows={unmatchedBook}
              rowKey={(b) => b.id}
              size="small"
              empty={
                <p
                  style={{
                    margin: 0,
                    padding: token.paddingLG,
                    textAlign: "center",
                    color: token.colorTextSecondary,
                  }}
                >
                  {t("reconciliation.bookAllMatched")}
                </p>
              }
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card>
            <CardHeader>
              <CardTitle>{t("reconciliation.statementSideTitle")}</CardTitle>
            </CardHeader>
            <StaticTable<MatchRow>
              columns={lineColumns}
              rows={unmatchedLines}
              rowKey={(l) => l.id}
              size="small"
              empty={
                <p
                  style={{
                    margin: 0,
                    padding: token.paddingLG,
                    textAlign: "center",
                    color: token.colorTextSecondary,
                  }}
                >
                  {t("reconciliation.statementAllMatched")}
                </p>
              }
            />
          </Card>
        </Col>
      </Row>

      {/* Match action bar */}
      {!locked && (
        <Card>
          <Flex wrap align="center" gap={token.marginSM} style={{ padding: token.paddingSM }}>
            {/* Aksi utama ruang kerja ini (#267): mencocokkan baris buku dengan
                baris rekening koran adalah kata kerja halaman ini, dan ia
                MENGIKAT. Saat tiba ia `disabled` (belum ada yang dipilih) —
                dan itu justru informatif: satu-satunya blok penuh di layar
                menunjukkan apa yang harus dilakukan begitu dua baris dipilih. */}
            <Button
              variant="primary"
              size="sm"
              disabled={busy || selectedBook == null || selectedLine == null}
              onClick={doMatch}
            >
              <LinkOutlined aria-hidden="true" /> {t("reconciliation.matchAction")}
            </Button>
            {selectedBookRow && selectedLineRow && !amountsAgree && (
              // Peringatan yang TIDAK menghalangi: dua nominal boleh berbeda
              // (biaya bank), tapi selisihnya harus disebut sebelum dicocokkan.
              <Flex align="center" gap={token.marginXXS}>
                <WarningOutlined aria-hidden="true" style={{ fontSize: token.fontSize }} />
                <span>
                  {t("reconciliation.amountsDiffer", {
                    book: formatCurrency(selectedBookRow.amount, currency),
                    statement: formatCurrency(selectedLineRow.amount, currency),
                  })}
                </span>
              </Flex>
            )}
            {(selectedBook != null || selectedLine != null) && (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => {
                  setSelectedBook(null);
                  setSelectedLine(null);
                }}
              >
                {t("reconciliation.clearSelection")}
              </Button>
            )}
          </Flex>
        </Card>
      )}

      {/* Matched pairs */}
      <Card>
        <CardHeader>
          <CardTitle>{t("reconciliation.matchedTitle", { count: matchedLines.length })}</CardTitle>
        </CardHeader>
        <StaticTable<LineRow>
          columns={matchedColumns}
          rows={matchedLines}
          rowKey={(l) => l.id}
          size="small"
          empty={
            <p
              style={{
                margin: 0,
                padding: token.paddingLG,
                textAlign: "center",
                color: token.colorTextSecondary,
              }}
            >
              {t("reconciliation.noMatches")}
            </p>
          }
        />
      </Card>

      {/* Add lines: manual + CSV */}
      {!locked && (
        <Card>
          <CardHeader>
            <CardTitle>{t("reconciliation.addLineTitle")}</CardTitle>
          </CardHeader>
          <div style={{ padding: token.paddingLG }}>
            <form onSubmit={addManualLine}>
              <Row gutter={[token.marginSM, token.marginSM]} align="bottom">
                <Col xs={24} sm={6}>
                  <Input id="line-date" name="date" type="date" label={t("common.date")} required />
                </Col>
                <Col xs={24} sm={12}>
                  <Input
                    id="line-desc"
                    name="description"
                    label={t("reconciliation.lineDescription")}
                    required
                  />
                </Col>
                <Col xs={24} sm={6}>
                  <Input
                    id="line-amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                    label={t("reconciliation.lineAmount")}
                    required
                  />
                </Col>
                <Col xs={24}>
                  {/* Aksi SAMPINGAN: memasukkan baris rekening koran adalah
                      MEMASOK bahan untuk dicocokkan, bukan pekerjaannya. Ia
                      juga berdampingan dengan impor CSV di bawah — jalur kedua
                      untuk hal yang sama, dan itu sebuah tautan. (#267) */}
                  <Button type="submit" variant="secondary" size="sm" disabled={busy}>
                    {t("reconciliation.addLineAction")}
                  </Button>
                </Col>
              </Row>
            </form>

            <div
              style={{
                marginTop: token.margin,
                paddingTop: token.margin,
                borderTop: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
              }}
            >
              {/* `<input type="file">` tersembunyi di dalam `<label>` — bukan
                  tombol, jadi di luar aturan primitif tombol (MASTER.md).
                  Menyembunyikannya `data-sr-only`, BUKAN `display: none`
                  (#205): `display: none` mengeluarkan isian dari urutan Tab,
                  dan karena `<label>` sendiri tidak fokusable, impor CSV
                  berhenti punya perhentian Tab sama sekali. */}
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: token.marginXS,
                  minHeight: token.controlHeight,
                  cursor: "pointer",
                  fontWeight: token.fontWeightStrong,
                  color: token.colorLink,
                }}
              >
                <UploadOutlined aria-hidden="true" style={{ fontSize: token.fontSize }} />
                {t("reconciliation.importCsv")}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  data-sr-only
                  onChange={importCsv}
                  disabled={busy}
                />
              </label>
              <Typography.Paragraph
                type="secondary"
                style={{ margin: 0, marginTop: token.marginXXS, fontSize: token.fontSizeSM }}
              >
                {t("reconciliation.csvHintColumns")} <code>date, description, amount</code>{" "}
                {t("reconciliation.csvHintOr")} <code>debit</code> {t("reconciliation.csvHintAnd")}{" "}
                <code>credit</code>
                {t("reconciliation.csvHintDateBefore")} <code>YYYY-MM-DD</code>{" "}
                {t("reconciliation.csvHintDateMiddle")} <code>DD/MM/YYYY</code>
                {t("reconciliation.csvHintTail")}
              </Typography.Paragraph>
            </div>
          </div>
        </Card>
      )}
    </Flex>
  );
}
