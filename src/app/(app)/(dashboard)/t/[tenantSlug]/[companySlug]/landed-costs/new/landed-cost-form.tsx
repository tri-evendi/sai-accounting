"use client";

/**
 * Menyebar biaya impor yang datang belakangan (issue #495 butir 1).
 *
 * ── TIDAK ADA SATU PUN ANGKA UANG YANG DIKETIK DI LAYAR INI ────────────────
 * Nilai yang disebar datang dari TAGIHANNYA; nilai tiap baris dari `unit_cost`
 * penerimaannya; sisa di gudang dari gerakan stoknya. Yang dilakukan pengguna
 * cuma MEMILIH: tagihan mana, penerimaan mana, dasar apa. Pola yang sama dengan
 * formulir retur (#27), dan alasannya sama — nilai yang bisa diketik adalah
 * nilai yang suatu hari berselisih dengan dokumen yang dirujuknya.
 *
 * ── PRATINJAUNYA MEMAKAI MESIN YANG SAMA DENGAN YANG MENULISNYA ────────────
 * `planLandedCost` di sini adalah fungsi yang sama persis dengan yang dipanggil
 * server saat menyimpan. Bukan salinan yang "kira-kira sama": pratinjau dengan
 * rumus kedua adalah pratinjau yang suatu hari menunjukkan angka yang tidak
 * pernah masuk buku, dan itu jauh lebih buruk daripada tidak ada pratinjau.
 *
 * Server tetap menghitung ULANG saat menyimpan — saldo bisa bergerak di antara
 * melihat dan menekan Simpan, dan yang berlaku adalah saldo saat menulis.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Flex, Spin, theme, Typography } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ServerSearchableSelect } from "@/components/ui/server-searchable-select";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Textarea } from "@/components/ui/textarea";
import { Money } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";
import { planLandedCost, type AdditionalCostBasis } from "@/lib/landed-cost";
import { InfoCircleOutlined } from "@ant-design/icons";

/** Kisi dua kolom yang runtuh jadi satu di layar sempit — pola `return-form`. */
const FIELD_MIN = 280;
const twoColumnGrid = (gap: number): React.CSSProperties => ({
  display: "grid",
  gap,
  gridTemplateColumns: `repeat(auto-fit, minmax(max(${FIELD_MIN}px, calc((100% - ${gap}px) / 2)), 1fr))`,
});

interface Candidate {
  movementId: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string | null;
  date: string;
  quantity: number;
  unitCost: number;
  value: number;
  note: string | null;
}

interface PurchaseDetail {
  id: number;
  currency: string;
  supplier: string | null;
  /** `null` = valas tanpa kurs — nilai rupiahnya belum diketahui. */
  amount: number | null;
  alreadySpread: boolean;
}

