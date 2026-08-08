"use client";

/**
 * Compensating uang muka into one document (issues #26, #41).
 *
 * This is the screen the whole feature exists for: money moved months before the
 * document existed, and now has to come off the bill. It was written for the
 * sales side (an invoice, #26) and generalised for the purchase side (a supplier
 * purchase row, #41) rather than copied — the two differ only in which noun the
 * copy uses and which endpoint parameter names the target. The arithmetic, the
 * ceilings and the request shape are identical, and one component keeps them
 * that way.
 *
 * The remaining balance of each advance is surfaced three ways, mirroring how
 * the #37/#38 allocation editor surfaces purchase room: per advance (in its own
 * currency, with the IDR base beneath), per line as a client-side ceiling check
 * before the round trip, and as a footer total against what the document still
 * owes. The server re-checks all of it in `resolveApplicationLines` — this is a
 * convenience, never the guard.
 *
 * Amounts are entered in the ADVANCE's currency, because an application is a
 * slice of one advance. Advances in a currency other than the document's are
 * offered but not pre-filled: cross-currency compensation is legitimate but the
 * app will not guess how much of one clears the other.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Flex, Spin, theme, Typography } from "antd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Money } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/client";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { formatDateShort } from "@/lib/utils";
import { DeleteOutlined, InfoCircleOutlined, MoneyCollectOutlined } from "@ant-design/icons";
import { apiFetch } from "@/lib/api-fetch";
import { moneyPalette } from "@/lib/theme/antd-tokens";

/** Lebar isian tanggal kompensasi — setara `w-44` sebelum migrasi. */
const DATE_FIELD_WIDTH = 176;

export interface AdvanceOption {
  id: number;
  advanceNo: string;
  date: string;
  currency: string;
  remaining: number;
  remainingBase: number | null;
  partyName: string;
}

export interface AppliedAdvance {
  id: number;
  advanceNo: string;
  date: string;
  amount: number;
  currency: string;
  baseAmount: number | null;
}

/**
 * The words that change between the two sides. Kept as data rather than as
 * `targetKind === "invoice" ? … : …` scattered through the JSX, so adding a
 * third kind of target is a table entry and not an audit of the whole file.
 */
/**
 * Kata benda sasaran/mitra — KUNCI kamus, bukan katanya. Sebelum multibahasa
 * kata Indonesianya dirangkai langsung ke belasan kalimat ("Kompensasi ke
 * faktur ini"); rangkaian seperti itu tak bisa diterjemahkan, jadi katanya kini
 * diambil dari kamus dan disisipkan lewat `{target}`/`{party}`.
 */
const COPY = {
  invoice: {
    target: "advances.compTargetInvoice",
    party: "advances.compPartyInvoice",
  },
  purchase: {
    target: "advances.compTargetPurchase",
    party: "advances.compPartySupplier",
  },
} as const satisfies Record<string, { target: DictionaryKey; party: DictionaryKey }>;

