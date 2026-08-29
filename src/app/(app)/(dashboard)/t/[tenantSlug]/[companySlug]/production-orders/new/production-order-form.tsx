"use client";

/**
 * Perintah Produksi Baru (issue #495 butir 3).
 *
 * Membuat DRAF saja — tidak menyentuh stok maupun buku besar. Yang menulis
 * adalah dua tindakan di halaman detail (Terbitkan & Selesaikan), dan
 * memisahkannya disengaja: sebuah draf boleh salah dan dibuang, sementara
 * menerbitkan mengeluarkan barang dari gudang.
 */
import { useState } from "react";
import { Alert, Col, Row, theme, Typography } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

export function NewProductionOrderForm({
  boms,
}: {
  boms: { id: number; code: string; label: string }[];
}) {
  const router = useAppRouter();
  const t = useT();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const res = await apiFetch("/api/production-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bomId: Number(form.get("bomId")) || 0,
        date: form.get("date"),
        plannedQuantity: Number(form.get("plannedQuantity")) || 0,
        notes: form.get("notes") || undefined,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || t("productionOrders.saveFailed"));
      setLoading(false);
      return;
    }
    const created = await res.json();
    router.push(`/production-orders/${created.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div role="alert" style={{ marginBottom: token.margin }}>
          <Alert type="error" showIcon message={error} />
        </div>
      )}
      <Card style={{ marginBottom: token.marginLG }}>
        <CardHeader>
          <CardTitle level={2}>{t("productionOrders.createTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Row gutter={[token.margin, token.margin]}>
            <Col xs={24} sm={14}>
              <Select
                id="bomId"
                name="bomId"
                label={t("boms.title")}
                options={boms.map((b) => ({ value: String(b.id), label: b.label }))}
                required
              />
            </Col>
            <Col xs={24} sm={10}>
              <Input
                id="plannedQuantity"
                name="plannedQuantity"
                type="number"
                step="0.001"
                min="0"
                style={numberStyle}
                label={t("productionOrders.colPlanned")}
                required
              />
            </Col>
            <Col xs={24} sm={10}>
              <Input id="date" name="date" type="date" label={t("common.date")} required />
            </Col>
            <Col xs={24} sm={14}>
              <Input id="notes" name="notes" label={t("common.notes")} />
            </Col>
          </Row>
          <Typography.Text
            type="secondary"
            style={{ display: "block", marginTop: token.marginXS, fontSize: token.fontSizeSM }}
          >
            {t("productionOrders.releaseHint")}
          </Typography.Text>
        </CardContent>
      </Card>
      <Button type="submit" variant="primary" disabled={loading}>
        {loading ? t("common.saving") : t("common.save")}
      </Button>
    </form>
  );
}
