"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input, TextInput } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CurrencyRateFields,
  currencyRatePayload,
} from "@/components/shared/currency-rate-fields";
import { ConsigneeSelect } from "@/components/shared/consignee-select";
import { Trash2, Plus } from "lucide-react";
import { PageLoader } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";
import { DueDateField } from "@/components/shared/due-date-field";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

interface ContractItem {
  itemName: string;
  bags: number;
  kgPerBag: number;
  pricePerKg: number;
}

interface ContractData {
  id: number;
  contractNo: string;
  date: string;
  dueDate: string | null;
  buyer: string;
  consignee: string | null;
  consigneeId: number | null;
  consigneeRef: { id: number; name: string; country: string | null; contact: string | null } | null;
  packaging: string | null;
  shipment: string | null;
  top1: string | null;
  top2: string | null;
  currency: string;
  /** Stored since issue #36; null on contracts created before migration 0008. */
  rate: string | number | null;
  status: string;
  items: ContractItem[];
}

export function EditContractForm() {
  const router = useAppRouter();
  const params = useParams();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [contract, setContract] = useState<ContractData | null>(null);
  const [items, setItems] = useState<ContractItem[]>([]);
  // Prefilled from the contract itself since issue #36 — an edit no longer has to
  // re-enter the rate. Legacy contracts stored none, so theirs comes up blank and
  // must be filled before the repost can value the journal.
  const [currency, setCurrency] = useState("USD");
  const [rate, setRate] = useState("");
  // Master consignee link (issue #22); prefilled from the contract, free text kept.
  const [consigneeId, setConsigneeId] = useState<number | null>(null);

  useEffect(() => {
    apiFetch(`/api/contracts/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error(t("contracts.loadFailed"));
        return res.json();
      })
      .then((data) => {
        setContract(data);
        setCurrency(data.currency);
        setRate(data.rate == null ? "" : String(data.rate));
        setConsigneeId(data.consigneeId ?? null);
        setItems(
          data.items.map((item: ContractItem & { id?: number }) => ({
            itemName: item.itemName,
            bags: Number(item.bags),
            kgPerBag: Number(item.kgPerBag),
            pricePerKg: Number(item.pricePerKg),
          }))
        );
        setFetching(false);
      })
      .catch((err) => {
        setError(err.message);
        setFetching(false);
      });
  }, [params.id, t]);

  function addItem() {
    setItems([...items, { itemName: "", bags: 0, kgPerBag: 0, pricePerKg: 0 }]);
  }

  function removeItem(index: number) {
    if (items.length > 1) setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof ContractItem, value: string | number) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const body = {
      contractNo: formData.get("contractNo"),
      date: formData.get("date"),
      dueDate: formData.get("dueDate"),
      buyer: formData.get("buyer"),
      consignee: formData.get("consignee"),
      consigneeId,
      packaging: formData.get("packaging"),
      shipment: formData.get("shipment"),
      top1: formData.get("top1"),
      top2: formData.get("top2"),
      ...currencyRatePayload(currency, rate),
      status: formData.get("status"),
      items,
    };

    const res = await apiFetch(`/api/contracts/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      const fieldMsg = data.details?.fieldErrors
        ? Object.values(data.details.fieldErrors).flat().filter(Boolean)[0]
        : null;
      setError(String(fieldMsg || data.error || t("contracts.updateFailed")));
      setLoading(false);
    } else {
      router.push(`/contracts/${params.id}`);
      router.refresh();
    }
  }

  if (fetching) {
    return <PageLoader message={t("contracts.loadingContract")} />;
  }

  if (!contract) {
    return <div className="text-destructive">{t("contracts.notFound")}</div>;
  }

  const dateStr = new Date(contract.date).toISOString().split("T")[0];
  // Blank when null — an unknown due date must not default to the document date.
  const dueDateStr = contract.dueDate ? new Date(contract.dueDate).toISOString().split("T")[0] : "";

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: t("contracts.breadcrumb"), href: "/contracts" },
          { label: t("contracts.editTitle", { no: contract.contractNo }) },
        ]}
        title={t("contracts.editTitle", { no: contract.contractNo })}
      />

      {error && (
        <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader><CardTitle>{t("contracts.detailsTitle")}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="contractNo" name="contractNo" label={t("contracts.contractNo")} defaultValue={contract.contractNo} required />
              <Input id="date" name="date" type="date" label={t("contracts.contractDate")} defaultValue={dateStr} required />
              <DueDateField defaultValue={dueDateStr} />
              <Input id="buyer" name="buyer" label={t("contracts.buyerField")} defaultValue={contract.buyer} required />
              <ConsigneeSelect
                consigneeId={consigneeId}
                onConsigneeIdChange={setConsigneeId}
                defaultText={contract.consignee || ""}
                current={contract.consigneeRef}
              />
              <Input id="packaging" name="packaging" label={t("contracts.packaging")} defaultValue={contract.packaging || ""} />
              <Input id="shipment" name="shipment" label={t("contracts.shipment")} defaultValue={contract.shipment || ""} />
              <Input id="top1" name="top1" label={t("contracts.top1")} defaultValue={contract.top1 || ""} />
              <Input id="top2" name="top2" label={t("contracts.top2")} defaultValue={contract.top2 || ""} />
              <CurrencyRateFields
                currency={currency}
                rate={rate}
                onCurrencyChange={setCurrency}
                onRateChange={setRate}
                currencyLabel={t("common.currency")}
                rateHint={t("contracts.rateHintEdit")}
              />
              <Select
                id="status" name="status" label={t("common.status")}
                defaultValue={contract.status}
                options={[
                  { value: "pending", label: t("status.contract.pending") },
                  { value: "signed", label: t("status.contract.signed") },
                  { value: "canceled", label: t("status.contract.canceled") },
                ]}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("contracts.goodsTitle")}</CardTitle>
              <Button type="button" variant="secondary" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" /> {t("common.addItem")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {items.map((item, i) => (
                <div key={i} className="flex items-end gap-3 rounded-md border border-border p-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">{t("common.itemName")}</label>
                    <TextInput className="w-full" value={item.itemName} onChange={(e) => updateItem(i, "itemName", e.target.value)} required />
                  </div>
                  <div className="w-20">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">{t("common.bags")}</label>
                    <TextInput type="number" className="w-full" value={item.bags} onChange={(e) => updateItem(i, "bags", Number(e.target.value))} />
                  </div>
                  <div className="w-24">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">{t("common.kgPerBag")}</label>
                    <TextInput type="number" step="0.01" className="w-full" value={item.kgPerBag} onChange={(e) => updateItem(i, "kgPerBag", Number(e.target.value))} />
                  </div>
                  <div className="w-28">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">{t("contracts.pricePerKg")}</label>
                    <TextInput type="number" step="0.01" className="w-full" value={item.pricePerKg} onChange={(e) => updateItem(i, "pricePerKg", Number(e.target.value))} />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(i)}
                    aria-label={t("common.removeItemRow", { n: i + 1 })}
                    className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>{loading ? t("common.saving") : t("common.saveChanges")}</Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>{t("common.cancel")}</Button>
        </div>
      </form>
    </div>
  );
}
