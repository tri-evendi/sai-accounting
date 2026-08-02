"use client";

/**
 * Uang Muka Pembelian on the supplier screen (issue #41).
 *
 * The purchase side of advances was complete in the backend since #26 — the
 * type, the endpoint, the compensation guard, the AP integration and their tests
 * all existed — with no way to reach any of it except by calling the API by
 * hand. This panel is that missing surface, and deliberately nothing more: every
 * write goes through the same two endpoints the sales side uses, so the journals
 * are the ones the API already produced. No accounting rule lives in this file.
 *
 * ── Why the target is PICKED here, unlike the invoice screen ─────────────────
 * On `/invoices/[id]` the document being settled is the page itself, so there is
 * nothing to choose. A supplier has many purchases, so the flow gains one step:
 * pick the purchase, then compensate into it. That step is also where the
 * issue's "show each purchase's outstanding" requirement is met — the picker
 * carries the remaining IDR of every option, so the choice is informed rather
 * than made blind and corrected by a server error.
 *
 * ── Currency discipline ─────────────────────────────────────────────────────
 * Every cross-document figure here is IDR base. An advance or purchase with no
 * usable rate has no IDR value at all, so it is excluded from the totals and
 * counted out loud (`Belum berkurs`) rather than folded in at 1:1 — the bug
 * fixed in #35/#36 and re-stated in the header of `receivables.ts`.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money, MoneyCell } from "@/components/ui/money";
import {
  AdvanceCompensationSection,
  type AdvanceOption,
  type AppliedAdvance,
} from "@/components/shared/advance-compensation";
import {
  AdvanceForm,
  type ContractOption,
} from "@/app/(dashboard)/t/[tenantSlug]/[companySlug]/advances/new/advance-form";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { ArrowUpFromLine, HandCoins, Info, Plus, X } from "lucide-react";

/** One purchase this supplier's advances can be compensated into. */
export interface PurchaseTargetView {
  id: number;
  label: string;
  date: string;
  currency: string;
  amount: number;
  /** Room left for compensation, IDR base. Never null here — see page.tsx. */
  remainingBase: number;
}

/** One advance paid to this supplier, with its balance already worked out. */
export interface SupplierAdvanceView {
  id: number;
  advanceNo: string;
  date: string;
  currency: string;
  amount: number;
  applied: number;
  remaining: number;
  remainingBase: number | null;
  unratedApplications: number;
  isFullyApplied: boolean;
  contractNo: string | null;
}

