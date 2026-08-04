"use client";

/**
 * Formulir + KEMAJUAN pembuatan perusahaan baru (issue #104).
 *
 * ══ KENAPA KEMAJUANNYA BERBUTIR, BUKAN SATU PEMUTAR ════════════════════════
 * Pekerjaannya puluhan detik dan terdiri dari langkah-langkah yang BERBEDA
 * risikonya: membuat basis data, menerapkan 40-an migration, mendaftarkan.
 * Satu pemutar berputar memberi pengguna dua informasi saja — "sedang bekerja"
 * dan "belum selesai" — sehingga ketika ada yang gagal, ia tidak tahu apakah
 * ada yang terlanjur dibuat di server. Dengan langkah yang tercetak satu per
 * satu, layar yang gagal masih menceritakan sejauh mana ia sampai.
 *
 * Aliran datanya NDJSON (satu objek JSON per baris) dari `POST /api/companies`.
 * Dibaca dengan `fetch` + `ReadableStream` — tanpa pustaka, tanpa polling.
 *
 * ══ SATU LANGKAH YANG SENGAJA TIDAK OTOMATIS ═══════════════════════════════
 * Setelah selesai, pengguna TIDAK dilempar ke perusahaan baru. Berpindah
 * perusahaan berarti berpindah buku, dan memindahkan orang tanpa ia meminta
 * adalah cara paling mudah membuatnya mencatat ke tempat yang salah. Yang
 * muncul adalah tautan yang harus ia tekan sendiri.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";
import {
  databaseNameForSlug,
  normalizeSlug,
  type ProvisionPhase,
} from "@/lib/company-provisioning-shared";
import {
  ProvisionAnnouncer,
  ProvisionProgress,
  PROVISION_STEPS,
  type ProvisionState,
} from "./provision-progress";

const IDLE: ProvisionState = { current: null, completed: new Set() };

export function CompanyForm({
  /**
   * Tenant pemilik — hanya untuk PRATINJAU nama basis data: sejak issue #153
   * nama turunannya `sai_t{tenantId}_{slug}`, jadi pratinjau tanpa id tenant
   * akan menjanjikan nama yang bukan yang sebenarnya dibuat server.
   */
  tenantId,
  /**
   * Slug tenant — dipakai HANYA untuk menyusun jalan pintas ke wizard
   * penyiapan perusahaan yang baru dibuat (`/t/{tenant}/{company}/setup`).
   */
  tenantSlug,
}: {
  tenantId: number;
  tenantSlug: string;
}) {
  const t = useT();
  const router = useRouter();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProvisionState>(IDLE);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  /*
   * Slug mengikuti nama sampai pengguna menyentuhnya sendiri. Setelah itu ia
   * berhenti ikut — mengubah slug orang di belakang punggungnya, sementara ia
   * sudah mengetiknya sendiri, adalah cara cepat membuat nama basis data yang
   * bukan yang ia maksud.
   */
  const effectiveSlug = slugTouched ? normalizeSlug(slug) : normalizeSlug(name);
  const previewDatabase = effectiveSlug ? databaseNameForSlug(effectiveSlug, tenantId) : "";

  /**
   * Menerapkan satu peristiwa ke keadaan tahap.
   *
   * Tahap SEBELUM tahap yang datang otomatis ditandai selesai: server
   * mengirim peristiwa saat sebuah tahap DIMULAI, jadi tibanya tahap ke-n
   * adalah bukti tahap ke-(n−1) sudah lewat. Menunggu peristiwa "selesai"
   * tersendiri hanya akan menambah lalu lintas untuk menyatakan hal yang sudah
   * pasti.
   */
  function applyEvent(event: { phase: string; detail?: string; progress?: number }) {
    const phase = event.phase as ProvisionPhase;

    setProgress((prev) => {
      const index = PROVISION_STEPS.indexOf(phase as (typeof PROVISION_STEPS)[number]);
      const completed = new Set(prev.completed);
      if (phase === "done") {
        for (const step of PROVISION_STEPS) completed.add(step);
        return { current: null, completed, migrateProgress: 1 };
      }
      for (const step of PROVISION_STEPS.slice(0, Math.max(0, index))) completed.add(step);
      return {
        current: phase,
        completed,
        migrateProgress: phase === "migrate" ? event.progress : prev.migrateProgress,
        detail: event.detail ?? (phase === "migrate" ? prev.detail : undefined),
      };
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (running) return;

    setRunning(true);
    setError(null);
    setProgress({ current: null, completed: new Set() });
    setAnnouncement(null);
    setCreatedSlug(null);

    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: effectiveSlug }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
        const first = fieldErrors ? Object.values(fieldErrors).flat().find(Boolean) : undefined;
        setError(first ?? data?.error ?? t("companies.errFailed"));
        return;
      }

      let lastPhase: string | null = null;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Membaca NDJSON: potongan bisa berhenti di tengah baris, jadi hanya
      // baris yang sudah lengkap (punya "\n") yang diurai.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const raw of lines) {
          if (!raw.trim()) continue;
          let event: {
            phase: string;
            message: string;
            detail?: string;
            progress?: number;
          };
          try {
            event = JSON.parse(raw);
          } catch {
            continue;
          }

          if (event.phase === "error") {
            setError(event.message);
            setProgress((prev) => ({ ...prev, failed: true }));
            setAnnouncement(event.message);
            return;
          }

          applyEvent(event);
          // Diumumkan hanya saat TAHAP berpindah — bukan tiap berkas migration.
          if (event.phase !== lastPhase) {
            lastPhase = event.phase;
            setAnnouncement(event.message);
          }

          if (event.phase === "done") setCreatedSlug(effectiveSlug);
        }
      }
    } catch {
      setError(t("companies.errNetwork"));
    } finally {
      setRunning(false);
    }
  }

  if (createdSlug) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-success-soft p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-strong" aria-hidden="true" />
          <div>
            <p className="font-medium text-success-strong">{t("companies.doneTitle")}</p>
            <p className="mt-1 text-sm text-success-strong">{t("companies.doneBody")}</p>
          </div>
        </div>
        <ProvisionProgress state={progress} />
        <div className="flex flex-wrap gap-2">
          {/* ⚠ JALAN PINTAS KE WIZARD, dan kenapa ia yang menjadi tombol UTAMA.
           *
           * Sebelum ini satu-satunya jalan maju adalah "buka pemilih
           * perusahaan" — bahkan bagi orang yang baru saja membuat PT
           * PERTAMANYA dan karena itu tidak punya apa pun untuk dipilih.
           * Perjalanannya menjadi tiga lompatan (kartu sukses → pemilih →
           * gerbang penyiapan) untuk satu tujuan yang sudah pasti, dan langkah
           * yang WAJIB dikerjakan berikutnya — daftar akun & saldo awal —
           * tidak pernah disebut namanya.
           *
           * Pemuatan penuh (`<a>`, bukan `<Link>`) disengaja, sama seperti
           * jalur pemilih: sesi harus memuat ulang konteks perusahaannya.
           * Penjaga di halaman setup tetap yang memutuskan boleh-tidaknya —
           * pintasan ini tidak melewati apa pun (keanggotaan pembuatnya sudah
           * dibuat bersamaan dengan perusahaannya). */}
          <Button asChild>
            <a href={`/t/${tenantSlug}/${createdSlug}/setup`}>{t("companies.openSetup")}</a>
          </Button>
          {/* Perpindahan perusahaan lewat pemilih — pemuatan penuh, sama
              seperti jalur lainnya (lihat CompanyChoices). */}
          <Button asChild variant="outline">
            <a href="/select-company">{t("companies.openPicker")}</a>
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setCreatedSlug(null);
              setName("");
              setSlug("");
              setSlugTouched(false);
              setProgress(IDLE);
              setAnnouncement(null);
              router.refresh();
            }}
          >
            {t("companies.addAnother")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Satu kolom: sejak pindah ke kulit AuthShell (issue #135) lebar kartunya
          max-w-md — dua kolom di ruang itu memotong label & bantuan slug. */}
      <div className="grid gap-4">
        <div className="space-y-1">
          <Input
            id="company-name"
            label={t("companies.nameLabel")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={running}
            required
            maxLength={150}
            aria-describedby="company-name-help"
          />
          <p id="company-name-help" className="text-xs text-muted-foreground">
            {t("companies.nameHelp")}
          </p>
        </div>
        <div className="space-y-1">
          <Input
            id="company-slug"
            label={t("companies.slugLabel")}
            value={slugTouched ? slug : effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            disabled={running}
            maxLength={40}
            aria-describedby="company-slug-help"
          />
          <p id="company-slug-help" className="text-xs text-muted-foreground">
            {t("companies.slugHelp")}
          </p>
        </div>
      </div>

      {previewDatabase && (
        <p className="text-sm text-muted-foreground">
          {t("companies.databasePreview")}{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
            {previewDatabase}
          </code>
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive-strong"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p>{error}</p>
            {/* Kegagalan di tengah TIDAK meninggalkan perusahaan setengah jadi
                yang terlihat pengguna — registry ditulis paling akhir. */}
            <p className="mt-1 text-destructive-strong/80">{t("companies.errSafeToRetry")}</p>
          </div>
        </div>
      )}

      {(running || progress.current !== null || progress.failed) && (
        <ProvisionProgress state={progress} />
      )}
      <ProvisionAnnouncer message={announcement} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={running || !name.trim() || !effectiveSlug}>
          {running && (
            <Loader2
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          {running ? t("companies.creating") : t("companies.create")}
        </Button>
        {running && (
          <p className="text-sm text-muted-foreground">{t("companies.dontClose")}</p>
        )}
      </div>
    </form>
  );
}
