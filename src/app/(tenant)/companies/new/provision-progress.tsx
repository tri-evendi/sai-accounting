"use client";

/**
 * Kemajuan penyediaan perusahaan — daftar tahap + bilah (issue #104).
 *
 * ══ SELURUH TAHAP DITAMPILKAN SEJAK AWAL ═══════════════════════════════════
 * Versi pertama hanya mencetak tahap yang SUDAH terjadi. Bedanya besar bagi
 * yang menunggu: daftar yang tumbuh satu per satu tidak pernah memberi tahu
 * ada berapa tahap seluruhnya, jadi setiap jeda terasa seperti mungkin yang
 * terakhir — atau mungkin macet. Dengan keempat tahap tercetak sejak detik
 * pertama, menunggu berubah dari "entah sampai kapan" menjadi "tinggal dua
 * lagi", dan tahap yang gagal terlihat sebagai satu baris merah di antara
 * baris-baris yang sudah selesai.
 *
 * ══ BILAH HANYA UNTUK YANG KEMAJUANNYA SUNGGUHAN DIKETAHUI ═════════════════
 * Menerapkan skema adalah satu-satunya tahap panjang (40-an berkas), dan
 * servernya melaporkan sudah sampai berkas ke berapa. Justru di sanalah bilah
 * determinate layak dipakai. Tahap lain tidak diberi bilah — bilah yang
 * bergerak berdasarkan jadwal karangan adalah kebohongan kecil yang persis
 * merusak kepercayaan pada indikator berikutnya.
 *
 * ══ SATU PENGUMUMAN, BUKAN EMPAT PULUH ═════════════════════════════════════
 * Daftar tahapnya `aria-live="off"` DENGAN SENGAJA. Tahap migration
 * memperbarui barisnya puluhan kali; menandai daftarnya sebagai live region
 * akan membuat pembaca layar membacakan "menerapkan skema 12 dari 43" tanpa
 * henti dan menutupi segalanya. Yang diumumkan hanya PERPINDAHAN TAHAP, lewat
 * satu baris status terpisah.
 */

import { CheckCircle2, CircleDashed, Loader2, TriangleAlert } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { useT } from "@/lib/i18n/client";
import type { ProvisionPhase } from "@/lib/company-provisioning-shared";

/** Tahap yang dilalui, berurutan. `done` bukan tahap — ia keadaan akhir. */
export const PROVISION_STEPS = [
  "validate",
  "create_database",
  "migrate",
  "register",
] as const satisfies readonly ProvisionPhase[];

export type StepStatus = "pending" | "active" | "done" | "error";

export interface ProvisionState {
  /** Tahap yang sedang berjalan; `null` sebelum mulai. */
  current: ProvisionPhase | null;
  /** Tahap yang sudah selesai. */
  completed: ReadonlySet<ProvisionPhase>;
  /** Kemajuan 0–1 tahap `migrate`, bila dilaporkan. */
  migrateProgress?: number;
  /** Nama migration yang sedang diterapkan — konteks, bukan tuntutan baca. */
  detail?: string;
  failed?: boolean;
}

function statusOf(phase: ProvisionPhase, state: ProvisionState): StepStatus {
  if (state.completed.has(phase)) return "done";
  if (state.current === phase) return state.failed ? "error" : "active";
  return "pending";
}

export function ProvisionProgress({ state }: { state: ProvisionState }) {
  const t = useT();

  const labels: Record<(typeof PROVISION_STEPS)[number], string> = {
    validate: t("companies.stepValidate"),
    create_database: t("companies.stepDatabase"),
    migrate: t("companies.stepMigrate"),
    register: t("companies.stepRegister"),
  };

  const doneCount = PROVISION_STEPS.filter((p) => state.completed.has(p)).length;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{t("companies.progressTitle")}</p>
        {/* Angka rata & tabular (MASTER.md) — hitungan yang melompat lebarnya
            membuat seluruh baris ikut bergeser tiap kali bertambah. */}
        <p className="text-sm tabular-nums text-muted-foreground">
          {doneCount}/{PROVISION_STEPS.length}
        </p>
      </div>

      <ol aria-live="off" className="space-y-2.5">
        {PROVISION_STEPS.map((phase) => {
          const status = statusOf(phase, state);
          const showBar = phase === "migrate" && status === "active" && state.migrateProgress != null;

          return (
            <li key={phase} className="flex items-start gap-2.5 text-sm">
              <StepIcon status={status} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <p
                  className={
                    status === "error"
                      ? "text-destructive-strong"
                      : status === "pending"
                        ? "text-muted-foreground"
                        : "text-foreground"
                  }
                >
                  {labels[phase]}
                  {phase === "migrate" && state.migrateProgress != null && status !== "pending" && (
                    <span className="ml-1.5 tabular-nums text-muted-foreground">
                      {Math.round(state.migrateProgress * 100)}%
                    </span>
                  )}
                </p>

                {showBar && (
                  <>
                    <Progress value={state.migrateProgress!} label={labels.migrate} />
                    {state.detail && (
                      // `block` + `truncate`: nama migration bisa panjang, dan
                      // di 375px ia harus memendek — bukan menggeser tata letak.
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {state.detail}
                      </span>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Satu-satunya bagian yang DIUMUMKAN. Terpisah dari daftar supaya perpindahan
 * tahap terdengar sekali, bukan puluhan kali mengikuti berkas migration.
 */
export function ProvisionAnnouncer({ message }: { message: string | null }) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {message ?? ""}
    </p>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  const base = "mt-0.5 h-4 w-4 shrink-0";
  if (status === "done")
    return <CheckCircle2 className={`${base} text-success`} aria-hidden="true" />;
  if (status === "error")
    return <TriangleAlert className={`${base} text-destructive`} aria-hidden="true" />;
  if (status === "active")
    return (
      <Loader2
        className={`${base} animate-spin text-primary motion-reduce:animate-none`}
        aria-hidden="true"
      />
    );
  return <CircleDashed className={`${base} text-muted-foreground`} aria-hidden="true" />;
}
