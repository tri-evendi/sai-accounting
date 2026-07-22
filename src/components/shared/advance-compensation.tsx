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
import { useToast } from "@/components/ui/toast";
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
const COPY = {
  invoice: { target: "faktur", party: "pelanggan" },
  purchase: { target: "pembelian", party: "supplier" },
} as const;

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
  const { toast } = useToast();
  const noun = COPY[targetKind];

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

      toast(`Uang muka dikompensasi. Tagihan ${noun.target} berkurang.`, "success");
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
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2 font-medium text-muted-foreground">Uang Muka</th>
                <th className="px-4 py-2 font-medium text-muted-foreground">Tanggal</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Jumlah</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">IDR</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {applied.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-foreground">{a.advanceNo}</td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDateShort(new Date(a.date))}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-foreground">
                    {formatCurrency(a.amount, a.currency)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-foreground">
                    {a.baseAmount != null ? (
                      formatCurrency(a.baseAmount, "IDR")
                    ) : (
                      <span className="text-xs text-warning-strong">Kurs belum diisi</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemove(a.id)}
                      disabled={busyId === a.id}
                      aria-label={`Batalkan kompensasi ${a.advanceNo}`}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive-strong transition-colors duration-200 hover:bg-destructive-soft disabled:cursor-not-allowed disabled:opacity-50"
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
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {advances.length === 0 ? (
        <p className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {applied.length > 0
              ? `Tidak ada sisa uang muka lain untuk ${noun.party} ini.`
              : `Belum ada uang muka yang bisa dikompensasi ke ${noun.target} ini.`}
          </span>
        </p>
      ) : (
        <form onSubmit={handleApply} className="space-y-3">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-2 font-medium text-muted-foreground">Uang Muka</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Sisa</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                    Kompensasi ke {noun.target} ini
                  </th>
                </tr>
              </thead>
              <tbody>
                {advances.map((a) => {
                  const value = Number(amounts[a.id]) || 0;
                  const overLine = value > a.remaining + 0.005;
                  const crossCurrency = a.currency !== targetCurrency;
                  return (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        <span className="font-medium text-foreground">{a.advanceNo}</span>
                        <span className="block text-xs text-muted-foreground">
                          {a.partyName} · {formatDateShort(new Date(a.date))}
                        </span>
                        {crossCurrency && (
                          <span className="mt-0.5 block text-xs text-warning-strong">
                            Mata uang berbeda dari {noun.target} ({targetCurrency}) — isi
                            jumlahnya sendiri.
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground">
                        {formatCurrency(a.remaining, a.currency)}
                        <span className="block text-xs text-muted-foreground">
                          {a.remainingBase != null
                            ? formatCurrency(a.remainingBase, "IDR")
                            : "Kurs belum diisi"}
                        </span>
                      </td>
                      <td className="px-4 py-2">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-44">
              <Input
                id={`apply-date-${targetKind}-${targetId}`}
                type="date"
                label="Tanggal kompensasi"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="text-right text-xs">
              <p className="flex justify-between gap-6">
                <span className="text-muted-foreground">Sisa tagihan {noun.target}</span>
                <span className="font-medium tabular-nums text-foreground">
                  {outstandingBase != null
                    ? formatCurrency(outstandingBase, "IDR")
                    : "Kurs belum diisi"}
                </span>
              </p>
              <p className="flex justify-between gap-6">
                <span className="text-muted-foreground">Total dikompensasi</span>
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
              Total kompensasi melebihi sisa tagihan {noun.target} ini.
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