/** Satu baris pratinjau: satu BARANG, digabung dari penerimaan yang dicentang. */
interface PreviewRow {
  itemId: number;
  label: string;
  quantity: number;
  value: number;
  onHand: number;
  allocated: number;
  capitalized: number;
  expensed: number;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function LandedCostForm() {
  const router = useAppRouter();
  const { toast } = useToast();
  const t = useT();
  const { token } = theme.useToken();

  const [purchaseId, setPurchaseId] = useState("");
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [date, setDate] = useState(todayISO());
  const [basis, setBasis] = useState<AdditionalCostBasis>("value");
  const [note, setNote] = useState("");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [onHand, setOnHand] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  /** Daftar kandidat GAGAL dimuat — dibedakan dari "tidak ada kandidat". */
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPurchase = useCallback(async (id: string) => {
    setPurchase(null);
    if (!id) return;
    const res = await apiFetch(`/api/landed-costs?purchaseId=${id}`);
    if (res.ok) setPurchase(await res.json());
  }, []);

  useEffect(() => {
    loadPurchase(purchaseId);
  }, [purchaseId, loadPurchase]);

  /* Penerimaan dimuat ulang setiap kali TANGGAL berubah: `onHand` di sana
     dihitung PER TANGGAL DOKUMEN, bukan "sekarang", supaya pratinjaunya sama
     dengan yang akan ditulis server. */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    /*
     * Gagal memuat ≠ tidak ada tagihan yang bisa disebar. Kandidat kosong di
     * layar ini terbaca sebagai "biaya impornya belum masuk" — kesimpulan yang
     * membuat orang menunggu dokumen yang sebenarnya sudah ada, lalu menutup
     * bulan tanpa menyebarkan biaya yang seharusnya menempel di harga pokok.
     */
    void (async () => {
      try {
        const res = await apiFetch(`/api/landed-costs?to=${date}&asOf=${date}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!alive) return;
        setCandidates(data.candidates ?? []);
        setOnHand(data.onHand ?? {});
        setLoadFailed(false);
      } catch {
        if (!alive) return;
        setCandidates([]);
        setOnHand({});
        setLoadFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [date]);

  function toggle(movementId: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(movementId)) next.delete(movementId);
      else next.add(movementId);
      return next;
    });
  }

  /*
   * Digabung PER BARANG sebelum disebar — sama seperti di server, dan bukan
   * kerapian: satu kontainer yang memuat dua penerimaan barang yang sama akan
   * membaca `onHand` yang sama dua kali, dan menempelkan biayanya dua kali ke
   * sisa yang cuma ada satu.
   */
  const preview = useMemo(() => {
    const chosen = candidates.filter((c) => picked.has(c.movementId));
    const total = purchase?.amount ?? 0;
    if (chosen.length === 0 || total <= 0) {
      return { rows: [] as PreviewRow[], capitalized: 0, expensed: 0 };
    }

    const grouped = new Map<number, PreviewRow>();
    for (const c of chosen) {
      const found = grouped.get(c.itemId);
      if (found) {
        found.quantity = round3(found.quantity + c.quantity);
        found.value = Math.round((found.value + c.value) * 100) / 100;
      } else {
        grouped.set(c.itemId, {
          itemId: c.itemId,
          label: `${c.itemCode} · ${c.itemName}`,
          quantity: c.quantity,
          value: c.value,
          onHand: onHand[String(c.itemId)] ?? 0,
          allocated: 0,
          capitalized: 0,
          expensed: 0,
        });
      }
    }

    const rows = [...grouped.values()];
    const plan = planLandedCost(
      rows.map((r) => ({
        itemId: r.itemId,
        value: r.value,
        quantity: r.quantity,
        onHand: r.onHand,
      })),
      total,
      basis
    );
    plan.lines.forEach((split, i) => {
      rows[i].allocated = split.allocated;
      rows[i].capitalized = split.capitalized;
      rows[i].expensed = split.expensed;
    });

    return { rows, capitalized: plan.totalCapitalized, expensed: plan.totalExpensed };
  }, [candidates, picked, purchase, basis, onHand]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!purchaseId) return setError(t("landedCosts.selectPurchaseFirst"));
    if (picked.size === 0) return setError(t("landedCosts.selectReceiptsFirst"));

    setSaving(true);
    try {
      const res = await apiFetch("/api/landed-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseId: Number(purchaseId),
          date,
          basis,
          movementIds: [...picked],
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
        const first = fieldErrors ? Object.values(fieldErrors).flat().find(Boolean) : undefined;
        setError(first ?? data?.error ?? t("landedCosts.saveFailed"));
        return;
      }
      toast(t("landedCosts.saved", { number: data.number }), "success");
      router.push("/landed-costs");
      router.refresh();
    } catch {
      setError(t("landedCosts.networkFailed"));
    } finally {
      setSaving(false);
    }
  }

  const receiptColumns: SaiColumns<Candidate> = [
    {
      key: "pick",
      dataIndex: "movementId",
      title: "",
      align: "left",
      render: (_v, c) => (
        <Checkbox
          checked={picked.has(c.movementId)}
          onCheckedChange={() => toggle(c.movementId)}
          aria-label={`${c.itemCode} ${c.itemName} ${c.date}`}
        />
      ),
    },
    { key: "date", dataIndex: "date", title: t("landedCosts.colReceiptDate"), align: "left" },
    {
      key: "item",
      dataIndex: "itemName",
      title: t("landedCosts.colItem"),
      align: "left",
      render: (_v, c) => (
        <>
          {c.itemName}
          <Typography.Text type="secondary" style={{ display: "block", fontSize: token.fontSizeSM }}>
            {c.itemCode}
          </Typography.Text>
        </>
      ),
    },
    {
      key: "quantity",
      dataIndex: "quantity",
      title: t("landedCosts.colQuantity"),
      align: "right",
      /* KUANTITAS, bukan uang: desimalnya utuh, tanpa "Rp". */
      render: (_v, c) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {round3(c.quantity)}
          {c.unit ? ` ${c.unit}` : ""}
        </span>
      ),
    },
    {
      key: "value",
      dataIndex: "value",
      title: t("landedCosts.colValue"),
      align: "right",
      render: (_v, c) => <Money value={c.value} currency="IDR" />,
    },
    {
      key: "onHand",
      dataIndex: "itemId",
      title: t("landedCosts.colOnHand"),
      align: "right",
      render: (_v, c) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {round3(onHand[String(c.itemId)] ?? 0)}
        </span>
      ),
    },
  ];

  const previewColumns: SaiColumns<PreviewRow> = [
    { key: "label", dataIndex: "label", title: t("landedCosts.colItem"), align: "left" },
    {
      key: "onHand",
      dataIndex: "onHand",
      title: t("landedCosts.colOnHand"),
      align: "right",
      render: (_v, r) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {round3(r.onHand)} / {round3(r.quantity)}
        </span>
      ),
    },
    {
      key: "allocated",
      dataIndex: "allocated",
      title: t("landedCosts.colAllocated"),
      align: "right",
      render: (_v, r) => <Money value={r.allocated} currency="IDR" />,
    },
    {
      key: "capitalized",
      dataIndex: "capitalized",
      title: t("landedCosts.colCapitalized"),
      align: "right",
      render: (_v, r) => <Money value={r.capitalized} currency="IDR" />,
    },
    {
      key: "expensed",
      dataIndex: "expensed",
      title: t("landedCosts.colExpensed"),
      align: "right",
      render: (_v, r) => <Money value={r.expensed} currency="IDR" />,
    },
  ];

  return (
    <Flex vertical gap={token.marginLG} component="form" onSubmit={handleSubmit}>
      <Card>
        <CardContent>
          <div style={twoColumnGrid(token.margin)}>
            <div style={{ gridColumn: "1 / -1" }}>
              <ServerSearchableSelect
                id="purchaseId"
                label={t("landedCosts.purchaseLabel")}
                placeholder={t("landedCosts.purchasePlaceholder")}
                fetchUrl="/api/landed-costs"
                searchParam="searchPurchase"
                value={purchaseId || null}
                onChange={(v) => setPurchaseId(v ?? "")}
              />
              <Typography.Text
                type="secondary"
                style={{ display: "block", marginTop: token.marginXXS, fontSize: token.fontSizeSM }}
              >
                {t("landedCosts.purchaseHint")}
              </Typography.Text>
            </div>

            <div>
              <Input
                id="date"
                type="date"
                label={t("landedCosts.dateLabel")}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
              {/* Tanggal di sini bukan sekadar penanda: sisa barang di gudang
                  dibaca PER TANGGAL INI, jadi ia ikut menentukan berapa yang
                  menempel. Itu harus dikatakan, bukan disimpulkan sendiri. */}
              <Typography.Text
                type="secondary"
                style={{ display: "block", marginTop: token.marginXXS, fontSize: token.fontSizeSM }}
              >
                {t("landedCosts.dateHint")}
              </Typography.Text>
            </div>
            <div>
              <Select
                id="basis"
                label={t("landedCosts.basisLabel")}
                value={basis}
                onChange={(e) => setBasis(e.target.value as AdditionalCostBasis)}
                options={[
                  { value: "value", label: t("landedCosts.basisValue") },
                  { value: "weight", label: t("landedCosts.basisWeight") },
                ]}
              />
              <Typography.Text
                type="secondary"
                style={{ display: "block", marginTop: token.marginXXS, fontSize: token.fontSizeSM }}
              >
                {t("landedCosts.basisHint")}
              </Typography.Text>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <Label htmlFor="note">{t("landedCosts.noteLabel")}</Label>
              <Textarea
                id="note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          {/* Nilai yang akan disebar — DIBACA, tidak diketik. Valas tanpa kurs
              dinyatakan dengan kata, tidak pernah sebagai Rp 0. */}
          {purchase && (
            <div style={{ marginTop: token.margin }}>
              {purchase.amount == null ? (
                <Alert type="warning" showIcon message={t("common.rateMissing")} />
              ) : (
                <Typography.Text>
                  {t("landedCosts.totalAmount")}:{" "}
                  <Money
                    style={{ fontWeight: "var(--ant-font-weight-strong)" }}
                    value={purchase.amount}
                    currency="IDR"
                  />
                </Typography.Text>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            {t("landedCosts.receiptsTitle")}
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {t("landedCosts.receiptsHint")}
          </Typography.Paragraph>
          {loading ? (
            <Spin />
          ) : loadFailed ? (
            /* Kalimat yang BERBEDA dari "belum ada penerimaan": yang satu
               menyuruh menunggu dokumen, yang satu menyuruh memuat ulang. */
            <Typography.Text role="alert" style={{ color: token.colorError }}>
              {t("common.optionsLoadFailed")}
            </Typography.Text>
          ) : candidates.length === 0 ? (
            <Typography.Text type="secondary">{t("landedCosts.receiptsEmpty")}</Typography.Text>
          ) : (
            <StaticTable
              columns={receiptColumns}
              rows={candidates}
              rowKey={(c) => c.movementId}
            />
          )}
        </CardContent>
      </Card>

      {preview.rows.length > 0 && (
        <Card>
          <CardContent>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              {t("landedCosts.previewTitle")}
            </Typography.Title>
            <StaticTable
              columns={previewColumns}
              rows={preview.rows}
              rowKey={(r) => r.itemId}
            />
            <Flex gap={token.marginLG} wrap style={{ marginTop: token.margin }}>
              <Typography.Text>
                {t("landedCosts.totalCapitalized")}:{" "}
                <Money value={preview.capitalized} currency="IDR" />
              </Typography.Text>
              <Typography.Text>
                {t("landedCosts.totalExpensed")}:{" "}
                <Money value={preview.expensed} currency="IDR" />
              </Typography.Text>
            </Flex>
            {/* Batas metodenya, dinyatakan di layar tempat keputusannya diambil
                — bukan hanya di kepala berkas yang tak dibaca penggunanya. */}
            <Flex gap={token.marginXS} align="flex-start" style={{ marginTop: token.margin }}>
              <InfoCircleOutlined aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }} />
              <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                {t("landedCosts.proportionNotice")}
              </Typography.Text>
            </Flex>
          </CardContent>
        </Card>
      )}

      {error && <Alert type="error" showIcon message={error} />}

      <Flex gap={token.marginXS} wrap>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? t("landedCosts.saving") : t("landedCosts.save")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push("/landed-costs")}>
          {t("landedCosts.cancel")}
        </Button>
      </Flex>
    </Flex>
  );
}
