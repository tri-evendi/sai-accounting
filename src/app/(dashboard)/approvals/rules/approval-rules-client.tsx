"use client";

/**
 * CRUD aturan persetujuan (issue #25). Form dengan label terlihat, nominal
 * tabular-nums rata kanan, status pakai badge berteks, penonaktifan lewat
 * konfirmasi — sesuai Pre-Delivery Checklist MASTER.md.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Plus, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoneyCell } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { ROLE_LABELS, ROLES } from "@/lib/constants";
import { APPROVAL_DOCUMENT_TYPES } from "@/lib/approvals";
import type { ApprovalRuleView } from "@/lib/approval-queue";
import { useDictionary, useT } from "@/lib/i18n/client";
import { approvalDocumentTypeLabels } from "@/lib/i18n/labels";

export function ApprovalRules({
  rules,
  roles,
}: {
  rules: ApprovalRuleView[];
  roles: { key: string; label: string }[];
}) {
  const t = useT();
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
  const [approverRole, setApproverRole] = useState<string>(ROLES.BOS);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/approvals/rules", {
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
      const res = await fetch(`/api/approvals/rules/${rule.id}`, { method: "DELETE" });
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

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* ── Daftar aturan ── */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>{t("approvals.rulesListTitle")}</CardTitle>
          <Badge variant={active.length > 0 ? "success" : "default"}>
            {t("approvals.activeCount", { count: active.length })}
          </Badge>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {rules.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <ShieldCheck className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{t("approvals.rulesEmptyTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("approvals.rulesEmptyHint")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("approvals.colDocumentType")}</TableHead>
                  <TableHead className="text-right">{t("approvals.colMinAmount")}</TableHead>
                  <TableHead>{t("approvals.colApproverRole")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium text-foreground">
                      {rule.documentTypeLabel}
                      {rule.note && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {rule.note}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="p-0">
                      <MoneyCell value={rule.minAmount} currency="IDR" hideCurrency />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {roleLabel(rule.approverRole)}
                    </TableCell>
                    <TableCell>
                      {rule.isActive ? (
                        <Badge variant="success">
                          <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" />
                          {t("common.active")}
                        </Badge>
                      ) : (
                        <Badge variant="default">
                          <Ban className="mr-1 h-3 w-3" aria-hidden="true" />
                          {t("common.inactive")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {rule.isActive && (
                        <ConfirmDialog
                          title={t("approvals.deactivateTitle")}
                          message={t("approvals.deactivateMessage")}
                          confirmLabel={t("approvals.deactivate")}
                          confirmVariant="danger"
                          onConfirm={() => deactivate(rule)}
                          trigger={
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busy}
                              className="cursor-pointer"
                            >
                              <Ban className="mr-1.5 h-4 w-4" aria-hidden="true" />
                              {t("approvals.deactivate")}
                            </Button>
                          }
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Tambah aturan ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("approvals.addRuleTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-4">
            <Select
              id="rule-document-type"
              label={t("approvals.fieldDocumentType")}
              options={documentOptions}
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
            />
            <p className="-mt-2 text-xs text-muted-foreground">
              {t("approvals.paymentHint")}
            </p>

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
              className="text-right tabular-nums"
            />
            <p className="-mt-2 text-xs text-muted-foreground">
              {t("approvals.minAmountHint")}
            </p>

            <Select
              id="rule-approver-role"
              label={t("approvals.fieldApproverRole")}
              options={roleOptions}
              value={approverRole}
              onChange={(e) => setApproverRole(e.target.value)}
            />

            <div className="space-y-1">
              <label htmlFor="rule-note" className="block text-sm font-medium text-foreground">
                {t("common.notesOptional")}
              </label>
              <Textarea
                id="rule-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("approvals.notePlaceholder")}
              />
            </div>

            <Button type="submit" disabled={busy || minAmount === ""} className="cursor-pointer">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t("approvals.submitRule")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
