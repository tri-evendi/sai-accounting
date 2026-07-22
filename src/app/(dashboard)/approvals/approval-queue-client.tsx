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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, moneyColumn } from "@/components/ui/data-table";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { wasResubmitted } from "@/lib/approvals";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import type { ApprovalRequestView } from "@/lib/approval-queue";
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
  if (!row.documentHref) return <span className="font-medium text-gray-900">{text}</span>;
  return (
    <Link
      href={row.documentHref}
      className="inline-flex cursor-pointer items-center gap-1 font-medium text-blue-700 transition-colors duration-150 hover:text-blue-900"
    >
      {text}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

function ValueCell({ row }: { row: ApprovalRequestView }) {
  return (
    <div className="text-right">
      <p className="font-semibold text-gray-900">
        <Money value={row.amount} currency={row.currency} />
      </p>
      {row.currency !== "IDR" && (
        <p className="text-xs text-gray-500">
          setara <Money value={row.baseAmount} currency="IDR" />
          {row.rate ? ` · kurs ${row.rate.toLocaleString("id-ID")}` : ""}
        </p>
      )}
      <p className="text-xs text-gray-500">
        ambang <Money value={row.thresholdAmount} currency="IDR" />
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
        header: "Dokumen",
        cell: ({ row }) => (
          <>
            <DocumentTitle row={row.original} />
            <p className="text-xs text-muted-foreground">
              Penyetuju:{" "}
              {ROLE_LABELS[row.original.approverRole as Role] ?? row.original.approverRole}
            </p>
          </>
        ),
      },
      { accessorKey: "requestedByName", header: "Pemohon" },
      moneyColumn<ApprovalRequestView>({
        accessorKey: "baseAmount",
        header: "Nilai (IDR)",
        hideCurrency: true,
      }),
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge status={row.original.status} label={row.original.statusLabel} />
        ),
      },
      {
        accessorKey: "decidedAt",
        header: "Diputus",
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
    []
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
        toast(data.error || "Gagal menyimpan keputusan.", "error");
        return;
      }
      toast(
        decision === "approve"
          ? data.journalId
            ? "Disetujui — jurnalnya sudah terbit."
            : "Disetujui. Dokumen ini tidak menghasilkan jurnal (nilai nol/dibatalkan)."
          : "Ditolak. Dokumen tetap tersimpan tanpa jurnal.",
        decision === "approve" ? "success" : "info"
      );
      setNotes((prev) => ({ ...prev, [row.id]: "" }));
      router.refresh();
    } catch {
      toast("Gagal menyimpan keputusan.", "error");
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
        toast(data.error || "Gagal mengajukan ulang.", "error");
        return;
      }
      toast(data.message || "Pengajuan dikirim ulang.", "success");
      setNotes((prev) => ({ ...prev, [row.id]: "" }));
      router.refresh();
    } catch {
      toast("Gagal mengajukan ulang.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function markRead(row: ApprovalRequestView) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/approvals/${row.id}`, { method: "PATCH" });
      if (!res.ok) {
        toast("Gagal menandai sudah dibaca.", "error");
        return;
      }
      router.refresh();
    } catch {
      toast("Gagal menandai sudah dibaca.", "error");
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
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Menunggu Keputusan Anda</CardTitle>
          <Badge variant={inbox.length > 0 ? "warning" : "default"}>
            {inbox.length} dokumen
          </Badge>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {inbox.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Inbox className="h-8 w-8 text-gray-300" aria-hidden="true" />
              <p className="text-sm text-gray-600">
                Tidak ada dokumen yang menunggu persetujuan Anda.
              </p>
              <p className="text-xs text-gray-500">
                Ambang dan peran penyetuju diatur di{" "}
                <Link
                  href="/approvals/rules"
                  className="cursor-pointer text-blue-700 underline transition-colors duration-150 hover:text-blue-900"
                >
                  Aturan Persetujuan
                </Link>
                .
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {inbox.map((row) => (
                <li key={row.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <DocumentTitle row={row} />
                      <p className="mt-1 text-sm text-gray-600">
                        Diajukan {row.requestedByName} · {formatDate(row.createdAt)}
                      </p>
                      {row.requestNote && (
                        <p className="mt-1 text-sm text-gray-500">
                          Catatan pemohon: {row.requestNote}
                        </p>
                      )}
                      {/* issue #44 — pengajuan ULANG: penyetuju harus tahu bahwa
                          dokumen ini pernah ditolak dan atas alasan apa, kalau
                          tidak ia menimbangnya seolah-olah baru pertama datang.
                          Ditandai teks + ikon, tidak pernah warna-saja. */}
                      {wasResubmitted(row) && (
                        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900">
                          <RotateCcw
                            className="mt-0.5 h-4 w-4 shrink-0"
                            aria-hidden="true"
                          />
                          <span>
                            <span className="font-medium">Diajukan ulang.</span> Sebelumnya
                            ditolak {row.decidedByName ? `oleh ${row.decidedByName}` : ""}
                            {row.decidedAt ? ` pada ${formatDate(row.decidedAt)}` : ""}
                            {row.decisionNote ? `: “${row.decisionNote}”` : "."}
                          </span>
                        </p>
                      )}
                    </div>
                    <ValueCell row={row} />
                  </div>

                  <div className="mt-3">
                    <label
                      htmlFor={`note-${row.id}`}
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Catatan keputusan
                    </label>
                    <textarea
                      id={`note-${row.id}`}
                      rows={2}
                      value={notes[row.id] ?? ""}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      placeholder="Contoh: harga sudah sesuai kontrak induk"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors duration-150 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Wajib diisi (minimal 5 karakter) bila menolak. Semua keputusan dicatat di
                      log audit.
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <ConfirmDialog
                      title="Setujui dokumen ini?"
                      message={
                        "Setelah disetujui, jurnalnya langsung terbit dan tercatat di buku besar. " +
                        "Membatalkannya kemudian harus lewat jurnal balik, bukan hapus."
                      }
                      confirmLabel="Setujui"
                      confirmVariant="primary"
                      onConfirm={() => decide(row, "approve")}
                      trigger={
                        <Button size="sm" disabled={busyId === row.id} className="cursor-pointer">
                          <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          Setujui
                        </Button>
                      }
                    />
                    <ConfirmDialog
                      title="Tolak dokumen ini?"
                      message={
                        "Dokumen tetap tersimpan tetapi tidak masuk jurnal. Pemohon melihat alasan " +
                        "Anda dan bisa memperbaiki lalu mengajukan ulang."
                      }
                      confirmLabel="Tolak"
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
                          Tolak
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
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Pengajuan Saya</CardTitle>
          {unread.length > 0 && (
            <Badge variant="warning">{unread.length} kabar baru</Badge>
          )}
        </CardHeader>
        <CardContent className="px-0 py-0">
          {mine.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-gray-600">
              Belum ada dokumen Anda yang butuh persetujuan.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-6 py-3 font-medium text-gray-500">Dokumen</th>
                    <th className="px-6 py-3 font-medium text-gray-500">Diajukan</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-500">Nilai</th>
                    <th className="px-6 py-3 font-medium text-gray-500">Status</th>
                    <th className="px-6 py-3 font-medium text-gray-500">Keputusan</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {mine.map((row) => {
                    const isUnread =
                      (row.status === "approved" || row.status === "rejected") &&
                      row.readAt === null;
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-gray-100 transition-colors duration-150 ${
                          isUnread ? "bg-amber-50" : "hover:bg-gray-50"
                        }`}
                      >
                        <td className="px-6 py-3">
                          <DocumentTitle row={row} />
                          <p className="text-xs text-gray-500">{row.message}</p>
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-600 tabular-nums">
                          {formatDate(row.createdAt)}
                        </td>
                        <td className="px-6 py-3 text-right text-gray-900">
                          <Money value={row.amount} currency={row.currency} />
                        </td>
                        <td className="px-6 py-3">
                          <StatusBadge status={row.status} label={row.statusLabel} />
                        </td>
                        <td className="px-6 py-3 text-gray-600">
                          {row.decidedAt ? (
                            <>
                              <span className="block whitespace-nowrap tabular-nums">
                                {formatDate(row.decidedAt)}
                              </span>
                              <span className="block text-xs text-gray-500">
                                oleh {row.decidedByName}
                              </span>
                              {row.decisionNote && (
                                <span className="block text-xs text-gray-500">
                                  “{row.decisionNote}”
                                </span>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-6 py-3 text-right">
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
                                Tandai dibaca
                              </Button>
                            )}
                            {/* issue #44 — dokumen yang ditolak tidak lagi buntu:
                                perbaiki dokumennya, lalu ajukan ulang di sini. */}
                            {row.status === "rejected" && (
                              <>
                                <Input
                                  id={`resubmit-note-${row.id}`}
                                  label="Catatan (opsional)"
                                  placeholder="Apa yang sudah diperbaiki?"
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
                                  Ajukan Ulang
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Riwayat keputusan peran ini ── */}
      {decided.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-gray-400" aria-hidden="true" />
                Riwayat Keputusan
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
