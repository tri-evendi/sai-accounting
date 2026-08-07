"use client";

/**
 * Recording an advance (issue #26).
 *
 * The direction is picked first and everything downstream follows from it —
 * which party list to show, and the plain-language explanation of where the
 * money will land. Accounting terms ("kewajiban", "Uang Muka Penjualan") appear
 * as supporting text next to a task-language label, per the MASTER.md rule about
 * not putting raw jargon on the surface.
 *
 * Issue #41 embeds this same form in the supplier screen, where the direction
 * and the party are already known. `locked` is what makes that possible: the two
 * questions the context has already answered are stated as fact instead of asked
 * again, and everything else — the currency/rate discipline, the ledger preview,
 * the error handling, the endpoint — is the one implementation. A second inline
 * "quick advance" form would be a second place for the FX rules to drift.
 */
import { useState } from "react";
import { Alert, Flex, Spin, theme, Typography } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Select } from "@/components/ui/select";
import { ServerSearchableSelect } from "@/components/ui/server-searchable-select";
import {
  CurrencyRateFields,
  currencyRatePayload,
} from "@/components/shared/currency-rate-fields";
import { useToast } from "@/components/ui/toast";
import { InfoCircleOutlined } from "@ant-design/icons";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

/**
 * Kisi DUA kolom yang runtuh jadi satu di layar sempit — pengganti
 * `sm:grid-cols-2`. Tetap CSS grid: `CurrencyRateFields` menjatuhkan DUA isian
 * langsung ke dalam kisi ini (ia tidak membungkusnya), jadi kisi itulah yang
 * harus mengatur keduanya.
 */
const FIELD_MIN = 280;
const twoColumnGrid = (gap: number): React.CSSProperties => ({
  display: "grid",
  gap,
  gridTemplateColumns: `repeat(auto-fit, minmax(max(${FIELD_MIN}px, calc((100% - ${gap}px) / 2)), 1fr))`,
});
const FULL_ROW: React.CSSProperties = { gridColumn: "1 / -1" };

export interface PartyOption {
  id: number;
  name: string;
}

/**
 * Bentuk lama daftar kontrak preload. Pemilih kontraknya kini mencari ke server
 * (audit: daftar `take: 200` memotong kontrak lama), jadi prop `contracts`
 * tidak dipakai lagi — tipenya dipertahankan hanya agar pemanggil tersemat
 * (`suppliers/[id]/advance-panel.tsx`) tetap terkompilasi tanpa disentuh.
 */
export interface ContractOption {
  id: number;
  contractNo: string;
  buyer: string;
}

const PlainShell = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      padding: "var(--ant-padding)",
      borderRadius: "var(--ant-border-radius)",
      border: "1px solid var(--ant-color-border-secondary)",
    }}
  >
    {children}
  </div>
);

