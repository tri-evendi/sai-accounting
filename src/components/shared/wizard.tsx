"use client";

/**
 * Wizard terpandu — kerangka yang dipakai bersama "Penjualan Baru" dan
 * "Pembelian Baru" (issue #5).
 *
 * Empat keputusan yang menentukan bentuk komponen ini:
 *
 *  1. **Tidak ada satu pun langkah yang menyimpan ke server.** Komponen ini
 *     hanya memindahkan langkah dan menampilkan penjaga; `onFinish` dipanggil
 *     sekali saja, di langkah terakhir. Itulah yang membuat "batal di langkah
 *     mana pun tidak menyisakan data setengah jadi" bukan sekadar niat baik.
 *
 *  2. **Maju harus lewat tombol "Lanjut".** Penanda langkah hanya bisa dipakai
 *     untuk MUNDUR (`canJumpToStep`); melompat maju lewat penanda akan melewati
 *     penjaga langkah yang sedang dibuka tanpa terlihat.
 *
 *  3. **"Lanjut" tidak pernah dimatikan diam-diam.** Tombol yang mati tanpa
 *     penjelasan adalah jalan buntu bagi staf non-akuntan. Tombolnya tetap
 *     hidup; menekannya saat masih ada yang kurang akan MENAMPILKAN daftar
 *     alasannya di `role="alert"` — persis pola yang dipakai formulir lain di
 *     app ini (`resolveSubmitFailure`).
 *
 *  4. **Status langkah tidak pernah warna saja.** Setiap langkah membawa teks
 *     "Selesai / Sedang diisi / Belum" dan ikon centang, sesuai MASTER.md.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { canJumpToStep, stepIndex, type WizardStepMeta } from "@/lib/wizard";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDot,
  Loader2,
  ShieldCheck,
} from "lucide-react";

interface WizardProps {
  steps: readonly WizardStepMeta[];
  currentId: string;
  onNavigate: (id: string) => void;
  /** Alasan langkah ini belum boleh dilanjutkan. Kosong = boleh lanjut. */
  blockers: string[];
  /** Dipanggil SEKALI di langkah terakhir — satu-satunya penulisan ke server. */
  onFinish: () => void | Promise<void>;
  /** Membuang draf dan meninggalkan wizard. Tidak menyentuh database. */
  onCancel: () => void;
  busy?: boolean;
  /** Galat dari server setelah "Selesai" ditekan. */
  error?: string | null;
  /** Catatan di atas isi langkah (mis. draf lama dibuang). */
  notice?: string | null;
  finishLabel?: string;
  children: React.ReactNode;
}