export function AdvanceCompensationSection({
  targetKind,
  targetId,
  targetCurrency,
  outstandingBase,
  advances,
  applied,
}: {
  targetKind: "invoice" | "purchase";
  targetId: number;
  targetCurrency: string;
  /** What the document still owes in IDR, after payments and prior compensation. */
  outstandingBase: number | null;
  advances: AdvanceOption[];
  applied: AppliedAdvance[];
}) {
  const router = useRouter();
  const t = useT();
  const { token } = theme.useToken();
  const money = moneyPalette(token);
  const { toast } = useToast();
  const nounKeys = COPY[targetKind];
  const noun = { target: t(nounKeys.target), party: t(nounKeys.party) };

  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lines = advances
    .map((a) => ({ advance: a, value: Number(amounts[a.id]) || 0 }))
    .filter((l) => l.value > 0);

  // IDR base of what is being applied — the only unit in which advances of
  // different currencies may be added together.
  const totalBase = lines.reduce((s, l) => {
    if (l.advance.remainingBase == null || l.advance.remaining <= 0) return s;
    const perUnit = l.advance.remainingBase / l.advance.remaining;
    return s + l.value * perUnit;
  }, 0);

  const overTarget =
    outstandingBase != null && totalBase > outstandingBase + 0.005;

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (lines.length === 0) {
      setError(t("advances.compErrNoAmount"));
      return;
    }
    setSaving(true);

    try {
      const response = await apiFetch("/api/advances/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetKind,
          targetId,
          date,
          lines: lines.map((l) => ({ advanceId: l.advance.id, amount: l.value })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const fieldErrors = data?.details?.fieldErrors as
          | Record<string, string[]>
          | undefined;
        const first = fieldErrors
          ? Object.values(fieldErrors).flat().find(Boolean)
          : undefined;
        setError(first ?? data?.error ?? "Gagal mengompensasi uang muka.");
        return;
      }

      toast(t("advances.compApplied", { target: noun.target }), "success");
      setAmounts({});
      router.refresh();
    } catch {
      setError(t("advances.compErrNetwork"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(applicationId: number) {
    setBusyId(applicationId);
    setError(null);
    try {
      const response = await fetch(
        `/api/advances/applications?id=${applicationId}`,
        { method: "DELETE" }
      );
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? t("advances.compErrRemove"));
        return;
      }
      toast(t("advances.compRemoved"), "success");
      router.refresh();
    } catch {
      setError(t("advances.compErrNetwork"));
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Kolom tabel "sudah dikompensasi".
   *
   * Kedua tabel pindah dari JSX `<TableRow><TableCell>` ke `DataTable`
   * (#189): itu yang menghapus seluruh `px-4 py-2` per sel — kerapatannya kini
   * `size="small"` milik AntD, satu prop, bukan dua kelas di sebelas tempat —
   * dan membawa pembungkus geser `scroll.x` sehingga di 375px yang menggulung
   * adalah tabelnya, bukan halamannya. `DataTable`, bukan `StaticTable`, karena
   * baris keduanya memuat isian dan tombol; datanya memang sudah di client.
   */
  const appliedColumns: SaiColumns<AppliedAdvance> = [
    {
      key: "advanceNo",
      dataIndex: "advanceNo",
      title: t("advances.compColAdvance"),
      render: (_v, a) => <Typography.Text strong>{a.advanceNo}</Typography.Text>,
    },
    {
      key: "date",
      dataIndex: "date",
      title: t("common.date"),
      render: (_v, a) => (
        <Typography.Text type="secondary">{formatDateShort(new Date(a.date))}</Typography.Text>
      ),
    },
    {
      key: "amount",
      dataIndex: "amount",
      title: t("common.amount"),
      align: "right",
      render: (_v, a) => <Money value={a.amount} currency={a.currency} />,
    },
    {
      key: "baseAmount",
      dataIndex: "baseAmount",
      title: "IDR",
      align: "right",
      /*
       * Kurs yang belum ada TIDAK ditulis 0 (MASTER.md): kalimatnya menyebut
       * sebabnya, dan warnanya `colorMoneyPending` — token yang sama yang
       * dipakai label status "Menunggu", bukan amber pekat yang gagal AA.
       */
      render: (_v, a) =>
        a.baseAmount != null ? (
          <Money value={a.baseAmount} currency="IDR" />
        ) : (
          <span style={{ fontSize: token.fontSizeSM, color: money.colorMoneyPending }}>
            {t("common.rateMissing")}
          </span>
        ),
    },
    {
      key: "actions",
      title: "",
      align: "right",
      render: (_v, a) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => handleRemove(a.id)}
          disabled={busyId === a.id}
          aria-label={`Batalkan kompensasi ${a.advanceNo}`}
          style={{ color: money.colorMoneyNegative }}
        >
          {busyId === a.id ? (
            <Spin size="small" style={{ color: "inherit" }} />
          ) : (
            <DeleteOutlined aria-hidden="true" />
          )}
          Batalkan
        </Button>
      ),
    },
  ];

  /** Kolom tabel "uang muka yang bisa dipakai" — baris beisian. */
  const advanceColumns: SaiColumns<AdvanceOption> = [
    {
      key: "advanceNo",
      dataIndex: "advanceNo",
      title: t("advances.compColAdvance"),
      render: (_v, a) => (
        <>
          <Typography.Text strong>{a.advanceNo}</Typography.Text>
          <Typography.Text
            type="secondary"
            style={{ display: "block", fontSize: token.fontSizeSM }}
          >
            {a.partyName} · {formatDateShort(new Date(a.date))}
          </Typography.Text>
          {a.currency !== targetCurrency && (
            <span
              style={{
                display: "block",
                marginTop: token.marginXXS,
                fontSize: token.fontSizeSM,
                color: money.colorMoneyPending,
              }}
            >
              {t("advances.compCrossCurrency", {
                target: noun.target,
                currency: targetCurrency,
              })}
            </span>
          )}
        </>
      ),
    },
    {
      key: "remaining",
      dataIndex: "remaining",
      title: t("advances.compColRemaining"),
      align: "right",
      render: (_v, a) => (
        <>
          <Money value={a.remaining} currency={a.currency} />
          <Typography.Text
            type="secondary"
            style={{ display: "block", fontSize: token.fontSizeSM }}
          >
            {a.remainingBase != null ? (
              <Money value={a.remainingBase} currency="IDR" />
            ) : (
              t("common.rateMissing")
            )}
          </Typography.Text>
        </>
      ),
    },
    {
      key: "apply",
      title: t("advances.compColApply", { target: noun.target }),
      render: (_v, a) => {
        const value = Number(amounts[a.id]) || 0;
        const overLine = value > a.remaining + 0.005;
        return (
          <>
            <Input
              id={`adv-${targetKind}-${targetId}-${a.id}`}
              type="number"
              step="0.01"
              min="0"
              max={a.remaining}
              disabled={a.remainingBase == null}
              aria-label={`Jumlah kompensasi dari ${a.advanceNo} (${a.currency})`}
              invalid={overLine}
              style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
              value={amounts[a.id] ?? ""}
              onChange={(e) => setAmounts((prev) => ({ ...prev, [a.id]: e.target.value }))}
            />
            {overLine && (
              <p
                role="alert"
                style={{
                  margin: 0,
                  marginTop: token.marginXXS,
                  fontSize: token.fontSizeSM,
                  color: money.colorMoneyNegative,
                }}
              >
                Melebihi sisa uang muka.
              </p>
            )}
          </>
        );
      },
    },
  ];

  return (
    <Flex vertical gap={token.margin}>
      {/* Already compensated */}
      {applied.length > 0 && (
        <DataTable
          columns={appliedColumns}
          data={applied}
          rowKey={(a) => a.id}
          size="small"
        />
      )}

      {advances.length === 0 ? (
        <Alert
          type="info"
          icon={<InfoCircleOutlined aria-hidden="true" style={{ fontSize: token.fontSizeLG }} />}
          showIcon
          message={
            applied.length > 0
              ? t("advances.compNoneLeft", { party: noun.party })
              : t("advances.compNoneAtAll", { target: noun.target })
          }
        />
      ) : (
        <form onSubmit={handleApply}>
          <Flex vertical gap={token.marginSM}>
            <DataTable
              columns={advanceColumns}
              data={advances}
              rowKey={(a) => a.id}
              size="small"
            />

            <Flex wrap align="flex-end" justify="space-between" gap={token.marginSM}>
              <div style={{ width: DATE_FIELD_WIDTH }}>
                <Input
                  id={`apply-date-${targetKind}-${targetId}`}
                  type="date"
                  label={t("advances.compDateField")}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <Flex vertical gap={token.marginXXS} style={{ fontSize: token.fontSizeSM }}>
                <Flex justify="space-between" gap={token.marginLG}>
                  <Typography.Text type="secondary" style={{ fontSize: "inherit" }}>
                    {t("advances.compOutstanding", { target: noun.target })}
                  </Typography.Text>
                  {outstandingBase != null ? (
                    <Money value={outstandingBase} currency="IDR" />
                  ) : (
                    <Typography.Text type="secondary" style={{ fontSize: "inherit" }}>
                      {t("common.rateMissing")}
                    </Typography.Text>
                  )}
                </Flex>
                <Flex justify="space-between" gap={token.marginLG}>
                  <Typography.Text type="secondary" style={{ fontSize: "inherit" }}>
                    {t("advances.compTotal")}
                  </Typography.Text>
                  {/*
                   * Merah saat melebihi sasaran — penanda KEDUA: kalimat
                   * `compOverTarget` di bawah mengatakan hal yang sama dengan
                   * kata-kata, dan `role="alert"`-nya mengumumkannya.
                   */}
                  <Money
                    value={totalBase}
                    currency="IDR"
                    tone={overTarget ? "negative" : "neutral"}
                  />
                </Flex>
              </Flex>
            </Flex>

            {overTarget && (
              <div role="alert">
                <Alert
                  type="error"
                  showIcon
                  message={t("advances.compOverTarget", { target: noun.target })}
                />
              </div>
            )}

            {error && (
              <div role="alert">
                <Alert type="error" showIcon message={error} />
              </div>
            )}

            <div>
              {/* TURUN dari berisi penuh ke `secondary` (#267). Bagian ini
                  SELALU terbuka — tidak ada pemicu yang harus ditekan dulu —
                  jadi setiap faktur dan setiap pemasok yang kebetulan punya
                  uang muka menyala biru tanpa ada yang memutuskannya. Padahal
                  aksi utama layarnya ada di tempat lain dan bertabrakan
                  langsung dengannya: "Catat pembayaran" di `/invoices/[id]`
                  (`shared/payment-form.tsx`) dan "Catat uang muka" di
                  `/suppliers/[id]` (`advance-panel.tsx`). Kompensasi tetap
                  aksi yang mengikat — ia memang memposting — tetapi ia aksi
                  SAMPINGAN pada layar yang tugas utamanya lain, dan
                  penekanannya harus mengatakan itu. */}
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                disabled={saving || lines.length === 0}
              >
                {saving ? (
                  <Spin size="small" style={{ color: "inherit" }} />
                ) : (
                  <MoneyCollectOutlined aria-hidden="true" />
                )}
                Kompensasi Uang Muka
              </Button>
            </div>
          </Flex>
        </form>
      )}
    </Flex>
  );
}
