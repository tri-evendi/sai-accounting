"use client";

/**
 * Dua tindakan yang MENULIS KE BUKU BESAR (issue #495 butir 3).
 *
 * Keduanya dipisah, dan itu bukan tata letak melainkan arti: menerbitkan
 * MENGELUARKAN bahan dari gudang; menyelesaikan memindahkan seluruh isi Barang
 * Dalam Proses ke barang jadi. Di lantai produksi keduanya berjarak hari.
 *
 * Jam sungguhan diketik SAAT MENYELESAIKAN, bukan saat menerbitkan: pada saat
 * bahan turun, belum ada yang tahu berapa lama pekerjaannya.
 */
import { useState } from "react";
import { Alert, theme, Typography } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

export interface OperasiRingkas {
  id: number;
  sequence: number;
  name: string;
  standardHours: number;
  actualHours: number | null;
}

const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

export function ProductionOrderActions({
  orderId,
  status,
  operations,
}: {
  orderId: number;
  status: string;
  operations: OperasiRingkas[];
}) {
  const router = useAppRouter();
  const t = useT();
  const { token } = theme.useToken();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [produced, setProduced] = useState("");
  const [jam, setJam] = useState<Record<number, string>>(() =>
    Object.fromEntries(operations.map((o) => [o.id, String(o.standardHours)]))
  );

  async function kirim(url: string, body: unknown, gagal: string) {
    setError("");
    setBusy(true);
    const res = await apiFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || gagal);
      setBusy(false);
      return;
    }
    setBusy(false);
    router.refresh();
  }

  if (status === "finished" || status === "canceled") return null;

  return (
    <Card style={{ marginBottom: token.marginLG }}>
      <CardHeader>
        <CardTitle level={2}>
          {status === "draft" ? t("productionOrders.release") : t("productionOrders.finish")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div role="alert" style={{ marginBottom: token.margin }}>
            <Alert type="error" showIcon message={error} />
          </div>
        )}

        {status === "draft" ? (
          <>
            <Typography.Paragraph type="secondary" style={{ fontSize: token.fontSizeSM }}>
              {t("productionOrders.releaseHint")}
            </Typography.Paragraph>
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              onClick={() =>
                kirim(
                  `/api/production-orders/${orderId}/release`,
                  undefined,
                  t("productionOrders.releaseFailed")
                )
              }
            >
              {busy ? t("common.saving") : t("productionOrders.release")}
            </Button>
          </>
        ) : (
          <>
            <Typography.Paragraph type="secondary" style={{ fontSize: token.fontSizeSM }}>
              {t("productionOrders.finishHint")}
            </Typography.Paragraph>
            <div style={{ display: "grid", gap: token.marginXS, maxWidth: 420 }}>
              <Input
                id="producedQuantity"
                type="number"
                step="0.001"
                min="0"
                style={numberStyle}
                label={t("productionOrders.producedLabel")}
                value={produced}
                onChange={(e) => setProduced(e.target.value)}
                required
              />
              {operations.map((op) => (
                <Input
                  key={op.id}
                  id={`jam-${op.id}`}
                  type="number"
                  step="0.001"
                  min="0"
                  style={numberStyle}
                  label={`${op.sequence}. ${op.name} — ${t("productionOrders.actualHours")}`}
                  value={jam[op.id] ?? ""}
                  onChange={(e) => setJam((j) => ({ ...j, [op.id]: e.target.value }))}
                />
              ))}
            </div>
            <Button
              type="button"
              variant="primary"
              style={{ marginTop: token.margin }}
              disabled={busy || !produced}
              onClick={() =>
                kirim(
                  `/api/production-orders/${orderId}/finish`,
                  {
                    producedQuantity: Number(produced) || 0,
                    operations: operations.map((op) => ({
                      id: op.id,
                      actualHours: Number(jam[op.id]) || 0,
                    })),
                  },
                  t("productionOrders.finishFailed")
                )
              }
            >
              {busy ? t("common.saving") : t("productionOrders.finish")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
