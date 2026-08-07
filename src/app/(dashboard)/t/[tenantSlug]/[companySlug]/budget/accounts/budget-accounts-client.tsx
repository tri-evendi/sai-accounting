"use client";

/**
 * Anggaran Akun — add/edit form + list with delete (issue #29). Posts a plan;
 * no journal is involved, so there is no rate/currency and no posting-error path.
 *
 * Dikonversi ke token Ant Design pada issue #197. Daftarnya kini `StaticTable`
 * (#189) meski berada di dalam komponen client: perendernya dipilih menurut
 * kebutuhan INTERAKTIVITAS, dan daftar ini tidak disortir maupun disaring —
 * `DataTable` hanya akan menambah rc-table ke rute ini tanpa imbalan.
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
import type { BudgetListRow } from "@/lib/budget-report";
import { DeleteOutlined, OrderedListOutlined } from "@ant-design/icons";
import { apiFetch } from "@/lib/api-fetch";

/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;

interface AccountOption {
  id: number;
  code: string;
  name: string;
}

export function BudgetAccountsClient({
  accounts,
  budgets,
  defaultYear,
  defaultMonth,
}: {
  accounts: AccountOption[];
  budgets: BudgetListRow[];
  defaultYear: number;
  defaultMonth: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const { token } = theme.useToken();
  const months = monthNames(useDictionary());
  const period = (year: number, month: number) =>
    t("common.monthOfYear", { month: months[month - 1], year });

  const [accountId, setAccountId] = useState("");
  const [year, setYear] = useState(String(defaultYear));
  const [month, setMonth] = useState(String(defaultMonth));
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await apiFetch("/api/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: Number(accountId),
          year: Number(year),
          month: Number(month),
          amount: Number(amount),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
        const first = fieldErrors ? Object.values(fieldErrors).flat().find(Boolean) : undefined;
        setError(first ?? data?.error ?? t("budget.saveBudgetFailed"));
        return;
      }
      toast(t("budget.budgetSaved"), "success");
      setAccountId("");
      setAmount("");
      router.refresh();
    } catch {
      setError(t("budget.networkFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      const res = await apiFetch(`/api/budget/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data?.error ?? t("budget.deleteBudgetFailed"), "error");
        return;
      }
      toast(t("budget.budgetDeleted"), "success");
      router.refresh();
    } catch {
      toast(t("budget.networkFailedShort"), "error");
    } finally {
      setDeleting(null);
    }
  }

  const columns: SaiColumns<BudgetListRow> = [
    {
      key: "period",
      dataIndex: "year",
      title: t("budget.monthField"),
      align: "left",
      render: (_v, b) => period(b.year, b.month),
    },
    {
      key: "account",
      dataIndex: "accountName",
      title: t("common.account"),
      align: "left",
      render: (_v, b) => (
        <>
          <span
            style={{
              marginInlineEnd: token.marginXS,
              fontFamily: token.fontFamilyCode,
              color: token.colorTextSecondary,
            }}
          >
            {b.accountCode}
          </span>
          {b.accountName}
        </>
      ),
    },
    moneyColumn<BudgetListRow>({
      dataIndex: "amount",
      title: t("budget.colBudget"),
      sorter: false,
    }),
    {
      key: "actions",
      title: t("common.actions"),
      align: "right",
      render: (_v, b) => (
        // Menghapus anggaran mengubah angka "Realisasi vs Anggaran" yang mungkin
        // sudah dibaca orang lain, jadi dikonfirmasi dulu (issue #6).
        <ConfirmDialog
          title={t("budget.deleteBudgetTitle")}
          message={t("budget.deleteBudgetMessage", {
            code: b.accountCode,
            name: b.accountName,
            period: period(b.year, b.month),
          })}
          confirmLabel={t("budget.deleteBudgetConfirm")}
          onConfirm={() => handleDelete(b.id)}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={deleting === b.id}
              aria-label={t("budget.deleteBudgetAria", {
                code: b.accountCode,
                period: period(b.year, b.month),
              })}
            >
              {deleting === b.id ? <Spin size="small" /> : <DeleteOutlined aria-hidden="true" />}
              {t("common.delete")}
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
            {t("budget.setBudget")}
          </h2>
          <form onSubmit={handleSubmit}>
            <Row gutter={[token.margin, token.margin]}>
              <Col xs={24} sm={12}>
                <Select
                  id="budget-account"
                  label={t("common.account")}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  options={accounts.map((a) => ({
                    value: String(a.id),
                    label: `${a.code} · ${a.name}`,
                  }))}
                  placeholder={t("budget.pickAccountPlaceholder")}
                  required
                />
              </Col>
              <Col xs={24} sm={12}>
                <Input
                  id="budget-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                  label={t("budget.amountField")}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  required
                />
              </Col>
              <Col xs={24} sm={12}>
                <Select
                  id="budget-year"
                  label={t("budget.yearField")}
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
                  id="budget-month"
                  label={t("budget.monthField")}
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  options={months.map((name, i) => ({ value: String(i + 1), label: name }))}
                  required
                />
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
                  {t("budget.submitBudget")}
                </Button>
              </Col>
            </Row>
          </form>
        </div>
      </Card>

      {budgets.length === 0 ? (
        <EmptyState
          icon={<OrderedListOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
          title={t("budget.emptyBudgetTitle")}
          description={t("budget.emptyBudgetDescription")}
        />
      ) : (
        <Card>
          <StaticTable<BudgetListRow> columns={columns} rows={budgets} rowKey={(b) => b.id} />
        </Card>
      )}
    </Flex>
  );
}
