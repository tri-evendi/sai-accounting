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
 *
 * ⚠ Pita galat tetap `role="alert"`, dan perannya tinggal di PEMBUNGKUS
 * `Alert`: `Alert` AntD menyaring propnya lewat `pickAttrs(props, { aria: true,
 * data: true })`, jadi `role` yang dioper langsung ke sana hilang tanpa satu
 * pun galat. Ini formulir yang bisa gagal setelah puluhan detik menunggu —
 * kegagalan yang tidak diumumkan adalah kegagalan yang tidak diketahui.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Flex, Typography, theme } from "antd";
import { CheckCircleOutlined, LoadingOutlined } from "@ant-design/icons";
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
  SPIN_RULE,
  type ProvisionState,
} from "./provision-progress";

const { Text } = Typography;

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
  const { token } = theme.useToken();
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
      <Flex vertical gap={token.margin}>
        <div role="status" aria-live="polite">
          <Alert
            type="success"
            showIcon
            icon={<CheckCircleOutlined aria-hidden="true" style={{ fontSize: 20 }} />}
            message={t("companies.doneTitle")}
            description={t("companies.doneBody")}
          />
        </div>
        <ProvisionProgress state={progress} />
        <Flex wrap gap={token.marginXS}>
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
          <Button href={`/t/${tenantSlug}/${createdSlug}/setup`} variant="primary">
            {t("companies.openSetup")}
          </Button>
          {/* Perpindahan perusahaan lewat pemilih — pemuatan penuh, sama
              seperti jalur lainnya (lihat CompanyChoices). */}
          <Button href="/select-company" variant="outline">
            {t("companies.openPicker")}
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
        </Flex>
      </Flex>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Aturan pemutar dipasang di sini JUGA, bukan hanya di
          `ProvisionProgress`: tombol kirim memutar ikonnya sendiri, dan
          mengandalkan `<style>` milik komponen tetangga berarti animasinya
          hidup-mati mengikuti komponen yang berbeda. React 19 meniadakan
          gandanya lewat `href`. */}
      <style href="sai-spin" precedence="default">
        {SPIN_RULE}
      </style>
      <Flex vertical gap={token.marginLG}>
        {/* Satu kolom: sejak pindah ke kulit AuthShell (issue #135) lebar kartunya
            maks 28rem — dua kolom di ruang itu memotong label & bantuan slug. */}
        <Flex vertical gap={token.margin}>
          <Flex vertical gap={token.marginXXS}>
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
            <Text id="company-name-help" type="secondary" style={{ fontSize: token.fontSizeSM }}>
              {t("companies.nameHelp")}
            </Text>
          </Flex>
          <Flex vertical gap={token.marginXXS}>
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
            <Text id="company-slug-help" type="secondary" style={{ fontSize: token.fontSizeSM }}>
              {t("companies.slugHelp")}
            </Text>
          </Flex>
        </Flex>

        {previewDatabase && (
          <Text type="secondary">
            {t("companies.databasePreview")}{" "}
            <code
              style={{
                borderRadius: token.borderRadiusSM,
                padding: "2px 6px",
                fontFamily: "monospace",
                background: token.colorFillQuaternary,
                color: token.colorText,
              }}
            >
              {previewDatabase}
            </code>
          </Text>
        )}

        {error && (
          <div role="alert">
            <Alert
              type="error"
              showIcon
              message={error}
              /* Kegagalan di tengah TIDAK meninggalkan perusahaan setengah jadi
                 yang terlihat pengguna — registry ditulis paling akhir. */
              description={t("companies.errSafeToRetry")}
            />
          </div>
        )}

        {(running || progress.current !== null || progress.failed) && (
          <ProvisionProgress state={progress} />
        )}
        <ProvisionAnnouncer message={announcement} />

        <Flex align="center" gap={token.marginSM}>
          <Button
            type="submit"
            variant="primary"
            disabled={running || !name.trim() || !effectiveSlug}
          >
            {running && <LoadingOutlined data-spin aria-hidden="true" style={{ fontSize: 16 }} />}
            {running ? t("companies.creating") : t("companies.create")}
          </Button>
          {running && <Text type="secondary">{t("companies.dontClose")}</Text>}
        </Flex>
      </Flex>
    </form>
  );
}
