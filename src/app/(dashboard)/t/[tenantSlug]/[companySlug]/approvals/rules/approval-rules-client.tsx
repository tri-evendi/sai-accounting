"use client";

/**
 * CRUD aturan persetujuan (issue #25). Form dengan label terlihat, nominal
 * tabular-nums rata kanan, status pakai badge berteks, penonaktifan lewat
 * konfirmasi — sesuai Pre-Delivery Checklist MASTER.md.
 *
 * ── Setelah migrasi AntD (issue #199) ──────────────────────────────────────
 * Tanpa kelas Tailwind: tata letak lewat `Row`/`Col`/`Flex`, jarak & ukuran
 * lewat `theme.useToken()`. Kolom nominal & status kini datang dari
 * `moneyColumn`/`Badge`, jadi aturan uang tidak lagi diketik ulang per sel.
 *
 * Perendernya `StaticTable`, bukan `DataTable`: sebuah PT punya segelintir
 * aturan persetujuan dan halaman ini menampilkan semuanya sekaligus — tak ada
 * yang perlu disortir atau dipaginasi. rc-table di sini hanya menambah pustaka
 * ke bundel tanpa imbalan (MASTER.md §Primitif Wajib: Tabel & Tombol).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Col, Flex, Row, theme, Typography } from "antd";
import { PlusOutlined, SafetyCertificateOutlined, StopOutlined } from "@ant-design/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { StaticTable } from "@/components/ui/static-table";
import { type SaiColumns } from "@/components/ui/table-columns";
import { moneyColumn } from "@/components/ui/money-column";
import { useToast } from "@/components/ui/toast";
import { ROLE_LABELS, ROLES } from "@/lib/constants";
import { APPROVAL_DOCUMENT_TYPES } from "@/lib/approvals";
import type { ApprovalRuleView } from "@/lib/approval-queue";
import { useDictionary, useT } from "@/lib/i18n/client";
import { approvalDocumentTypeLabels } from "@/lib/i18n/labels";
import { apiFetch } from "@/lib/api-fetch";

/**
 * Dua kolom yang sama lebar di layar lebar, menumpuk di bawah `lg` — bekas
 * `lg:grid-cols-[1fr_1fr]`. Angkanya titik henti `lg` milik AntD `Row`/`Col`.
 */
const HALF = { xs: 24, lg: 12 } as const;

