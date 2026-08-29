"use client";

/**
 * Stasiun Kerja Baru (issue #495 butir 3).
 *
 * Mesin formulirnya `useState` + `FormData`, pola yang sama dengan formulir
 * kontrak — bukan react-hook-form: isiannya empat, dan menariknya ke mesin
 * kedua hanya menambah ketergantungan tanpa menambah apa pun.
 *
 * Gayanya SEBARIS (`style={{...}}`) dengan token AntD; tanpa `className` sejak
 * issue #203.
 */
import { useState } from "react";
import { Alert, Col, Row, theme } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

/** Isian angka rata kanan + `tabular-nums` — sama dengan kolom uang. */
const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

export function NewWorkCenterForm() {
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

    const res = await apiFetch("/api/work-centers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.get("code"),
        name: form.get("name"),
        laborRate: Number(form.get("laborRate")) || 0,
        overheadRate: Number(form.get("overheadRate")) || 0,
      }),
    });

    if (!res.ok) {
      /* Tanpa `resolveSubmitFailure`: pemeta itu membagi isian menjadi bagian
         inti & lanjutan, dan formulir ini tidak punya bagian lanjutan sama
         sekali. Kalimat servernya dipakai apa adanya — pola `cost-center-form`. */
      const data = await res.json().catch(() => ({}));
      setError(data?.error || t("workCenters.saveFailed"));
      setLoading(false);
      return;
    }
    router.push("/work-centers");
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
          <CardTitle level={2}>{t("workCenters.createTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Row gutter={[token.margin, token.margin]}>
            <Col xs={24} sm={8}>
              <Input id="code" name="code" label={t("workCenters.colCode")} required />
            </Col>
            <Col xs={24} sm={16}>
              <Input id="name" name="name" label={t("common.name")} required />
            </Col>
            <Col xs={24} sm={12}>
              <Input
                id="laborRate"
                name="laborRate"
                type="number"
                step="0.01"
                min="0"
                style={numberStyle}
                label={t("workCenters.colLabor")}
                defaultValue="0"
              />
            </Col>
            <Col xs={24} sm={12}>
              <Input
                id="overheadRate"
                name="overheadRate"
                type="number"
                step="0.01"
                min="0"
                style={numberStyle}
                label={t("workCenters.colOverhead")}
                defaultValue="0"
              />
            </Col>
          </Row>
          <p
            style={{
              margin: 0,
              marginTop: token.marginXS,
              fontSize: token.fontSizeSM,
              color: token.colorTextSecondary,
            }}
          >
            {t("workCenters.rateHint")}
          </p>
        </CardContent>
      </Card>
      <Button type="submit" variant="primary" disabled={loading}>
        {loading ? t("common.saving") : t("common.save")}
      </Button>
    </form>
  );
}
