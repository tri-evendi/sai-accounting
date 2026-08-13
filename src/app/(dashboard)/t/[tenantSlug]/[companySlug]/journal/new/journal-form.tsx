"use client";

/**
 * Jurnal Umum baru — dikonversi ke token Ant Design pada issue #196.
 *
 * Kulitnya saja yang berubah; mesin formulirnya (state lokal, penjaga
 * sebelum-kirim, POST) tidak disentuh sama sekali.
 *
 * ── Jurnal harus TERLIHAT seimbang ─────────────────────────────────────────
 * Baris jurnal kini `StaticTable` dengan `summary`, bukan primitif `Table` JSX.
 * Yang dibeli dengan itu bukan kerapian: Σ debit dan Σ kredit berdiri TEPAT di
 * bawah kolomnya sendiri, dan lencana "Seimbang"/selisih duduk di baris yang
 * sama — jadi keseimbangan terbaca dari layar, bukan hanya ditolak tombol Simpan
 * yang mati tanpa penjelasan. Lencananya `Badge` (berteks, mewarnai dirinya
 * sendiri), sehingga warna tak pernah jadi penanda tunggal — dan tanda centang
 * `✓` yang dulu diketik sebagai KARAKTER di dalam teks ikut hilang bersamanya.
 *
 * `StaticTable` di komponen client tetap sah dan tetap murah — ia tak memakai
 * satu hook pun, jadi tak ada rc-table yang dihidrasi di sini (aturan #189:
 * perender dipilih menurut kebutuhan INTERAKTIVITAS; yang interaktif di sini
 * adalah ISI selnya, bukan tabelnya).
 *
 * ── Kenapa pemilih akun TETAP `Select` datar, bukan `TreeSelect` ───────────
 * Issue #196 menyebut `TreeSelect` sebagai kandidat, dan itu diukur dulu:
 *
 *  • `TreeSelect` menyeret `rc-tree-select` + `rc-tree` ke bundel setiap rute
 *    yang memakainya — dan formulir ini punya SATU pemilih akun per BARIS,
 *    jadi biayanya dibayar berkali-kali di satu layar.
 *  • Yang lebih menentukan: sebuah pohon menjadikan akun INDUK sama mudah
 *    diklik dengan akun anak, padahal memposting ke akun induk adalah
 *    kesalahan pembukuan yang paling mahal di layar ini. Daftar datar tidak
 *    membuat kesalahan itu terlihat lebih mudah dari sekarang, tetapi pohon
 *    membuatnya terlihat SEPERTI pilihan yang sah.
 *  • `SelectField` sudah menyalakan pencariannya sendiri di atas 12 opsi
 *    (`SEARCH_THRESHOLD`), dan kode akun mengurutkan dirinya sendiri secara
 *    hierarkis — mengetik "1101" lebih cepat daripada membuka tiga cabang.
 *
 * Jadi `TreeSelect` ditunda sebagai issue tersendiri: nilainya nyata hanya
 * kalau API akun ikut menyatakan akun mana yang BOLEH diposting (`isPostable`),
 * dan itu perubahan skema, bukan perubahan kulit.
 */

import { useEffect, useState } from "react";
import { Alert, Col, Flex, Row, theme } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, TextInput } from "@/components/ui/input";
import { SelectField, Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StaticTable, type SummaryRow } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Money } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { CURRENCIES } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

interface AccountOption {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

/** Pusat biaya aktif, untuk pemilih di kepala & per baris (issue #91). */
interface CostCenterOption {
  id: number;
  code: string;
  name: string;
}

interface LineRow {
  /**
   * Identitas baris yang bertahan saat baris di TENGAH dihapus. Indeks tidak
   * bisa dipakai: React akan memakai ulang simpul isian milik baris berikutnya
   * dan nilai yang diketik ikut bergeser satu baris ke atas.
   */
  key: number;
  accountId: string;
  debit: string;
  credit: string;
  currency: string;
  rate: string;
  /** Kosong = ikut pilihan di kepala jurnal (issue #91). */
  costCenterId: string;
}

let nextLineKey = 0;

const emptyLine = (): LineRow => ({
  key: nextLineKey++,
  accountId: "",
  debit: "",
  credit: "",
  currency: "IDR",
  rate: "1",
  costCenterId: "",
});

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const base = (amount: string, rate: string) => (Number(amount) || 0) * (Number(rate) || 1);

/** Lebar dasar kolom baris jurnal (`min-w-[220px]`, `w-24`, `w-28` lama). */
const ACCOUNT_COL_WIDTH = 220;
const COST_CENTER_COL_WIDTH = 180;
const CURRENCY_COL_WIDTH = 96;
const RATE_COL_WIDTH = 112;

export function NewJournalForm() {
  const router = useAppRouter();
  const t = useT();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [lines, setLines] = useState<LineRow[]>([emptyLine(), emptyLine()]);

  useEffect(() => {
    apiFetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AccountOption[]) => setAccounts(data.filter((a) => a.isActive)))
      .catch(() => setAccounts([]));
    // Hanya yang aktif: yang sudah dinonaktifkan tak boleh bisa DIPILIH lagi,
    // walau namanya tetap terbaca pada jurnal lama yang menyebutnya.
    apiFetch("/api/cost-centers?activeOnly=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CostCenterOption[]) => setCostCenters(data))
      .catch(() => setCostCenters([]));
  }, []);