export function SupplierAdvancePanel({
  supplier,
  contracts,
  advances,
  outstandingBase,
  unratedAdvanceCount,
  purchases,
  unratedPurchaseCount,
  appliedByPurchase,
}: {
  supplier: { id: number; name: string };
  contracts: ContractOption[];
  advances: SupplierAdvanceView[];
  /** Σ remaining of every advance that HAS an IDR value. */
  outstandingBase: number;
  /** Advances excluded from that sum because they carry no rate. */
  unratedAdvanceCount: number;
  purchases: PurchaseTargetView[];
  /** Purchases dropped from the picker because they carry no rate. */
  unratedPurchaseCount: number;
  appliedByPurchase: Record<number, AppliedAdvance[]>;
}) {
  const router = useRouter();
  const t = useT();
  const [recording, setRecording] = useState(false);
  const [targetId, setTargetId] = useState<string>("");

  const open = advances.filter((a) => !a.isFullyApplied);
  const selected = purchases.find((p) => String(p.id) === targetId) ?? null;

  // Only advances with balance left can be compensated, and only ones with a
  // usable IDR value can be checked against the target — the API rejects the
  // rest with an explanatory error, so they are listed above but not offered.
  const options: AdvanceOption[] = open.map((a) => ({
    id: a.id,
    advanceNo: a.advanceNo,
    date: a.date,
    currency: a.currency,
    remaining: a.remaining,
    remainingBase: a.remainingBase,
    partyName: supplier.name,
  }));

  return (
    <div className="space-y-5">
      {/* What this money IS. Direction is carried by an icon and by the words
          "Uang keluar", never by colour alone. */}
      <p className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden="true" />
            {t("suppliers.introMoneyOut")}
          </span>{" "}
          {t("suppliers.introA")} <strong>{t("suppliers.introBefore")}</strong>{" "}
          {t("suppliers.introB")} <strong>{t("suppliers.introAdvance")}</strong>{" "}
          {t("suppliers.introC")} <em>{t("suppliers.introAsset")}</em>{" "}
          <strong>{t("suppliers.introNot")}</strong> {t("suppliers.introD")}
        </span>
      </p>

      {/* Balance tiles — the number the panel exists to answer. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">{t("suppliers.outstandingLabel")}</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {formatCurrency(outstandingBase, "IDR")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("suppliers.outstandingHint", { count: open.length })}
          </p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">{t("suppliers.unratedLabel")}</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {unratedAdvanceCount}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("suppliers.unratedHintA")} <strong>{t("suppliers.unratedHintStrong")}</strong>{" "}
            {t("suppliers.unratedHintB")}
          </p>
        </div>
      </div>

      {/* Record a new advance — progressive disclosure, closed by default so the
          panel reads as a balance first and a form second. */}
      {recording ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              {t("suppliers.recordAdvanceTo", { name: supplier.name })}
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={() => setRecording(false)}
            >
              <X className="mr-1 h-4 w-4" aria-hidden="true" />
              {t("common.close")}
            </Button>
          </div>
          <AdvanceForm
            contracts={contracts}
            locked={{ type: "purchase", party: supplier }}
            onSaved={() => {
              setRecording(false);
              router.refresh();
            }}
            onCancel={() => setRecording(false)}
          />
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          className="cursor-pointer"
          onClick={() => setRecording(true)}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("suppliers.recordAdvance")}
        </Button>
      )}

      {/* Advances paid to this supplier */}
      {advances.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          {t("suppliers.noAdvances")}
        </p>
      ) : (
        // Tabel ringkas (px-4 py-2) — padding rapat sengaja menimpa bawaan
        // primitif agar sama dengan tampilan sebelum migrasi.
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-auto px-4 py-2">{t("suppliers.colNumber")}</TableHead>
                <TableHead className="h-auto px-4 py-2">{t("common.date")}</TableHead>
                <TableHead className="h-auto px-4 py-2">{t("suppliers.colContract")}</TableHead>
                <TableHead className="h-auto px-4 py-2 text-right">{t("suppliers.colValue")}</TableHead>
                <TableHead className="h-auto px-4 py-2 text-right">
                  {t("suppliers.colApplied")}
                </TableHead>
                <TableHead className="h-auto px-4 py-2 text-right">{t("suppliers.colRemaining")}</TableHead>
                <TableHead className="h-auto px-4 py-2 text-right">{t("suppliers.colRemainingIdr")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {advances.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="px-4 py-2">
                    <span className="font-medium text-foreground">{a.advanceNo}</span>
                    {/* Badge always carries text — colour is never the only signal. */}
                    <span className="mt-0.5 block">
                      <Badge variant={a.isFullyApplied ? "default" : "warning"}>
                        {a.isFullyApplied ? t("suppliers.badgeUsedUp") : t("suppliers.badgeRemaining")}
                      </Badge>
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-2 text-foreground tabular-nums">
                    {formatDateShort(new Date(a.date))}
                  </TableCell>
                  <TableCell className="px-4 py-2 text-muted-foreground">{a.contractNo ?? "—"}</TableCell>
                  <TableCell className="p-0">
                    <MoneyCell
                      className="px-4 py-2 text-foreground"
                      value={a.amount}
                      currency={a.currency}
                    />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell
                      className="px-4 py-2 text-foreground"
                      value={a.applied}
                      currency={a.currency}
                    />
                  </TableCell>
                  <TableCell className="p-0">
                    <MoneyCell
                      className="px-4 py-2 font-medium text-foreground"
                      value={a.remaining}
                      currency={a.currency}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-2 text-right tabular-nums text-foreground">
                    {a.remainingBase != null ? (
                      <Money value={a.remainingBase} currency="IDR" />
                    ) : (
                      <span className="text-xs text-warning-strong">{t("common.rateMissing")}</span>
                    )}
                    {a.unratedApplications > 0 && (
                      <span className="mt-0.5 block text-xs text-warning-strong">
                        {t("suppliers.unratedApplications", { count: a.unratedApplications })}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Compensate into a purchase */}
      <div className="border-t border-border pt-4">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <HandCoins className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t("suppliers.compensateTitle")}
        </h4>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          {t("suppliers.compensateHintA")} <strong>{t("suppliers.compensateHintStrong")}</strong>{" "}
          {t("suppliers.compensateHintB")}
        </p>

        {purchases.length === 0 ? (
          <p className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {t("suppliers.noTargets")}
              {unratedPurchaseCount > 0 && (
                <>
                  {" "}
                  <strong>
                    {t("suppliers.unratedPurchaseCount", { count: unratedPurchaseCount })}
                  </strong>{" "}
                  {t("suppliers.unratedPurchaseRest")}
                </>
              )}
            </span>
          </p>
        ) : (
          <div className="space-y-4">
            <div className="max-w-md">
              <Select
                id="advance-target"
                label={t("suppliers.targetLabel")}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder={t("suppliers.pickPurchase")}
                options={purchases.map((p) => ({
                  value: String(p.id),
                  label: t("suppliers.targetOption", {
                    label: p.label,
                    date: formatDateShort(new Date(p.date)),
                    remaining: formatCurrency(p.remainingBase, "IDR"),
                  }),
                }))}
              />
              {unratedPurchaseCount > 0 && (
                <p className="mt-1 text-xs text-warning-strong">
                  {t("suppliers.unratedNotShown", { count: unratedPurchaseCount })}
                </p>
              )}
            </div>

            {selected && (
              <div className="rounded-md border border-border p-3">
                <p className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-foreground">{selected.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("suppliers.selectedValue", {
                      amount: formatCurrency(selected.amount, selected.currency),
                    })}{" "}
                    <strong className="tabular-nums text-foreground">
                      {formatCurrency(selected.remainingBase, "IDR")}
                    </strong>
                  </span>
                </p>
                <AdvanceCompensationSection
                  targetKind="purchase"
                  targetId={selected.id}
                  targetCurrency={selected.currency}
                  outstandingBase={selected.remainingBase}
                  advances={options}
                  applied={appliedByPurchase[selected.id] ?? []}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