export function ApprovalRules({
  rules,
  roles,
}: {
  rules: ApprovalRuleView[];
  roles: { key: string; label: string }[];
}) {
  const t = useT();
  const { token } = theme.useToken();
  const documentTypeLabels = approvalDocumentTypeLabels(useDictionary());
  const documentOptions = APPROVAL_DOCUMENT_TYPES.map((type) => ({
    value: type,
    label: documentTypeLabels[type],
  }));
  const router = useRouter();
  const { toast } = useToast();

  // Pilihan peran penyetuju dari DB (termasuk peran kustom).
  const roleOptions = roles.map((r) => ({ value: r.key, label: r.label }));
  const roleLabel = (key: string) =>
    roles.find((r) => r.key === key)?.label ?? ROLE_LABELS[key] ?? key;

  const [documentType, setDocumentType] = useState<string>(APPROVAL_DOCUMENT_TYPES[0]);
  const [minAmount, setMinAmount] = useState("");
  const [approverRole, setApproverRole] = useState<string>(ROLES.MANAGING_DIRECTOR);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch("/api/approvals/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType,
          minAmount: Number(minAmount),
          approverRole,
          note: note.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || t("approvals.errSaveRule"), "error");
        return;
      }
      setMinAmount("");
      setNote("");
      toast(t("approvals.ruleSaved"));
      router.refresh();
    } catch {
      toast(t("approvals.errSaveRule"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(rule: ApprovalRuleView) {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/approvals/rules/${rule.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || t("approvals.errDeactivate"), "error");
        return;
      }
      toast(t("approvals.ruleDeactivated"), "info");
      router.refresh();
    } catch {
      toast(t("approvals.errDeactivate"), "error");
    } finally {
      setBusy(false);
    }
  }

  const active = rules.filter((r) => r.isActive);

  const ruleColumns: SaiColumns<ApprovalRuleView> = [
    {
      key: "documentType",
      dataIndex: "documentTypeLabel",
      title: t("approvals.colDocumentType"),
      render: (_value, rule) => (
        <>
          <Typography.Text strong>{rule.documentTypeLabel}</Typography.Text>
          {rule.note && (
            <Typography.Text
              type="secondary"
              style={{ display: "block", fontSize: token.fontSizeSM }}
            >
              {rule.note}
            </Typography.Text>
          )}
        </>
      ),
    },
    moneyColumn<ApprovalRuleView>({
      dataIndex: "minAmount",
      title: t("approvals.colMinAmount"),
      hideCurrency: true,
    }),
    {
      key: "approverRole",
      dataIndex: "approverRole",
      title: t("approvals.colApproverRole"),
      render: (_value, rule) => (
        <Typography.Text type="secondary">{roleLabel(rule.approverRole)}</Typography.Text>
      ),
    },
    {
      key: "isActive",
      dataIndex: "isActive",
      title: t("common.status"),
      // Badge BERTEKS + ikon; warnanya penanda kedua (MASTER.md §Anti-Patterns).
      render: (_value, rule) =>
        rule.isActive ? (
          <Badge variant="success">
            <SafetyCertificateOutlined aria-hidden="true" />
            <span>{t("common.active")}</span>
          </Badge>
        ) : (
          <Badge variant="default">
            <StopOutlined aria-hidden="true" />
            <span>{t("common.inactive")}</span>
          </Badge>
        ),
    },
    {
      key: "actions",
      title: "",
      align: "right",
      render: (_value, rule) =>
        rule.isActive ? (
          // Menonaktifkan aturan mengubah siapa yang harus menyetujui uang —
          // karena itu tetap lewat ConfirmDialog bervarian danger.
          <ConfirmDialog
            title={t("approvals.deactivateTitle")}
            message={t("approvals.deactivateMessage")}
            confirmLabel={t("approvals.deactivate")}
            confirmVariant="danger"
            onConfirm={() => deactivate(rule)}
            trigger={
              <Button variant="secondary" size="sm" disabled={busy}>
                <StopOutlined aria-hidden="true" />
                {t("approvals.deactivate")}
              </Button>
            }
          />
        ) : null,
    },
  ];

  return (
    <Row gutter={[token.marginLG, token.marginLG]}>
      {/* ── Daftar aturan ── */}
      <Col {...HALF}>
        <Card>
          <CardHeader
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: token.marginSM,
            }}
          >
            <CardTitle>{t("approvals.rulesListTitle")}</CardTitle>
            <Badge variant={active.length > 0 ? "success" : "default"}>
              <span>{t("approvals.activeCount", { count: active.length })}</span>
            </Badge>
          </CardHeader>
          <CardContent style={{ padding: 0 }}>
            {rules.length === 0 ? (
              <Flex
                vertical
                align="center"
                gap={token.marginXS}
                style={{
                  paddingInline: token.paddingLG,
                  paddingBlock: token.paddingXL + token.paddingSM,
                  textAlign: "center",
                }}
              >
                <SafetyCertificateOutlined aria-hidden="true" style={{ fontSize: token.fontSizeHeading3, color: token.colorTextSecondary }} />
                <Typography.Text type="secondary">
                  {t("approvals.rulesEmptyTitle")}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  {t("approvals.rulesEmptyHint")}
                </Typography.Text>
              </Flex>
            ) : (
              <StaticTable columns={ruleColumns} rows={rules} rowKey={(rule) => rule.id} />
            )}
          </CardContent>
        </Card>
      </Col>

      {/* ── Tambah aturan ── */}
      <Col {...HALF}>
        <Card>
          <CardHeader>
            <CardTitle>{t("approvals.addRuleTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={create}>
              <Flex vertical gap={token.margin}>
                <div>
                  <Select
                    id="rule-document-type"
                    label={t("approvals.fieldDocumentType")}
                    options={documentOptions}
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                  />
                  <Typography.Text
                    type="secondary"
                    style={{
                      display: "block",
                      marginTop: token.marginXXS,
                      fontSize: token.fontSizeSM,
                    }}
                  >
                    {t("approvals.paymentHint")}
                  </Typography.Text>
                </div>

                <div>
                  <Input
                    id="rule-min-amount"
                    label={t("approvals.fieldMinAmount")}
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    required
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                  />
                  <Typography.Text
                    type="secondary"
                    style={{
                      display: "block",
                      marginTop: token.marginXXS,
                      fontSize: token.fontSizeSM,
                    }}
                  >
                    {t("approvals.minAmountHint")}
                  </Typography.Text>
                </div>

                <Select
                  id="rule-approver-role"
                  label={t("approvals.fieldApproverRole")}
                  options={roleOptions}
                  value={approverRole}
                  onChange={(e) => setApproverRole(e.target.value)}
                />

                <Flex vertical gap={token.marginXXS}>
                  <Label htmlFor="rule-note">{t("common.notesOptional")}</Label>
                  <Textarea
                    id="rule-note"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t("approvals.notePlaceholder")}
                  />
                </Flex>

                <div>
                  <Button type="submit" disabled={busy || minAmount === ""}>
                    <PlusOutlined aria-hidden="true" />
                    {t("approvals.submitRule")}
                  </Button>
                </div>
              </Flex>
            </form>
          </CardContent>
        </Card>
      </Col>
    </Row>
  );
}