  const accountOptions = [
    { value: "", label: t("common.pickAccount") },
    ...accounts.map((a) => ({ value: String(a.id), label: `${a.code} — ${a.name}` })),
  ];
  const costCenterChoices = costCenters.map((c) => ({
    value: String(c.id),
    label: `${c.code} — ${c.name}`,
  }));
  /** Kepala: kosong = seluruh perusahaan. */
  const headerCostCenterOptions = [
    { value: "", label: t("costCenters.filterUnassigned") },
    ...costCenterChoices,
  ];
  /** Baris: kosong = IKUT KEPALA, yang tidak sama artinya dengan di kepala. */
  const lineCostCenterOptions = [
    { value: "", label: t("journal.costCenterFollowHeader") },
    ...costCenterChoices,
  ];

  const totalDebit = lines.reduce((s, l) => s + base(l.debit, l.rate), 0);
  const totalCredit = lines.reduce((s, l) => s + base(l.credit, l.rate), 0);

  /*
   * DUA pertanyaan, dan sampai issue #355 keduanya dijawab satu variabel.
   *
   * `balanced` di bawah menjawab "boleh disimpan?" — dan untuk itu `totalDebit
   * > 0` memang wajib: jurnal kosong bukan jurnal. Tetapi LENCANA di baris
   * total menjawab pertanyaan lain, "apakah kedua sisi cocok?", dan pada
   * formulir yang belum diisi jawabannya bukan "tidak".
   *
   * Akibatnya formulir jurnal yang baru dibuka menyambut penggunanya dengan
   * lencana MERAH berbunyi "Selisih Rp 0" — peringatan galat untuk keadaan
   * yang sama sekali belum salah, pada layar yang justru paling menakutkan
   * bagi pengguna awam akuntansi. Audit produksi 13 Agustus 2026 menemukannya.
   *
   * `sidesMatch` karena itu dipisah, dan keadaan "belum ada isian" mendapat
   * lencana netralnya sendiri. Tombol simpannya tidak berubah sedikit pun.
   */
  const sidesMatch = Math.round(totalDebit * 100) === Math.round(totalCredit * 100);
  const untouched = totalDebit === 0 && totalCredit === 0;
  const balanced = sidesMatch && totalDebit > 0;