export function Wizard({
  steps,
  currentId,
  onNavigate,
  blockers,
  onFinish,
  onCancel,
  busy = false,
  error = null,
  notice = null,
  finishLabel = "Selesai & Simpan",
  children,
}: WizardProps) {
  // Daftar penjaga ditandai MILIK langkah tertentu, bukan sekadar on/off. Dengan
  // begitu berpindah langkah otomatis membersihkannya — tanpa efek yang memanggil
  // setState, yang akan memicu render berantai.
  const [blockersShownFor, setBlockersShownFor] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const index = Math.max(0, stepIndex(steps, currentId));
  const step = steps[index];
  const isLast = index === steps.length - 1;
  const showBlockers = blockersShownFor === currentId;

  function goNext() {
    if (blockers.length > 0) {
      setBlockersShownFor(currentId);
      return;
    }
    const next = steps[index + 1];
    if (next) onNavigate(next.id);
  }

  function goBack() {
    const prev = steps[index - 1];
    if (prev) onNavigate(prev.id);
  }

  function finish() {
    if (blockers.length > 0) {
      setBlockersShownFor(currentId);
      return;
    }
    void onFinish();
  }

  return (
    <div>
      {/* ── Penanda langkah ─────────────────────────────────────────────── */}
      <nav aria-label="Langkah pengisian" className="mb-6">
        <p className="mb-2 text-sm font-medium text-muted-foreground">
          Langkah <span className="tabular-nums">{index + 1}</span> dari{" "}
          <span className="tabular-nums">{steps.length}</span>
        </p>
        <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
          {steps.map((s, i) => {
            const state = i < index ? "done" : i === index ? "current" : "todo";
            const reachable = canJumpToStep(steps, s.id, currentId) && i !== index;
            const label =
              state === "done" ? "Selesai" : state === "current" ? "Sedang diisi" : "Belum";
            const content = (
              <>
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    state === "done" && "bg-success-soft text-success-strong",
                    state === "current" && "bg-primary text-white",
                    state === "todo" && "bg-muted text-muted-foreground"
                  )}
                >
                  {state === "done" ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : state === "current" ? (
                    <CircleDot className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <span className="tabular-nums">{i + 1}</span>
                  )}
                </span>
                <span className="min-w-0 text-left">
                  <span
                    className={cn(
                      "block truncate text-sm font-medium",
                      state === "current" ? "text-foreground" : "text-foreground"
                    )}
                  >
                    {s.title}
                    {s.optional && (
                      <span className="ml-1 font-normal text-muted-foreground">(opsional)</span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">{label}</span>
                </span>
              </>
            );

            return (
              <li key={s.id} className="flex-1">
                {reachable ? (
                  <button
                    type="button"
                    onClick={() => onNavigate(s.id)}
                    aria-current={undefined}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-3 py-2",
                      "transition-colors duration-150 hover:border-border hover:bg-muted",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    )}
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    aria-current={state === "current" ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2",
                      state === "current"
                        ? "border-primary bg-primary/10"
                        : "border-border bg-white"
                    )}
                  >
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ── Judul & penjelasan langkah ──────────────────────────────────── */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">{step.title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
      </div>

      {notice && (
        <p
          role="status"
          className="mb-4 flex items-start gap-2 rounded-md bg-warning-soft p-3 text-sm text-warning-strong"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div>{children}</div>

      {/* ── Penjaga langkah, muncul setelah "Lanjut" ditekan ────────────── */}
      {showBlockers && blockers.length > 0 && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-destructive/30 bg-destructive-soft p-3 text-sm text-destructive-strong"
        >
          <p className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Masih ada yang perlu dilengkapi sebelum lanjut:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-8">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Navigasi ────────────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button
          type="button"
          variant="secondary"
          className="cursor-pointer"
          onClick={goBack}
          disabled={index === 0 || busy}
        >
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" /> Kembali
        </Button>

        {isLast ? (
          <Button type="button" className="cursor-pointer" onClick={finish} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> Menyimpan…
              </>
            ) : (
              <>
                <ShieldCheck className="mr-1 h-4 w-4" aria-hidden="true" /> {finishLabel}
              </>
            )}
          </Button>
        ) : (
          <Button type="button" className="cursor-pointer" onClick={goNext} disabled={busy}>
            Lanjut <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          className="ml-auto cursor-pointer"
          onClick={() => setConfirmCancel(true)}
          disabled={busy}
        >
          Batal
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Belum ada apa pun yang tersimpan. Semua isian baru dicatat setelah tombol{" "}
        <strong>{finishLabel}</strong> di langkah terakhir ditekan.
      </p>

      <ConfirmDialog
        title="Batalkan pengisian?"
        message={
          "Draf yang sedang diisi akan dihapus dari peramban. Tidak ada data yang " +
          "tersimpan di sistem — tidak ada pelanggan, surat jalan, maupun tagihan " +
          "yang tertinggal setengah jadi."
        }
        confirmLabel="Ya, batalkan"
        confirmVariant="danger"
        cancelLabel="Lanjutkan mengisi"
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        onConfirm={onCancel}
      />
    </div>
  );
}

/** Satu baris ringkasan: label kiri, nilai kanan dengan `tabular-nums`. */
export function WizardSummaryRow({
  label,
  value,
  hint,
  strong = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="text-sm text-muted-foreground">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </dt>
      <dd
        className={cn(
          "shrink-0 text-right text-sm tabular-nums",
          strong ? "font-semibold text-foreground" : "text-foreground"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
