"use client";

/**
 * Pelepasan & pindah lokasi aset (issue #28).
 *
 * Disposal posts the removal + laba/rugi pelepasan journal; the gain/loss is
 * previewed live against the current book value. A move posts no journal.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { ArrowRightLeft, Banknote, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function AssetActions({ assetId, bookValue }: { assetId: number; bookValue: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();

  // Disposal
  const [dDate, setDDate] = useState(todayISO());
  const [proceeds, setProceeds] = useState("");
  const [dNote, setDNote] = useState("");
  const [disposing, setDisposing] = useState(false);
  const [dError, setDError] = useState<string | null>(null);

  // Transfer
  const [tDate, setTDate] = useState(todayISO());
  const [toLocation, setToLocation] = useState("");
  const [tNote, setTNote] = useState("");
  const [moving, setMoving] = useState(false);
  const [tError, setTError] = useState<string | null>(null);

  const gainLoss = useMemo(() => {
    const p = Number(proceeds);
    if (!proceeds || Number.isNaN(p)) return null;
    return Math.round((p - bookValue) * 100) / 100;
  }, [proceeds, bookValue]);

  async function dispose(e: React.FormEvent) {
    e.preventDefault();
    setDError(null);
    setDisposing(true);
    try {
      const res = await fetch(`/api/fixed-assets/${assetId}/dispose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dDate, proceeds: Number(proceeds) || 0, note: dNote || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDError(data?.error ?? t("fixedAssets.disposeFailed"));
        return;
      }
      toast(t("fixedAssets.disposeSaved"), "success");
      router.refresh();
    } catch {
      setDError(t("fixedAssets.networkFailed"));
    } finally {
      setDisposing(false);
    }
  }

  async function transfer(e: React.FormEvent) {
    e.preventDefault();
    setTError(null);
    setMoving(true);
    try {
      const res = await fetch(`/api/fixed-assets/${assetId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: tDate, toLocation, note: tNote || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTError(data?.error ?? t("fixedAssets.moveFailed"));
        return;
      }
      toast(t("fixedAssets.moveSaved"), "success");
      setToLocation("");
      setTNote("");
      router.refresh();
    } catch {
      setTError(t("fixedAssets.networkFailed"));
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-6">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-foreground">
          <ArrowRightLeft className="h-5 w-5 text-primary" aria-hidden="true" />
          {t("fixedAssets.moveTitle")}
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">{t("fixedAssets.moveHint")}</p>
        <form onSubmit={transfer} className="space-y-3">
          <Input id="t-date" type="date" label={t("common.date")} value={tDate} onChange={(e) => setTDate(e.target.value)} required />
          <Input
            id="t-loc"
            label={t("fixedAssets.moveToField")}
            value={toLocation}
            onChange={(e) => setToLocation(e.target.value)}
            placeholder={t("fixedAssets.moveToPlaceholder")}
            required
          />
          <Input id="t-note" label={t("common.notesOptional")} value={tNote} onChange={(e) => setTNote(e.target.value)} maxLength={500} />
          {tError && <p className="rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong" role="alert">{tError}</p>}
          <Button type="submit" variant="secondary" disabled={moving} className="cursor-pointer">
            {moving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {t("fixedAssets.moveAction")}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Banknote className="h-5 w-5 text-primary" aria-hidden="true" />
          {t("fixedAssets.disposeTitle")}
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          {t("fixedAssets.disposeHint")}
        </p>
        <form onSubmit={dispose} className="space-y-3">
          <Input id="d-date" type="date" label={t("fixedAssets.disposeDateField")} value={dDate} onChange={(e) => setDDate(e.target.value)} required />
          <Input
            id="d-proceeds"
            type="number"
            step="0.01"
            min="0"
            className="text-right tabular-nums"
            label={t("fixedAssets.disposeProceedsField")}
            value={proceeds}
            onChange={(e) => setProceeds(e.target.value)}
            placeholder={t("fixedAssets.disposeProceedsPlaceholder")}
          />
          <Input id="d-note" label={t("common.notesOptional")} value={dNote} onChange={(e) => setDNote(e.target.value)} maxLength={500} />
          <p className="text-sm text-muted-foreground tabular-nums">
            {t("fixedAssets.currentBookValue")} <strong className="text-foreground">{formatCurrency(bookValue, "IDR")}</strong>
          </p>
          {gainLoss != null && (
            <p className="text-sm tabular-nums">
              {gainLoss >= 0 ? (
                <span className="text-success-strong">
                  {t("fixedAssets.disposalGain")} <strong>{formatCurrency(gainLoss, "IDR")}</strong>
                </span>
              ) : (
                <span className="text-destructive-strong">
                  {t("fixedAssets.disposalLoss")} <strong>({formatCurrency(Math.abs(gainLoss), "IDR")})</strong>
                </span>
              )}
            </p>
          )}
          {dError && <p className="rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong" role="alert">{dError}</p>}
          <Button type="submit" variant="danger" disabled={disposing} className="cursor-pointer">
            {disposing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {t("fixedAssets.disposeAction")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
