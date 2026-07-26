"use client";

/**
 * Antrean & keputusan persetujuan (issue #25).
 *
 * MASTER.md: status selalu badge BERTEKS (bukan warna saja), nominal
 * `tabular-nums` rata kanan dengan mata uang eksplisit, ikon lucide (tanpa
 * emoji), aksi destruktif merah + konfirmasi, empty state bermakna.
 *
 * Nilai ditampilkan dua kali dan itu disengaja: dalam mata uang dokumen (yang
 * ditandatangani orang) dan dalam IDR base (yang diadu dengan ambang). Tanpa
 * keduanya, sebuah faktur USD terlihat seolah jauh di bawah ambang rupiah.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Inbox,
  MailOpen,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, moneyColumn } from "@/components/ui/data-table";
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
import { formatCurrency, formatDate } from "@/lib/utils";
import { wasResubmitted } from "@/lib/approvals";
import type { SystemRole } from "@/lib/constants";
import type { ApprovalRequestView } from "@/lib/approval-queue";
import { useDictionary, useT, type TranslateFn } from "@/lib/i18n/client";
import { roleLabels } from "@/lib/i18n/labels";
import type { ColumnDef } from "@tanstack/react-table";

/** Badge per status — ikon + teks, tak pernah warna saja (MASTER.md §2). */
function StatusBadge({ status, label }: { status: string; label: string }) {
  if (status === "approved") {
    return (
      <Badge variant="success">
        <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
        {label}
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge variant="danger">
        <XCircle className="mr-1 h-3 w-3" aria-hidden="true" />
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="warning">
      <ClipboardCheck className="mr-1 h-3 w-3" aria-hidden="true" />
      {label}
    </Badge>
  );
}

function Money({ value, currency }: { value: number; currency: string }) {
  return (
    <span className="tabular-nums">{formatCurrency(value, currency)}</span>
  );
}

/** Judul baris: jenis dokumen + nomor, dengan tautan bila dokumennya punya halaman. */
function DocumentTitle({ row }: { row: ApprovalRequestView }) {
  const text = `${row.documentTypeLabel}${row.documentNo ? ` ${row.documentNo}` : ""}`;
  if (!row.documentHref) return <span className="font-medium text-foreground">{text}</span>;
  return (
    <Link
      href={row.documentHref}
      className="inline-flex cursor-pointer items-center gap-1 font-medium text-primary transition-colors duration-150 hover:text-primary"
    >
      {text}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

function ValueCell({ row, t }: { row: ApprovalRequestView; t: TranslateFn }) {
  return (
    <div className="text-right">
      <p className="font-semibold text-foreground">
        <Money value={row.amount} currency={row.currency} />
      </p>
      {row.currency !== "IDR" && (
        <p className="text-xs text-muted-foreground">
          {t("approvals.valueEquivalent")} <Money value={row.baseAmount} currency="IDR" />
          {row.rate
            ? ` ${t("approvals.valueRate", { rate: row.rate.toLocaleString("id-ID") })}`
            : ""}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {t("approvals.valueThreshold")} <Money value={row.thresholdAmount} currency="IDR" />
      </p>
    </div>
  );
}

interface Props {
  inbox: ApprovalRequestView[];
  mine: ApprovalRequestView[];
  decided: ApprovalRequestView[];
  currentUserId: number;
}

export function ApprovalQueue({ inbox, mine, decided, currentUserId }: Props) {
  const t = useT();
  const dictionary = useDictionary();
  const router = useRouter();
  const { toast } = useToast();
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  /**
   * Kolom riwayat keputusan. `moneyColumn` menyumbang seluruh aturan uang
   * (rata kanan, tabular-nums, id-ID, negatif merah) — `hideCurrency` dipakai
   * karena mata uangnya sudah dinyatakan sekali di judul kolom, jadi tidak
   * diulang di tiap baris.
   */
  const decidedColumns = useMemo<ColumnDef<ApprovalRequestView>[]>(
    () => [
      {
        accessorKey: "documentNo",
        header: t("common.document"),
        cell: ({ row }) => (
          <>
            <DocumentTitle row={row.original} />
            <p className="text-xs text-muted-foreground">
              {t("approvals.approverPrefix", {
                role:
                  roleLabels(dictionary)[row.original.approverRole as SystemRole] ??
                  row.original.approverRole,
              })}
            </p>
          </>
        ),
      },
      { accessorKey: "requestedByName", header: t("approvals.colRequester") },
      moneyColumn<ApprovalRequestView>({
        accessorKey: "baseAmount",
        header: t("approvals.colValueIdr"),
        hideCurrency: true,
      }),
      {
        accessorKey: "status",
        header: t("common.status"),
        cell: ({ row }) => (
          <StatusBadge status={row.original.status} label={row.original.statusLabel} />
        ),
      },
      {
        accessorKey: "decidedAt",
        header: t("approvals.colDecidedAt"),
        cell: ({ row }) => (
          <div className="text-muted-foreground">
            <span className="block whitespace-nowrap tabular-nums">
              {row.original.decidedAt ? formatDate(row.original.decidedAt) : "—"}
            </span>
            {row.original.decisionNote && (
              <span className="block text-xs text-muted-foreground">
                “{row.original.decisionNote}”
              </span>
            )}
          </div>
        ),
      },
    ],
    [t, dictionary]
  );

  async function decide(row: ApprovalRequestView, decision: "approve" | "reject") {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/approvals/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: notes[row.id]?.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || t("approvals.errDecision"), "error");
        return;
      }
      toast(
        decision === "approve"
          ? data.journalId
            ? t("approvals.approvedWithJournal")
            : t("approvals.approvedNoJournal")
          : t("approvals.rejectedToast"),
        decision === "approve" ? "success" : "info"
      );
      setNotes((prev) => ({ ...prev, [row.id]: "" }));
      router.refresh();
    } catch {
      toast(t("approvals.errDecision"), "error");
    } finally {
      setBusyId(null);
    }
  }

  /** Mengajukan ulang dokumen yang ditolak setelah diperbaiki (issue #44). */
  async function resubmit(row: ApprovalRequestView) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/approvals/${row.id}/resubmit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: notes[row.id]?.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || t("approvals.errResubmit"), "error");
        return;
      }
      toast(data.message || t("approvals.resubmitted"), "success");
      setNotes((prev) => ({ ...prev, [row.id]: "" }));
      router.refresh();
    } catch {
      toast(t("approvals.errResubmit"), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function markRead(row: ApprovalRequestView) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/approvals/${row.id}`, { method: "PATCH" });
      if (!res.ok) {
        toast(t("approvals.errMarkRead"), "error");
        return;
      }
      router.refresh();
    } catch {
      toast(t("approvals.errMarkRead"), "error");
    } finally {
      setBusyId(null);
    }
  }

  const unread = mine.filter(
    (r) => (r.status === "approved" || r.status === "rejected") && r.readAt === null
  );

  return (
    <div className="space-y-6">
      {/* ── Antrean penyetuju ── */}
      <Card data-tour="persetujuan-antrean">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>{t("approvals.inboxTitle")}</CardTitle>
          <Badge variant={inbox.length > 0 ? "warning" : "default"}>
            {t("approvals.docCount", { count: inbox.length })}
          </Badge>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {inbox.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{t("approvals.inboxEmpty")}</p>
              <p className="text-xs text-muted-foreground">
                {t("approvals.inboxEmptyHint")}{" "}
                <Link
                  href="/approvals/rules"
                  className="cursor-pointer text-primary underline transition-colors duration-150 hover:text-primary"
                >
                  {t("nav.items.approvalRules")}
                </Link>
                {t("common.fullStop")}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {inbox.map((row) => (
                <li key={row.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <DocumentTitle row={row} />
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("approvals.submittedBy", {
                          name: row.requestedByName,
                          date: formatDate(row.createdAt),
                        })}
                      </p>
                      {row.requestNote && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("approvals.requestNote", { note: row.requestNote })}
                        </p>
                      )}
                      {/* issue #44 — pengajuan ULANG: penyetuju harus tahu bahwa
                          dokumen ini pernah ditolak dan atas alasan apa, kalau
                          tidak ia menimbangnya seolah-olah baru pertama datang.
                          Ditandai teks + ikon, tidak pernah warna-saja. */}
                      {wasResubmitted(row) && (
                        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-warning-soft px-2.5 py-1.5 text-sm text-warning-strong">
                          <RotateCcw
                            className="mt-0.5 h-4 w-4 shrink-0"
                            aria-hidden="true"
                          />
                          <span>
                            <span className="font-medium">{t("approvals.resubmittedBadge")}</span>{" "}
                            {[
                              t("approvals.resubmittedPrev"),
                              row.decidedByName
                                ? t("approvals.resubmittedBy", { name: row.decidedByName })
                                : "",
                              row.decidedAt
                                ? t("approvals.resubmittedOn", {
                                    date: formatDate(row.decidedAt),
                                  })
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            {row.decisionNote
                              ? t("approvals.resubmittedNote", { note: row.decisionNote })
                              : t("common.fullStop")}
                          </span>
                        </p>
                      )}
                    </div>
                    <ValueCell row={row} t={t} />
                  </div>

                  <div className="mt-3">
                    <label
                      htmlFor={`note-${row.id}`}
                      className="mb-1 block text-sm font-medium text-foreground"
                    >
                      {t("approvals.decisionNoteLabel")}
                    </label>
                    <Textarea
                      id={`note-${row.id}`}
                      rows={2}
                      value={notes[row.id] ?? ""}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      placeholder={t("approvals.decisionNotePlaceholder")}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("approvals.decisionNoteHint")}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <ConfirmDialog
                      title={t("approvals.approveTitle")}
                      message={t("approvals.approveMessage")}
                      confirmLabel={t("approvals.approve")}
                      confirmVariant="primary"
                      onConfirm={() => decide(row, "approve")}
                      trigger={
                        <Button size="sm" disabled={busyId === row.id} className="cursor-pointer">
                          <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          {t("approvals.approve")}
                        </Button>
                      }
                    />
                    <ConfirmDialog
                      title={t("approvals.rejectTitle")}
                      message={t("approvals.rejectMessage")}
                      confirmLabel={t("approvals.reject")}
                      confirmVariant="danger"
                      onConfirm={() => decide(row, "reject")}
                      trigger={
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busyId === row.id || (notes[row.id]?.trim().length ?? 0) < 5}
                          className="cursor-pointer"
                        >
                          <XCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          {t("approvals.reject")}
                        </Button>
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Pengajuan saya (notifikasi in-app) ── */}
      <Card data-tour="persetujuan-pengajuan">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>{t("approvals.mineTitle")}</CardTitle>
          {unread.length > 0 && (
            <Badge variant="warning">
              {t("approvals.unreadBadge", { count: unread.length })}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="px-0 py-0">
          {mine.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              {t("approvals.mineEmpty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("common.document")}</TableHead>
                  <TableHead>{t("approvals.colSubmitted")}</TableHead>
                  <TableHead className="text-right">{t("approvals.colValue")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("approvals.colDecision")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mine.map((row) => {
                  const isUnread =
                    (row.status === "approved" || row.status === "rejected") &&
                    row.readAt === null;
                  return (
                    <TableRow
                      key={row.id}
                      className={isUnread ? "bg-warning-soft hover:bg-warning-soft" : undefined}
                    >
                      <TableCell>
                        <DocumentTitle row={row} />
                        <p className="text-xs text-muted-foreground">{row.message}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {formatDate(row.createdAt)}
                      </TableCell>
                      <TableCell className="p-0">
                        <MoneyCell value={row.amount} currency={row.currency} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} label={row.statusLabel} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.decidedAt ? (
                          <>
                            <span className="block whitespace-nowrap tabular-nums">
                              {formatDate(row.decidedAt)}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {t("approvals.resubmittedBy", { name: row.decidedByName ?? "" })}
                            </span>
                            {row.decisionNote && (
                              <span className="block text-xs text-muted-foreground">
                                “{row.decisionNote}”
                              </span>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-2">
                          {isUnread && row.requestedById === currentUserId && (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busyId === row.id}
                              onClick={() => markRead(row)}
                              className="cursor-pointer"
                            >
                              <MailOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />
                              {t("approvals.markRead")}
                            </Button>
                          )}
                          {/* issue #44 — dokumen yang ditolak tidak lagi buntu:
                              perbaiki dokumennya, lalu ajukan ulang di sini. */}
                          {row.status === "rejected" && (
                            <>
                              <Input
                                id={`resubmit-note-${row.id}`}
                                label={t("common.notesOptional")}
                                placeholder={t("approvals.resubmitNotePlaceholder")}
                                value={notes[row.id] ?? ""}
                                onChange={(e) =>
                                  setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))
                                }
                                className="w-56"
                              />
                              <Button
                                size="sm"
                                disabled={busyId === row.id}
                                onClick={() => resubmit(row)}
                                className="cursor-pointer"
                              >
                                <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                {t("approvals.resubmit")}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Riwayat keputusan peran ini ── */}
      {decided.length > 0 && (
        <Card data-tour="persetujuan-riwayat">
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {t("approvals.historyTitle")}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {/*
             * Satu-satunya tabel di halaman ini yang memakai DataTable, dan
             * itu disengaja: riwayat keputusan sudah termuat penuh di client,
             * dan pertanyaan yang wajar atasnya ("keputusan terbesar bulan
             * ini?") memang butuh pengurutan seketika. Tabel lain di app ini
             * dipaginasi server, jadi cukup primitif `Table`.
             */}
            <DataTable columns={decidedColumns} data={decided} pageSize={20} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
