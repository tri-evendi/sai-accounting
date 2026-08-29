"use client";

/**
 * Resep Produksi Baru (issue #495 butir 3).
 *
 * Mesin formulirnya `useState` + `FormData` — pola formulir kontrak, bukan
 * react-hook-form: barisnya dinamis (bahan & langkah bisa ditambah/dibuang) dan
 * dikelola sebagai array biasa, persis seperti baris barang di kontrak.
 *
 * Gaya SEBARIS dengan token AntD; tanpa `className` sejak #203.
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
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";

export interface ItemOption {
  id: number;
  code: string;
  name: string;
  unit: string | null;
}
export interface WorkCenterOption {
  id: number;
  code: string;
  name: string;
}

interface KomponenBaris {
  itemId: string;
  quantity: number;
  scrapPercent: number;
}
interface LangkahBaris {
  name: string;
  workCenterId: string;
  standardHours: number;
}

const numberStyle = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

const komponenKosong = (): KomponenBaris => ({ itemId: "", quantity: 0, scrapPercent: 0 });
const langkahKosong = (): LangkahBaris => ({ name: "", workCenterId: "", standardHours: 0 });

export function NewBomForm({
  items,
  workCenters,
}: {
  items: ItemOption[];
  workCenters: WorkCenterOption[];
}) {
  const router = useAppRouter();
  const t = useT();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [komponen, setKomponen] = useState<KomponenBaris[]>([komponenKosong()]);
  const [langkah, setLangkah] = useState<LangkahBaris[]>([]);

  const itemOptions = items.map((i) => ({ value: String(i.id), label: `${i.code} — ${i.name}` }));
  const wcOptions = workCenters.map((w) => ({ value: String(w.id), label: `${w.code} — ${w.name}` }));

  function ubahKomponen(i: number, patch: Partial<KomponenBaris>) {
    setKomponen((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function ubahLangkah(i: number, patch: Partial<LangkahBaris>) {
    setLangkah((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const res = await apiFetch("/api/boms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.get("code"),
        outputItemId: Number(form.get("outputItemId")) || 0,
        outputQuantity: Number(form.get("outputQuantity")) || 0,
        notes: form.get("notes") || undefined,
        components: komponen
          .filter((k) => k.itemId)
          .map((k) => ({
            itemId: Number(k.itemId),
            quantity: k.quantity,
            scrapPercent: k.scrapPercent,
          })),
        /* Nomor urut DITURUNKAN dari posisinya, bukan diketik: dua langkah
           bernomor sama tidak punya urutan yang bisa ditentukan, dan menyerahkan
           penomoran ke pengguna hanya menciptakan cara baru untuk salah. */
        operations: langkah
          .filter((l) => l.workCenterId && l.name.trim())
          .map((l, idx) => ({
            sequence: idx + 1,
            name: l.name,
            workCenterId: Number(l.workCenterId),
            standardHours: l.standardHours,
          })),
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || t("boms.saveFailed"));
      setLoading(false);
      return;
    }
    router.push("/boms");
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
          <CardTitle level={2}>{t("boms.outputSection")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Row gutter={[token.margin, token.margin]}>
            <Col xs={24} sm={8}>
              <Input id="code" name="code" label={t("boms.colCode")} required />
            </Col>
            <Col xs={24} sm={10}>
              <Select
                id="outputItemId"
                name="outputItemId"
                label={t("boms.colOutput")}
                options={itemOptions}
                required
              />
            </Col>
            <Col xs={24} sm={6}>
              <Input
                id="outputQuantity"
                name="outputQuantity"
                type="number"
                step="0.001"
                min="0"
                style={numberStyle}
                label={t("boms.colOutputQty")}
                required
              />
            </Col>
            <Col span={24}>
              <Input id="notes" name="notes" label={t("common.notes")} />
            </Col>
          </Row>
        </CardContent>
      </Card>

      <Card style={{ marginBottom: token.marginLG }}>
        <CardHeader>
          <CardTitle level={2}>{t("boms.componentsSection")}</CardTitle>
        </CardHeader>
        <CardContent>
          {komponen.map((k, i) => (
            <Row key={i} gutter={[token.marginXS, token.marginXS]} style={{ marginBottom: token.marginXS }}>
              <Col xs={24} sm={11}>
                <Select
                  id={`komponen-item-${i}`}
                  label={t("common.name")}
                  options={itemOptions}
                  value={k.itemId}
                  onChange={(e) => ubahKomponen(i, { itemId: e.target.value })}
                />
              </Col>
              <Col xs={12} sm={5}>
                <Input
                  id={`komponen-qty-${i}`}
                  type="number"
                  step="0.001"
                  min="0"
                  style={numberStyle}
                  label={t("boms.colQuantity")}
                  value={k.quantity || ""}
                  onChange={(e) => ubahKomponen(i, { quantity: Number(e.target.value) || 0 })}
                />
              </Col>
              <Col xs={12} sm={5}>
                <Input
                  id={`komponen-scrap-${i}`}
                  type="number"
                  step="0.01"
                  min="0"
                  max="99.99"
                  style={numberStyle}
                  label={t("boms.colScrap")}
                  value={k.scrapPercent || ""}
                  onChange={(e) => ubahKomponen(i, { scrapPercent: Number(e.target.value) || 0 })}
                />
              </Col>
              <Col xs={24} sm={3} style={{ display: "flex", alignItems: "flex-end" }}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={komponen.length === 1}
                  onClick={() => setKomponen((rows) => rows.filter((_, idx) => idx !== i))}
                  aria-label={t("common.delete")}
                >
                  <DeleteOutlined aria-hidden="true" />
                </Button>
              </Col>
            </Row>
          ))}
          <Typography.Text type="secondary" style={{ display: "block", fontSize: token.fontSizeSM }}>
            {t("boms.scrapHint")}
          </Typography.Text>
          <Button
            type="button"
            variant="secondary"
            style={{ marginTop: token.marginXS }}
            onClick={() => setKomponen((rows) => [...rows, komponenKosong()])}
          >
            <PlusOutlined aria-hidden="true" /> {t("boms.addComponent")}
          </Button>
        </CardContent>
      </Card>

      <Card style={{ marginBottom: token.marginLG }}>
        <CardHeader>
          <CardTitle level={2}>{t("boms.operationsSection")}</CardTitle>
        </CardHeader>
        <CardContent>
          {langkah.map((l, i) => (
            <Row key={i} gutter={[token.marginXS, token.marginXS]} style={{ marginBottom: token.marginXS }}>
              <Col xs={24} sm={9}>
                <Input
                  id={`langkah-nama-${i}`}
                  label={t("boms.colStep")}
                  value={l.name}
                  onChange={(e) => ubahLangkah(i, { name: e.target.value })}
                />
              </Col>
              <Col xs={24} sm={8}>
                <Select
                  id={`langkah-wc-${i}`}
                  label={t("boms.colWorkCenter")}
                  options={wcOptions}
                  value={l.workCenterId}
                  onChange={(e) => ubahLangkah(i, { workCenterId: e.target.value })}
                />
              </Col>
              <Col xs={12} sm={4}>
                <Input
                  id={`langkah-jam-${i}`}
                  type="number"
                  step="0.001"
                  min="0"
                  style={numberStyle}
                  label={t("boms.colHours")}
                  value={l.standardHours || ""}
                  onChange={(e) => ubahLangkah(i, { standardHours: Number(e.target.value) || 0 })}
                />
              </Col>
              <Col xs={12} sm={3} style={{ display: "flex", alignItems: "flex-end" }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setLangkah((rows) => rows.filter((_, idx) => idx !== i))}
                  aria-label={t("common.delete")}
                >
                  <DeleteOutlined aria-hidden="true" />
                </Button>
              </Col>
            </Row>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() => setLangkah((rows) => [...rows, langkahKosong()])}
          >
            <PlusOutlined aria-hidden="true" /> {t("boms.addOperation")}
          </Button>
        </CardContent>
      </Card>

      <Button type="submit" variant="primary" disabled={loading}>
        {loading ? t("common.saving") : t("common.save")}
      </Button>
    </form>
  );
}