const CardShell = ({ children }: { children: React.ReactNode }) => (
  <Card>
    <div style={{ padding: "var(--ant-padding-lg)" }}>{children}</div>
  </Card>
);

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Direction and party already settled by the surrounding screen (issue #41).
 * Both or neither — a locked direction with a free party list would let a
 * supplier page record an advance against a customer.
 */
export interface LockedParty {
  type: "sales" | "purchase";
  party: PartyOption;
}

export function AdvanceForm({
  customers = [],
  suppliers = [],
  locked,
  onSaved,
  onCancel,
}: {
  customers?: PartyOption[];
  suppliers?: PartyOption[];
  /** Tidak dipakai lagi — lihat catatan pada `ContractOption`. */
  contracts?: ContractOption[];
  locked?: LockedParty;
  /** Called instead of navigating to /advances. Embedded callers close and refresh. */
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useAppRouter();
  const { toast } = useToast();
  const t = useT();
  const { token } = theme.useToken();

  const [type, setType] = useState<"sales" | "purchase">(locked?.type ?? "sales");
  const [date, setDate] = useState(todayISO());
  const [partyId, setPartyId] = useState("");
  const [contractId, setContractId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSales = type === "sales";
  const parties = isSales ? customers : suppliers;
  // The one id the request must carry, wherever it came from.
  const effectivePartyId = locked ? locked.party.id : Number(partyId);
  const amountNum = Number(amount) || 0;
  const rateNum = Number(rate) || 0;
  // Shown live so the user sees the ledger value before saving, not after.
  const baseValue =
    currency === "IDR" ? amountNum : rateNum > 0 ? amountNum * rateNum : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const response = await apiFetch("/api/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          date,
          customerId: isSales ? effectivePartyId : undefined,
          supplierId: isSales ? undefined : effectivePartyId,
          contractId: contractId ? Number(contractId) : undefined,
          amount: amountNum,
          note: note || undefined,
          ...currencyRatePayload(currency, rate),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        // Field errors first — they name the input to fix; fall back to the
        // posting-engine message, which already explains nothing was saved.
        const fieldErrors = data?.details?.fieldErrors as
          | Record<string, string[]>
          | undefined;
        const first = fieldErrors
          ? Object.values(fieldErrors).flat().find(Boolean)
          : undefined;
        setError(first ?? data?.error ?? t("advances.saveFailed"));
        return;
      }

      toast(t("advances.saved"), "success");
      if (onSaved) {
        // Embedded: the user is mid-task on another screen, so stay put and let
        // the server component re-read the balances that just changed.
        setAmount("");
        setRate("");
        setNote("");
        onSaved();
      } else {
        router.push("/advances");
      }
      router.refresh();
    } catch {
      setError(t("advances.networkFailed"));
    } finally {
      setSaving(false);
    }
  }

  // Embedded, the form already sits inside the host page's Card — nesting a
  // second one just draws a box in a box. Both shells are module-level so their
  // identity is stable across renders: a component defined inside the body is a
  // NEW type every keystroke, which remounts the whole subtree and takes the
  // focus out of the field being typed in.
  const Shell = locked ? PlainShell : CardShell;

  return (
    <form onSubmit={handleSubmit}>
      <Shell>
        <div style={twoColumnGrid(token.margin)}>
          {locked ? (
            /* Stated, not asked — but stated in full, so the user can see what
               they are about to record without leaving the page. */
            <div
              style={{
                ...FULL_ROW,
                padding: token.paddingXS,
                borderRadius: token.borderRadius,
                border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                background: token.colorFillQuaternary,
              }}
            >
              <strong>{isSales ? t("advances.lockedSales") : t("advances.lockedPurchase")}</strong>{" "}
              · {locked.party.name}
            </div>
          ) : (
            <Select
              id="type"
              label={t("advances.typeField")}
              value={type}
              onChange={(e) => {
                setType(e.target.value as "sales" | "purchase");
                setPartyId("");
                setContractId("");
              }}
              options={[
                { value: "sales", label: t("advances.lockedSales") },
                { value: "purchase", label: t("advances.lockedPurchase") },
              ]}
            />
          )}

          <Input
            id="date"
            type="date"
            label={t("common.date")}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />

          {!locked && (
            <Select
              id="partyId"
              label={isSales ? t("common.customer") : t("advances.partySupplier")}
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              placeholder={isSales ? t("advances.pickCustomer") : t("advances.pickSupplier")}
              options={parties.map((p) => ({ value: String(p.id), label: p.name }))}
              required
            />
          )}

          <div>
            {/* Mencari ke server (audit: daftar statis `take: 200` memotong
                kontrak lama). Kosong = tidak ditautkan ke kontrak. */}
            <ServerSearchableSelect
              id="contractId"
              label={t("advances.contractField")}
              placeholder={t("advances.noContract")}
              fetchUrl="/api/contracts?picker=1"
              value={contractId || null}
              onChange={(v) => setContractId(v ?? "")}
            />
            <Typography.Paragraph
              type="secondary"
              style={{ margin: 0, marginTop: token.marginXXS, fontSize: token.fontSizeSM }}
            >
              {t("advances.contractHintBefore")}{" "}
              {isSales ? t("advances.contractHintSales") : t("advances.contractHintPurchase")}
              {t("common.fullStop")}
            </Typography.Paragraph>
          </div>

          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
            label={t("common.amount")}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />

          <div />

          <CurrencyRateFields
            currency={currency}
            rate={rate}
            onCurrencyChange={setCurrency}
            onRateChange={setRate}
            rateHint={t("advances.rateHint")}
          />

          <div style={FULL_ROW}>
            <Input
              id="note"
              label={t("common.notesOptional")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>

        {/* Valas tanpa kurs TIDAK punya nilai buku besar: `baseValue` null dan
            barisnya tidak dirender sama sekali — tidak pernah "Rp 0". */}
        {baseValue != null && currency !== "IDR" && (
          <Typography.Paragraph style={{ marginTop: token.margin, marginBottom: 0 }}>
            <Typography.Text type="secondary">{t("advances.ledgerValue")} </Typography.Text>
            <Money
              value={baseValue}
              currency="IDR"
              style={{ fontWeight: token.fontWeightStrong }}
            />
          </Typography.Paragraph>
        )}

        {/* Catatan akun: ikon + kata; warnanya tidak pernah jadi penanda. */}
        <Flex
          align="flex-start"
          gap={token.marginXS}
          style={{
            marginTop: token.margin,
            padding: token.paddingXS,
            borderRadius: token.borderRadius,
            border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
            background: token.colorFillQuaternary,
          }}
        >
          <InfoCircleOutlined aria-hidden="true" style={{ fontSize: token.fontSize, flexShrink: 0, marginTop: 2 }} />
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {isSales ? (
              <>
                {t("advances.hintSalesBefore")}{" "}
                <strong>{t("advances.hintSalesAccount")}</strong>{" "}
                {t("advances.hintSalesMiddle")} <em>{t("advances.hintSalesTerm")}</em>
                {t("advances.hintSalesAfter")} <strong>{t("advances.hintNot")}</strong>{" "}
                {t("advances.hintSalesTail")}
              </>
            ) : (
              <>
                {t("advances.hintPurchaseBefore")}{" "}
                <strong>{t("advances.hintPurchaseAccount")}</strong>{" "}
                {t("advances.hintSalesMiddle")} <em>{t("advances.hintPurchaseTerm")}</em>
                {t("advances.hintPurchaseAfter")} <strong>{t("advances.hintNot")}</strong>{" "}
                {t("advances.hintPurchaseTail")}
              </>
            )}
          </Typography.Text>
        </Flex>

        {error && (
          <div role="alert" style={{ marginTop: token.margin }}>
            <Alert type="error" showIcon message={error} />
          </div>
        )}
      </Shell>

      <Flex wrap gap={token.marginXS} style={{ marginTop: locked ? token.margin : token.marginLG }}>
        <Button type="submit" size={locked ? "sm" : undefined} disabled={saving}>
          {saving && <Spin size="small" />}
          {t("advances.submit")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size={locked ? "sm" : undefined}
          onClick={() => (onCancel ? onCancel() : router.push("/advances"))}
        >
          {t("common.cancel")}
        </Button>
      </Flex>
    </form>
  );
}
