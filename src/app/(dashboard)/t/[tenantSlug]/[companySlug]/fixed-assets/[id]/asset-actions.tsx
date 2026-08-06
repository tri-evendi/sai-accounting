"use client";

/**
 * Pelepasan & pindah lokasi aset (issue #28).
 *
 * Disposal posts the removal + laba/rugi pelepasan journal; the gain/loss is
 * previewed live against the current book value. A move posts no journal.
 *
 * Dikonversi ke token Ant Design pada issue #197. Pratinjau laba/rugi kini
 * lewat `Money signed`: tandanya (+/−) dan katanya ("Laba"/"Rugi") yang
 * membedakan arah — warna hanya saluran ketiga.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Flex, Spin, theme, Typography } from "antd";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { ArrowRightLeft, Banknote } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

/** Dua kartu berdampingan di layar lebar, menumpuk di bawah ~2×320px. */
const PANEL_BASIS = 320;

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
  const { token } = theme.useToken();

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
      const res = await apiFetch(`/api/fixed-assets/${assetId}/dispose`, {
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
      const res = await apiFetch(`/api/fixed-assets/${assetId}/transfer`, {
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

  const panelStyle: React.CSSProperties = { padding: token.paddingLG };
  const headingStyle: React.CSSProperties = {
    margin: 0,
    display: "flex",
    alignItems: "center",
    gap: token.marginXS,
    fontSize: token.fontSizeLG,
    fontWeight: token.fontWeightStrong,
  };
  const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

  return (
    <div
      style={{
        display: "grid",
        gap: token.margin,
        gridTemplateColumns: `repeat(auto-fit, minmax(${PANEL_BASIS}px, 1fr))`,
      }}
    >
      <Card>
        <div style={panelStyle}>
          <h2 style={headingStyle}>
            <ArrowRightLeft size={token.fontSizeHeading5} aria-hidden="true" />
            {t("fixedAssets.moveTitle")}
          </h2>
          <Typography.Paragraph
            type="secondary"
            style={{ marginTop: token.marginXXS, marginBottom: token.margin, fontSize: token.fontSizeSM }}
          >
            {t("fixedAssets.moveHint")}
          </Typography.Paragraph>
          <form onSubmit={transfer}>
            <Flex vertical gap={token.marginSM}>
              <Input
                id="t-date"
                type="date"
                label={t("common.date")}
                value={tDate}
                onChange={(e) => setTDate(e.target.value)}
                required
              />
              <Input
                id="t-loc"
                label={t("fixedAssets.moveToField")}
                value={toLocation}
                onChange={(e) => setToLocation(e.target.value)}
                placeholder={t("fixedAssets.moveToPlaceholder")}
                required
              />
              <Input
                id="t-note"
                label={t("common.notesOptional")}
                value={tNote}
                onChange={(e) => setTNote(e.target.value)}
                maxLength={500}
              />
              {tError && (
                <div role="alert">
                  <Alert type="error" showIcon message={tError} />
                </div>
              )}
              <div>
                <Button type="submit" variant="secondary" disabled={moving}>
                  {moving && <Spin size="small" />}
                  {t("fixedAssets.moveAction")}
                </Button>
              </div>
            </Flex>
          </form>
        </div>
      </Card>

      <Card>
        <div style={panelStyle}>
          <h2 style={headingStyle}>
            <Banknote size={token.fontSizeHeading5} aria-hidden="true" />
            {t("fixedAssets.disposeTitle")}
          </h2>
          <Typography.Paragraph
            type="secondary"
            style={{ marginTop: token.marginXXS, marginBottom: token.margin, fontSize: token.fontSizeSM }}
          >
            {t("fixedAssets.disposeHint")}
          </Typography.Paragraph>
          <form onSubmit={dispose}>
            <Flex vertical gap={token.marginSM}>
              <Input
                id="d-date"
                type="date"
                label={t("fixedAssets.disposeDateField")}
                value={dDate}
                onChange={(e) => setDDate(e.target.value)}
                required
              />
              <Input
                id="d-proceeds"
                type="number"
                step="0.01"
                min="0"
                style={numberStyle}
                label={t("fixedAssets.disposeProceedsField")}
                value={proceeds}
                onChange={(e) => setProceeds(e.target.value)}
                placeholder={t("fixedAssets.disposeProceedsPlaceholder")}
              />
              <Input
                id="d-note"
                label={t("common.notesOptional")}
                value={dNote}
                onChange={(e) => setDNote(e.target.value)}
                maxLength={500}
              />
              <Typography.Paragraph style={{ margin: 0 }}>
                <Typography.Text type="secondary">
                  {t("fixedAssets.currentBookValue")}{" "}
                </Typography.Text>
                <Money
                  value={bookValue}
                  currency="IDR"
                  style={{ fontWeight: token.fontWeightStrong }}
                />
              </Typography.Paragraph>
              {/* Hasil pelepasan belum diisi = belum ada laba/rugi untuk
                  dinyatakan; barisnya tidak muncul, dan tidak pernah "Rp 0". */}
              {gainLoss != null && (
                <Typography.Paragraph style={{ margin: 0 }}>
                  <Typography.Text>
                    {gainLoss >= 0
                      ? t("fixedAssets.disposalGain")
                      : t("fixedAssets.disposalLoss")}{" "}
                  </Typography.Text>
                  <Money
                    value={gainLoss}
                    currency="IDR"
                    signed
                    style={{ fontWeight: token.fontWeightStrong }}
                  />
                </Typography.Paragraph>
              )}
              {dError && (
                <div role="alert">
                  <Alert type="error" showIcon message={dError} />
                </div>
              )}
              <div>
                <Button type="submit" variant="danger" disabled={disposing}>
                  {disposing && <Spin size="small" />}
                  {t("fixedAssets.disposeAction")}
                </Button>
              </div>
            </Flex>
          </form>
        </div>
      </Card>
    </div>
  );
}
