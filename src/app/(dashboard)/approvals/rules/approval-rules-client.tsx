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
import { APPROVAL_DOCUMENT_TYPES, APPROVAL_DOCUMENT_TYPE_LABELS } from "@/lib/approvals";
import type { ApprovalRuleView } from "@/lib/approval-queue";

const DOCUMENT_OPTIONS = APPROVAL_DOCUMENT_TYPES.map((t) => ({
  value: t,
  label: APPROVAL_DOCUMENT_TYPE_LABELS[t],
}));

export function ApprovalRules({
  rules,
  roles,
}: {
  rules: ApprovalRuleView[];
  roles: { key: string; label: string }[];
}) {
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
        toast(data.error || "Gagal menyimpan aturan.", "error");
        return;
      }
      setMinAmount("");
      setNote("");
      toast("Aturan tersimpan.");
      router.refresh();
    } catch {
      toast("Gagal menyimpan aturan.", "error");
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
        toast(data.error || "Gagal menonaktifkan aturan.", "error");
        return;
      }
      toast("Aturan dinonaktifkan.", "info");
      router.refresh();
    } catch {
      toast("Gagal menonaktifkan aturan.", "error");
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
          <CardTitle>Daftar Aturan</CardTitle>
          <Badge variant={active.length > 0 ? "success" : "default"}>
            {active.length} aktif
          </Badge>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {rules.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <ShieldCheck className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Belum ada aturan — semua transaksi langsung masuk jurnal seperti biasa.
              </p>
              <p className="text-xs text-muted-foreground">
                Tambahkan aturan pertama di formulir sebelah untuk mulai menyaring transaksi
                bernilai besar.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Jenis Dokumen</TableHead>
                  <TableHead className="text-right">Mulai Nilai (IDR)</TableHead>
                  <TableHead>Penyetuju</TableHead>
                  <TableHead>Status</TableHead>
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
                          Aktif
                        </Badge>
                      ) : (
                        <Badge variant="default">
                          <Ban className="mr-1 h-3 w-3" aria-hidden="true" />
                          Nonaktif
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {rule.isActive && (
                        <ConfirmDialog
                          title="Nonaktifkan aturan ini?"
                          message={
                            "Dokumen baru tidak lagi dicocokkan dengan aturan ini. Pengajuan yang " +
                            "sudah terbit tetap tercatat dan tetap harus diputuskan."
                          }
                          confirmLabel="Nonaktifkan"
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
                              Nonaktifkan
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
          <CardTitle>Tambah Aturan</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-4">
            <Select
              id="rule-document-type"
              label="Jenis dokumen"
              options={DOCUMENT_OPTIONS}
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
            />
            <p className="-mt-2 text-xs text-muted-foreground">
              “Pembayaran” mencakup pelunasan faktur, pelunasan kontrak, dan pembayaran ke
              supplier.
            </p>

            <Input
              id="rule-min-amount"
              label="Mulai nilai (IDR)"
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
              Inklusif: dokumen senilai persis angka ini tetap perlu persetujuan. Bila beberapa
              aturan cocok, yang berlaku adalah ambang tertinggi yang tercapai.
            </p>

            <Select
              id="rule-approver-role"
              label="Peran penyetuju"
              options={roleOptions}
              value={approverRole}
              onChange={(e) => setApproverRole(e.target.value)}
            />

            <div className="space-y-1">
              <label htmlFor="rule-note" className="block text-sm font-medium text-foreground">
                Catatan (opsional)
              </label>
              <Textarea
                id="rule-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contoh: kebijakan direksi per Januari 2026"
              />
            </div>

            <Button type="submit" disabled={busy || minAmount === ""} className="cursor-pointer">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Simpan Aturan
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