  function updateLine(i: number, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const payloadLines = lines
      .filter((l) => l.accountId && (Number(l.debit) > 0 || Number(l.credit) > 0))
      .map((l) => ({
        accountId: Number(l.accountId),
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        currency: l.currency,
        rate: Number(l.rate) || 1,
        costCenterId: l.costCenterId ? Number(l.costCenterId) : null,
      }));

    if (payloadLines.length < 2) {
      setError(t("journal.minLines"));
      return;
    }
    if (!balanced) {
      setError(t("journal.notBalanced"));
      return;
    }

    setLoading(true);
    const res = await apiFetch("/api/journals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        note: note || null,
        costCenterId: costCenterId ? Number(costCenterId) : null,
        lines: payloadLines,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || t("journal.saveFailed"));
      setLoading(false);
    } else {
      router.push("/journal");
      router.refresh();
    }
  }

  /** Isian angka baris jurnal — rata kanan + `tabular-nums`. */
  const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

  const columns: SaiColumns<LineRow> = [
    {
      key: "accountId",
      title: t("common.account"),
      align: "left",
      width: ACCOUNT_COL_WIDTH,
      render: (_v, row, index) => (
        <SelectField
          aria-label={t("common.account")}
          value={row.accountId}
          onChange={(e) => updateLine(index, { accountId: e.target.value })}
          options={accountOptions}
        />
      ),
    },
    {
      key: "debit",
      title: t("common.debit"),
      align: "right",
      render: (_v, row, index) => (
        <TextInput
          aria-label={t("common.debit")}
          type="number"
          step="0.01"
          min="0"
          style={numberStyle}
          value={row.debit}
          onChange={(e) => updateLine(index, { debit: e.target.value, credit: "" })}
        />
      ),
    },
    {
      key: "credit",
      title: t("common.credit"),
      align: "right",
      render: (_v, row, index) => (
        <TextInput
          aria-label={t("common.credit")}
          type="number"
          step="0.01"
          min="0"
          style={numberStyle}
          value={row.credit}
          onChange={(e) => updateLine(index, { credit: e.target.value, debit: "" })}
        />
      ),
    },
    {
      key: "currency",
      title: t("common.currency"),
      align: "left",
      width: CURRENCY_COL_WIDTH,
      render: (_v, row, index) => (
        <SelectField
          aria-label={t("common.currency")}
          value={row.currency}
          onChange={(e) =>
            updateLine(index, {
              currency: e.target.value,
              rate: e.target.value === "IDR" ? "1" : row.rate,
            })
          }
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
        />
      ),
    },
    {
      key: "rate",
      title: t("common.rateTerm"),
      align: "right",
      width: RATE_COL_WIDTH,
      render: (_v, row, index) => (
        <TextInput
          aria-label={t("common.rateTerm")}
          type="number"
          step="0.000001"
          min="0"
          style={numberStyle}
          value={row.rate}
          disabled={row.currency === "IDR"}
          onChange={(e) => updateLine(index, { rate: e.target.value })}
        />
      ),
    },
    {
      key: "costCenterId",
      title: t("journal.colCostCenter"),
      align: "left",
      width: COST_CENTER_COL_WIDTH,
      render: (_v, row, index) => (
        <SelectField
          aria-label={t("journal.colCostCenter")}
          value={row.costCenterId}
          onChange={(e) => updateLine(index, { costCenterId: e.target.value })}
          options={lineCostCenterOptions}
        />
      ),
    },
    {
      key: "actions",
      title: "",
      align: "right",
      render: (_v, _row, index) => (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("journal.removeRow")}
          disabled={lines.length <= 2}
          onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== index))}
        >
          <DeleteOutlined aria-hidden="true" />
        </Button>
      ),
    },
  ];

  /**
   * Baris total: Σ debit dan Σ kredit di bawah kolomnya sendiri, lalu lencana
   * keseimbangan membentang di atas empat kolom sisanya.
   */
  const summary: readonly SummaryRow[] = [
    {
      cells: {
        accountId: (
          <span style={{ color: token.colorTextSecondary }}>{t("journal.totalBase")}</span>
        ),
        debit: <Money value={totalDebit} currency="IDR" />,
        credit: <Money value={totalCredit} currency="IDR" />,
        currency: {
          /* Tiga keadaan, bukan dua — lihat catatan `sidesMatch` di atas.
             Belum diisi = netral; sisi cocok = berhasil; sisanya = selisih. */
          content: untouched ? (
            <Badge variant="default">{t("journal.awaitingEntry")}</Badge>
          ) : sidesMatch ? (
            <Badge variant="success">{t("journal.balanced")}</Badge>
          ) : (
            <Badge variant="danger">
              {t("journal.difference", {
                amount: formatCurrency(Math.abs(totalDebit - totalCredit), "IDR"),
              })}
            </Badge>
          ),
          colSpan: 4,
          align: "left",
        },
      },
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: t("journal.breadcrumb"), href: "/journal" },
          { label: t("journal.newTitle") },
        ]}
        title={t("journal.newTitle")}
      />

      {error && (
        <div role="alert" style={{ marginBottom: token.margin }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card style={{ marginBottom: token.marginLG }}>
          <CardHeader>
            <CardTitle level={2}>{t("journal.infoTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Row gutter={[token.margin, token.margin]}>
              <Col xs={24} sm={12}>
                <Input
                  id="date"
                  type="date"
                  label={t("common.date")}
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Col>
              <Col xs={24} sm={12}>
                <Input
                  id="note"
                  label={t("common.description")}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("journal.notePlaceholder")}
                />
              </Col>
              {/* issue #91 — pusat biaya BAWAAN. Baris boleh menimpanya, dan
                  memang harus bisa: satu jurnal yang sah dapat mencakup lebih
                  dari satu cabang. */}
              <Col span={24}>
                <Select
                  id="costCenterId"
                  label={t("journal.costCenterField")}
                  value={costCenterId}
                  onChange={(e) => setCostCenterId(e.target.value)}
                  options={headerCostCenterOptions}
                />
                <p
                  style={{
                    margin: 0,
                    marginTop: token.marginXXS,
                    color: token.colorTextSecondary,
                  }}
                >
                  <small>{t("journal.costCenterHint")}</small>
                </p>
              </Col>
            </Row>
          </CardContent>
        </Card>

        <Card style={{ marginBottom: token.marginLG }}>
          <CardHeader>
            <CardTitle level={2}>{t("journal.linesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <StaticTable
              columns={columns}
              rows={lines}
              rowKey={(row) => row.key}
              size="small"
              summary={summary}
            />

            <div style={{ marginTop: token.marginSM }}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
              >
                <PlusOutlined aria-hidden="true" /> {t("journal.addRow")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Flex wrap gap={token.marginSM}>
          <Button variant="primary" type="submit" disabled={loading || !balanced}>
            {loading ? t("common.saving") : t("journal.submit")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
        </Flex>
      </form>
    </div>
  );
}
