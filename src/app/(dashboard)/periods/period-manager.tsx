"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  LockOpen,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Spinner } from "@/components/ui/loading";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PeriodCheck, PeriodSummary } from "@/lib/period-close";

interface PeriodRow {
  year: number;
  month: number;
  label: string;
  status: string;
  closedAt: string | null;
  closedByName: string | null;
  note: string | null;
}

/** Icon + wording per check outcome — never colour on its own (MASTER.md §2). */
const CHECK_STYLES: Record<
  PeriodCheck["status"],
  { icon: typeof CheckCircle2; tone: string; label: string }
> = {
  ok: { icon: CheckCircle2, tone: "text-green-600", label: "Aman" },
  warning: { icon: AlertTriangle, tone: "text-amber-600", label: "Perlu dicek" },
  blocker: { icon: XCircle, tone: "text-red-600", label: "Harus diperbaiki" },
};

function StatusBadge({ status }: { status: string }) {
  return status === "closed" ? (
    <Badge variant="danger">
      <Lock className="mr-1 h-3 w-3" aria-hidden="true" />
      Terkunci
    </Badge>
  ) : (
    <Badge variant="success">
      <LockOpen className="mr-1 h-3 w-3" aria-hidden="true" />
      Terbuka
    </Badge>
  );
}

