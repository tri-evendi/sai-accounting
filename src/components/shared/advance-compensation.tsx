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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money, MoneyCell } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/client";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { Loader2, HandCoins, Info, Trash2 } from "lucide-react";

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
      setError("Isi jumlah kompensasi pada minimal satu uang muka.");
      return;
    }
    setSaving(true);

    try {
      const response = await fetch("/api/advances/applications", {
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
      setError("Tidak dapat menghubungi server. Coba lagi.");
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
        setError(data?.error ?? "Gagal membatalkan kompensasi.");
        return;
      }
      toast("Kompensasi dibatalkan. Jurnalnya dibalik, bukan dihapus.", "success");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Already compensated */}
      {applied.length > 0 && (
        // Tabel ringkas (px-4 py-2) — padding rapat sengaja menimpa bawaan
        // primitif agar sama dengan tampilan sebelum migrasi.
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-auto px-4 py-2">{t("advances.compColAdvance")}</TableHead>
                <TableHead className="h-auto px-4 py-2">{t("common.date")}</TableHead>
                <TableHead className="h-auto px-4 py-2 text-right">{t("common.amount")}</TableHead>
                <TableHead className="h-auto px-4 py-2 text-right">IDR</TableHead>
                <TableHead className="h-auto px-4 py-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {applied.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="px-4 py-2 font-medium text-foreground">{a.advanceNo}</TableCell>
                  <TableCell className="px-4 py-2 text-muted-foreground">{formatDateShort(new Date(a.date))}</TableCell>
                  <TableCell className="p-0">
                    <MoneyCell
                      className="px-4 py-2 text-foreground"
                      value={a.amount}
                      currency={a.currency}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-2 text-right tabular-nums text-foreground">
                    {a.baseAmount != null ? (
                      <Money value={a.baseAmount} currency="IDR" />
                    ) : (
                      <span className="text-xs text-warning-strong">{t("common.rateMissing")}</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(a.id)}
                      disabled={busyId === a.id}
                      aria-label={`Batalkan kompensasi ${a.advanceNo}`}
                      className="gap-1 px-2 text-xs text-destructive-strong hover:bg-destructive-soft hover:text-destructive-strong"
                    >
                      {busyId === a.id ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                          aria-hidden="true"
                        />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Batalkan
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {advances.length === 0 ? (
        <p className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {applied.length > 0
              ? t("advances.compNoneLeft", { party: noun.party })
              : t("advances.compNoneAtAll", { target: noun.target })}
          </span>
        </p>
      ) : (
        <form onSubmit={handleApply} className="space-y-3">
          {/* Tabel ringkas (px-4 py-2) — padding rapat sengaja menimpa bawaan
              primitif agar sama dengan tampilan sebelum migrasi. */}
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-auto px-4 py-2">{t("advances.compColAdvance")}</TableHead>
                  <TableHead className="h-auto px-4 py-2 text-right">
                    {t("advances.compColRemaining")}
                  </TableHead>
                  <TableHead className="h-auto px-4 py-2 text-right">
                    {t("advances.compColApply", { target: noun.target })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advances.map((a) => {
                  const value = Number(amounts[a.id]) || 0;
                  const overLine = value > a.remaining + 0.005;
                  const crossCurrency = a.currency !== targetCurrency;
                  return (
                    <TableRow key={a.id} className="hover:bg-transparent">
                      <TableCell className="px-4 py-2">
                        <span className="font-medium text-foreground">{a.advanceNo}</span>
                        <span className="block text-xs text-muted-foreground">
                          {a.partyName} · {formatDateShort(new Date(a.date))}
                        </span>
                        {crossCurrency && (
                          <span className="mt-0.5 block text-xs text-warning-strong">
                            {t("advances.compCrossCurrency", {
                              target: noun.target,
                              currency: targetCurrency,
                            })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right tabular-nums text-foreground">
                        <Money value={a.remaining} currency={a.currency} />
                        <span className="block text-xs text-muted-foreground">
                          {a.remainingBase != null ? (
                            <Money value={a.remainingBase} currency="IDR" />
                          ) : (
                            t("common.rateMissing")
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        <Input
                          id={`adv-${targetKind}-${targetId}-${a.id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          max={a.remaining}
                          disabled={a.remainingBase == null}
                          aria-label={`Jumlah kompensasi dari ${a.advanceNo} (${a.currency})`}
                          className="text-right tabular-nums"
                          value={amounts[a.id] ?? ""}
                          onChange={(e) =>
                            setAmounts((prev) => ({ ...prev, [a.id]: e.target.value }))
                          }
                        />
                        {overLine && (
                          <p className="mt-1 text-xs text-destructive-strong" role="alert">
                            Melebihi sisa uang muka.
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-44">
              <Input
                id={`apply-date-${targetKind}-${targetId}`}
                type="date"
                label={t("advances.compDateField")}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="text-right text-xs">
              <p className="flex justify-between gap-6">
                <span className="text-muted-foreground">
                  {t("advances.compOutstanding", { target: noun.target })}
                </span>
                <span className="font-medium tabular-nums text-foreground">
                  {outstandingBase != null
                    ? formatCurrency(outstandingBase, "IDR")
                    : t("common.rateMissing")}
                </span>
              </p>
              <p className="flex justify-between gap-6">
                <span className="text-muted-foreground">{t("advances.compTotal")}</span>
                <span
                  className={`font-medium tabular-nums ${
                    overTarget ? "text-destructive-strong" : "text-foreground"
                  }`}
                >
                  {formatCurrency(totalBase, "IDR")}
                </span>
              </p>
            </div>
          </div>

          {overTarget && (
            <p className="rounded-md bg-destructive-soft p-2 text-xs text-destructive-strong" role="alert">
              {t("advances.compOverTarget", { target: noun.target })}
            </p>
          )}

          {error && (
            <p className="rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong" role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="sm"
            disabled={saving || lines.length === 0}
            className="cursor-pointer"
          >
            {saving ? (
              <Loader2
                className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <HandCoins className="mr-1.5 h-4 w-4" aria-hidden="true" />
            )}
            Kompensasi Uang Muka
          </Button>
        </form>
      )}
    </div>
  );
}
