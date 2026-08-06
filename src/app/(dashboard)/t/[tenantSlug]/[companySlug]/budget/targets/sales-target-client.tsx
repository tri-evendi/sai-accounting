"use client";

/**
 * Target Penjualan — add/edit form + list with delete (issue #29). A plan; no
 * journal, no rate/currency. Customer/item are optional planning tags.
 *
 * Dikonversi ke token Ant Design pada issue #197; daftarnya `StaticTable`
 * (#189) — tidak ada sortir/filter seketika yang dibeli dengan `DataTable`.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Col, Flex, Row, Spin, theme } from "antd";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { moneyColumn } from "@/components/ui/money-column";
import { useToast } from "@/components/ui/toast";
import { useDictionary, useT } from "@/lib/i18n/client";
import { monthNames } from "@/lib/i18n/labels";
import type { SalesTargetListRow } from "@/lib/budget-report";
import { AimOutlined, DeleteOutlined } from "@ant-design/icons";
import { apiFetch } from "@/lib/api-fetch";

/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;
/** `sm:max-w-xs` lama — isian nominal tidak perlu selebar kartunya. */
const AMOUNT_MAX_WIDTH = 320;

interface NamedOption {
  id: number;
  name: string;
}

export function SalesTargetClient({
  customers,
  items,
  targets,
  defaultYear,
  defaultMonth,
}: {
  customers: NamedOption[];
  items: NamedOption[];
  targets: SalesTargetListRow[];
  defaultYear: number;
  defaultMonth: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const translate = useT();
  const { token } = theme.useToken();
  const months = monthNames(useDictionary());
  const period = (year: number, month: number) =>
    translate("common.monthOfYear", { month: months[month - 1], year });

  const [year, setYear] = useState(String(defaultYear));
  const [month, setMonth] = useState(String(defaultMonth));
  const [customerId, setCustomerId] = useState("");
  const [itemId, setItemId] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await apiFetch("/api/budget/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: Number(year),
          month: Number(month),
          customerId: customerId ? Number(customerId) : null,
          itemId: itemId ? Number(itemId) : null,
          amount: Number(amount),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
        const first = fieldErrors ? Object.values(fieldErrors).flat().find(Boolean) : undefined;
        setError(first ?? data?.error ?? translate("budget.saveTargetFailed"));
        return;
      }
      toast(translate("budget.targetSaved"), "success");
      setAmount("");
      router.refresh();
    } catch {
      setError(translate("budget.networkFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      const res = await apiFetch(`/api/budget/targets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data?.error ?? translate("budget.deleteTargetFailed"), "error");
        return;
      }
      toast(translate("budget.targetDeleted"), "success");
      router.refresh();
    } catch {
      toast(translate("budget.networkFailedShort"), "error");
    } finally {
      setDeleting(null);
    }
  }

  const columns: SaiColumns<SalesTargetListRow> = [
    {
      key: "period",
      dataIndex: "year",
      title: translate("budget.monthField"),
      align: "left",
      render: (_v, r) => period(r.year, r.month),
    },
    {
      key: "customerName",
      dataIndex: "customerName",
      title: translate("common.customer"),
      align: "left",
      // Tanpa pelanggan = target berlaku untuk SEMUA, bukan nilai yang hilang.
      render: (_v, r) => r.customerName ?? translate("common.all"),
    },
    {
      key: "itemName",
      dataIndex: "itemName",
      title: translate("budget.colCommodity"),
      align: "left",
      render: (_v, r) => r.itemName ?? translate("common.all"),
    },
    moneyColumn<SalesTargetListRow>({
      dataIndex: "amount",
      title: translate("budget.colTarget"),
      sorter: false,
    }),
    {
      key: "actions",
      title: translate("common.actions"),
      align: "right",
      render: (_v, r) => (
        <ConfirmDialog
          title={translate("budget.deleteTargetTitle")}
          message={translate("budget.deleteTargetMessage", {
            period: period(r.year, r.month),
            customer: r.customerName ?? translate("budget.allCustomersLower"),
            item: r.itemName ?? translate("budget.allItemsLower"),
          })}
          confirmLabel={translate("budget.deleteTargetConfirm")}
          onConfirm={() => handleDelete(r.id)}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={deleting === r.id}
              aria-label={translate("budget.deleteTargetAria", {
                period: period(r.year, r.month),
              })}
            >
              {deleting === r.id ? <Spin size="small" /> : <DeleteOutlined aria-hidden="true" />}
              {translate("common.delete")}
            </Button>
          }
        />
      ),
    },
  ];

  return (
    <Flex vertical gap={token.marginLG}>
      <Card>
        <div style={{ padding: token.paddingLG }}>
          <h2
            style={{
              margin: 0,
              marginBottom: token.margin,
              fontSize: token.fontSizeLG,
              fontWeight: token.fontWeightStrong,
            }}
          >
            {translate("budget.setTarget")}
          </h2>
          <form onSubmit={handleSubmit}>
            <Row gutter={[token.margin, token.margin]}>
              <Col xs={24} sm={12}>
                <Select
                  id="target-year"
                  label={translate("budget.yearField")}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  options={Array.from({ length: 6 }, (_, i) => defaultYear + 1 - i).map((y) => ({
                    value: String(y),
                    label: String(y),
                  }))}
                  required
                />
              </Col>
              <Col xs={24} sm={12}>
                <Select
                  id="target-month"
                  label={translate("budget.monthField")}
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  options={months.map((name, i) => ({ value: String(i + 1), label: name }))}
                  required
                />
              </Col>
              <Col xs={24} sm={12}>
                <Select
                  id="target-customer"
                  label={translate("budget.customerOptional")}
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  placeholder={translate("budget.allCustomers")}
                  options={[
                    { value: "", label: translate("budget.allCustomers") },
                    ...customers.map((c) => ({ value: String(c.id), label: c.name })),
                  ]}
                />
              </Col>
              <Col xs={24} sm={12}>
                <Select
                  id="target-item"
                  label={translate("budget.itemOptional")}
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  placeholder={translate("budget.allItems")}
                  options={[
                    { value: "", label: translate("budget.allItems") },
                    ...items.map((it) => ({ value: String(it.id), label: it.name })),
                  ]}
                />
              </Col>
              <Col xs={24}>
                <div style={{ maxWidth: AMOUNT_MAX_WIDTH }}>
                  <Input
                    id="target-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                    label={translate("budget.targetAmountField")}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    required
                  />
                </div>
              </Col>
              {error && (
                <Col xs={24}>
                  <div role="alert">
                    <Alert type="error" showIcon message={error} />
                  </div>
                </Col>
              )}
              <Col xs={24}>
                <Button type="submit" disabled={saving}>
                  {saving && <Spin size="small" />}
                  {translate("budget.submitTarget")}
                </Button>
              </Col>
            </Row>
          </form>
        </div>
      </Card>

      {targets.length === 0 ? (
        <EmptyState
          icon={<AimOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
          title={translate("budget.emptyTargetTitle")}
          description={translate("budget.emptyTargetDescription")}
        />
      ) : (
        <Card>
          <StaticTable<SalesTargetListRow>
            columns={columns}
            rows={targets}
            rowKey={(r) => r.id}
          />
        </Card>
      )}
    </Flex>
  );
}