export function PeriodManager({ periods }: { periods: PeriodRow[] }) {
  const router = useRouter();

  const [selected, setSelected] = useState<{ year: number; month: number } | null>(
    periods[0] ? { year: periods[0].year, month: periods[0].month } : null
  );
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSummary = useCallback(async (year: number, month: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/periods/summary?year=${year}&month=${month}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Gagal memuat ringkasan periode");
        setSummary(null);
        return;
      }
      setSummary(await res.json());
    } catch {
      setError("Gagal memuat ringkasan periode");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) loadSummary(selected.year, selected.month);
  }, [selected, loadSummary]);

  async function submit(url: string, body: Record<string, unknown>, fallback: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || fallback);
        return;
      }
      setNote("");
      setReason("");
      if (selected) await loadSummary(selected.year, selected.month);
      router.refresh();
    } catch {
      setError(fallback);
    } finally {
      setBusy(false);
    }
  }

  const onClose = () =>
    submit(
      "/api/periods",
      { year: summary!.year, month: summary!.month, note: note || null },
      "Gagal menutup periode"
    );

  const onReopen = () =>
    submit(
      "/api/periods/reopen",
      { year: summary!.year, month: summary!.month, reason },
      "Gagal membuka kembali periode"
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* ── Period list ── */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Periode</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Periode</th>
                <th className="px-6 py-3 font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 font-medium text-gray-500">Ditutup</th>
                <th className="px-6 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {periods.length > 0 ? (
                periods.map((p) => {
                  const active = selected?.year === p.year && selected?.month === p.month;
                  return (
                    <tr
                      key={`${p.year}-${p.month}`}
                      className={`border-b border-gray-100 transition-colors duration-150 ${
                        active ? "bg-blue-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-6 py-3 font-medium text-gray-900">{p.label}</td>
                      <td className="px-6 py-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {p.closedAt ? (
                          <span className="tabular-nums">
                            {formatDate(p.closedAt)}
                            {p.closedByName && (
                              <span className="block text-xs text-gray-500">
                                oleh {p.closedByName}
                              </span>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Button
                          variant={active ? "primary" : "secondary"}
                          size="sm"
                          onClick={() => setSelected({ year: p.year, month: p.month })}
                          className="cursor-pointer"
                        >
                          Tinjau
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-gray-500">
                    Belum ada transaksi apa pun, jadi belum ada periode untuk ditutup.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Pre-close summary ── */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>
            {summary ? `Ringkasan ${summary.label}` : "Ringkasan Periode"}
          </CardTitle>
          {selected && (
            <button
              type="button"
              onClick={() => loadSummary(selected.year, selected.month)}
              className="cursor-pointer text-gray-400 transition-colors duration-150 hover:text-gray-700"
              aria-label="Muat ulang ringkasan"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </CardHeader>

        <CardContent>
          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {loading && (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          )}

          {!loading && !summary && !error && (
            <p className="py-10 text-center text-sm text-gray-500">
              Pilih sebuah periode di sebelah kiri untuk meninjaunya.
            </p>
          )}

          {!loading && summary && (
            <>
              <div className="mb-5 grid grid-cols-3 gap-4 border-b border-gray-100 pb-5">
                <div>
                  <p className="text-xs text-gray-500">Jumlah Jurnal</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">
                    {summary.journalCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Debit</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-gray-900">
                    {formatCurrency(summary.totalDebit, "IDR")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Kredit</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-gray-900">
                    {formatCurrency(summary.totalCredit, "IDR")}
                  </p>
                </div>
              </div>

              <ul className="space-y-3">
                {summary.checks.map((c) => {
                  const style = CHECK_STYLES[c.status];
                  const Icon = style.icon;
                  return (
                    <li key={c.id} className="flex gap-3">
                      <Icon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${style.tone}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {c.label}{" "}
                          <span className={`text-xs font-normal ${style.tone}`}>
                            · {style.label}
                          </span>
                        </p>
                        <p className="text-sm text-gray-600">{c.detail}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-6 border-t border-gray-100 pt-5">
                {summary.status === "closed" ? (
                  <>
                    <p className="mb-3 text-sm text-gray-600">
                      Periode ini terkunci
                      {summary.closedAt ? ` sejak ${formatDate(summary.closedAt)}` : ""}
                      {summary.closedByName ? ` oleh ${summary.closedByName}` : ""}.
                      {summary.note && (
                        <span className="mt-1 block text-gray-500">
                          Catatan: {summary.note}
                        </span>
                      )}
                    </p>
                    <label
                      htmlFor="reopen-reason"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Alasan buka kembali
                    </label>
                    <textarea
                      id="reopen-reason"
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Contoh: koreksi faktur SI.2026.03.00007 yang salah nominal"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Wajib diisi (minimal 5 karakter) dan dicatat di log audit.
                    </p>
                    <div className="mt-3">
                      <ConfirmDialog
                        title={`Buka Kembali ${summary.label}`}
                        message={
                          `Membuka kembali ${summary.label} membuat transaksi di bulan itu bisa diubah lagi, ` +
                          `sehingga laporan yang sudah terbit bisa ikut berubah. Tindakan ini dicatat di log audit. Lanjutkan?`
                        }
                        confirmLabel="Buka Kembali"
                        confirmVariant="danger"
                        onConfirm={onReopen}
                        trigger={
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={busy || reason.trim().length < 5}
                            className="cursor-pointer"
                          >
                            <LockOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Buka Kembali Periode
                          </Button>
                        }
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <label
                      htmlFor="close-note"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Catatan penutupan (opsional)
                    </label>
                    <textarea
                      id="close-note"
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Contoh: sudah dicocokkan dengan rekening koran"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />

                    {summary.blockerCount > 0 && (
                      <p className="mt-3 flex items-start gap-2 text-sm text-red-700">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        Perbaiki {summary.blockerCount} masalah di atas dulu — periode belum
                        bisa ditutup.
                      </p>
                    )}

                    <div className="mt-3">
                      <ConfirmDialog
                        title={`Tutup ${summary.label}`}
                        message={
                          `Setelah ditutup, transaksi bertanggal di ${summary.label} tidak bisa dibuat, ` +
                          `diubah, atau dihapus — termasuk lewat faktur, kontrak, pembayaran, dan kas. ` +
                          `Periode masih bisa dibuka kembali oleh Manager bila perlu. Tutup sekarang?`
                        }
                        confirmLabel="Tutup Periode"
                        confirmVariant="primary"
                        onConfirm={onClose}
                        trigger={
                          <Button
                            size="sm"
                            disabled={busy || !summary.canClose}
                            className="cursor-pointer"
                          >
                            <Lock className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Tutup Periode
                          </Button>
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
