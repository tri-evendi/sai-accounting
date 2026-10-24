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
 * ══ SEJAK OKT 2026: PEKERJAAN DI SERVER, LAYAR MENUNGGU ════════════════════
 * `POST /api/companies` tidak lagi membuat basis data di dalam permintaannya
 * (kredensial PEMILIK PostgreSQL pindah dari `app-customer` ke `svc-worker`).
 * Ia menjawab `202 { jobId }`, dan layar ini MENANYAKAN status pekerjaan itu
 * (`GET /api/companies/provisioning/[id]`) sampai selesai atau gagal. Tahap
 * yang ditampilkan tetap empat tahap yang sama, kini dibaca dari angka
 * kemajuan pekerjaan (`phaseFromProgress`), ditambah satu keadaan baru yang
 * jujur: MENUNGGU GILIRAN di antrean.
 *
 * Id pekerjaannya ditulis ke alamat halaman (`?job=`): pekerjaannya tidak lagi
 * mati bersama tabnya, jadi tab yang dimuat ulang — atau dibuka lagi nanti —
 * kembali menunggu pekerjaan yang SAMA alih-alih menawarkan formulir kosong
 * yang mengundang penyediaan kedua.
 *
 * ══ SATU LANGKAH YANG SENGAJA TIDAK OTOMATIS ═══════════════════════════════
 * Setelah selesai, pengguna TIDAK dilempar ke perusahaan baru. Berpindah
 * perusahaan berarti berpindah buku, dan memindahkan orang tanpa ia meminta
 * adalah cara paling mudah membuatnya mencatat ke tempat yang salah. Yang
 * muncul adalah tautan yang harus ia tekan sendiri.
 *
 * Yang BERUBAH di issue #339 hanyalah sesinya, bukan halamannya: bila sesi itu
 * belum menunjuk perusahaan mana pun, PT yang baru lahir menjadi yang sedang
 * dibuka. Tidak ada perpindahan buku di situ — sebelumnya tidak ada buku sama
 * sekali. Sesi yang SUDAH menunjuk sebuah PT tidak disentuh; alasan lengkapnya
 * di `selectIfUnset`.
 *
 * ⚠ Pita galat tetap `role="alert"`, dan perannya tinggal di PEMBUNGKUS
 * `Alert`: `Alert` AntD menyaring propnya lewat `pickAttrs(props, { aria: true,
 * data: true })`, jadi `role` yang dioper langsung ke sana hilang tanpa satu
 * pun galat. Ini formulir yang bisa gagal setelah puluhan detik menunggu —
 * kegagalan yang tidak diumumkan adalah kegagalan yang tidak diketahui.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Alert, Flex, Typography, theme } from "antd";
import { CheckCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { Button } from "@sai/ui/button";
import { Input } from "@sai/ui/input";
import { Select } from "@sai/ui/select";
import {
  DEFAULT_LEGAL_FORM,
  LEGAL_FORMS,
  LEGAL_FORM_LABEL_KEYS,
  isLegalForm,
  type LegalForm,
} from "@sai/core/legal-form";
import { fieldGrid } from "@/lib/layout-width";
import { useT } from "@sai/core/i18n/client";
import { companyToAdoptAfterCreate } from "@/lib/company-selection";
import {
  databaseNameForSlug,
  normalizeSlug,
  type ProvisionPhase,
} from "@/lib/company-provisioning-shared";
import type { ProvisionStatus } from "@/lib/company-provisioning-queue";
import {
  ProvisionAnnouncer,
  ProvisionProgress,
  PROVISION_STEPS,
  SPIN_RULE,
  type ProvisionState,
} from "./provision-progress";

const { Text } = Typography;

const IDLE: ProvisionState = { current: null, completed: new Set() };

/** Selang tanya status. Penyediaan puluhan detik; 1,5 detik cukup terasa hidup. */
const POLL_MS = 1500;
/** Antrean yang lebih lama dari ini disebut terus terang (lihat `queuedSlow`). */
const SLOW_QUEUE_SECONDS = 60;
/** Kegagalan jaringan BERUNTUN sebelum layar berhenti bertanya. */
const MAX_NETWORK_FAILURES = 4;

/** Jawaban rute status — `failed` membawa kalimat yang sudah diterjemahkan. */
type StatusResponse =
  | Exclude<ProvisionStatus, { state: "failed" }>
  | { state: "failed"; phase: ProvisionPhase; message: string };

/** Tulis/hapus `?job=` tanpa navigasi — lihat kepala berkas. */
function rememberJob(jobId: number | null) {
  const url = new URL(window.location.href);
  if (jobId === null) url.searchParams.delete("job");
  else url.searchParams.set("job", String(jobId));
  window.history.replaceState(window.history.state, "", url);
}

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
  /**
   * Pekerjaan penyediaan yang sedang berjalan (`?job=`), bila halaman dimuat
   * ulang di tengah penyediaan — layar langsung kembali menunggunya.
   */
  initialJobId = null,
}: {
  tenantId: number;
  tenantSlug: string;
  initialJobId?: number | null;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  /* Sesi dibaca DAN ditulis di sini (issue #339) — lihat `selectIfUnset`. */
  const { data: session, update } = useSession();
  /* Penanya status hidup lebih lama daripada satu render (halaman yang dimuat
     ulang di tengah penyediaan bahkan mulai SEBELUM sesi selesai dimuat), jadi
     sesi dibaca lewat ref — bukan dari closure render saat penanya dimulai. */
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  /* Bentuk usaha (24 Okt 2026) — menentukan templat ekuitas yang disemai
     wisaya. Bawaan PT: formulir yang dilewati begitu saja tetap membuat PT. */
  const [legalForm, setLegalForm] = useState<LegalForm>(DEFAULT_LEGAL_FORM);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProvisionState>(IDLE);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  /* `null` = tidak sedang antre; angka = detik menunggu giliran. */
  const [queuedFor, setQueuedFor] = useState<number | null>(null);
  /* Penanya status yang aktif — dihentikan saat komponen dilepas. */
  const following = useRef<number | null>(null);

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

  /**
   * ══ PT YANG BARU LAHIR LANGSUNG DIPILIH — HANYA BILA BELUM ADA (#339) ═════
   *
   * Bug produksinya: pendaftar baru masuk ketika perusahaannya masih NOL, jadi
   * tokennya terbit tanpa `companyId`. Pemilihan otomatis di `lib/auth.ts`
   * hanya terjadi saat LOGIN, dan revalidasi berkala cuma bisa MELEPAS
   * perusahaan yang aksesnya dicabut — tidak ada satu pun jalur yang memilihkan
   * perusahaan yang lahir SESUDAH sesinya. Yang ia lihat berikutnya adalah
   * chrome dasbor tanpa peran, yaitu layar memuat yang tidak pernah selesai.
   *
   * KEPUTUSANNYA — termasuk apa yang terjadi pada perusahaan KEDUA — hidup di
   * `lib/company-selection.ts`, murni dan teruji. Yang tinggal di sini hanya
   * pelaksanaannya: angka yang keluar dari sana tetap diperiksa ULANG ke
   * keanggotaan di server (callback `jwt`, `lib/auth.ts`).
   */
  async function selectIfUnset(createdCompanyId: number | undefined) {
    const adopt = companyToAdoptAfterCreate(sessionRef.current?.user?.companyId, createdCompanyId);
    if (adopt == null) return;
    await update({ companyId: adopt });
  }

  const stepLabel = useCallback(
    (phase: ProvisionPhase): string =>
      ({
        validate: t("companies.stepValidate"),
        create_database: t("companies.stepDatabase"),
        migrate: t("companies.stepMigrate"),
        register: t("companies.stepRegister"),
        done: t("companies.doneTitle"),
      })[phase],
    [t]
  );

  /**
   * Tanya status pekerjaan `jobId` sampai ia selesai atau gagal.
   *
   * Satu penanya pada satu waktu (`following`): pengiriman kedua atau efek
   * yang terpasang dua kali (Strict Mode) tidak boleh melahirkan dua putaran
   * yang saling menimpa keadaan layar.
   */
  const follow = useCallback(
    async (jobId: number) => {
      if (following.current === jobId) return;
      following.current = jobId;
      setRunning(true);

      let lastPhase: string | null = null;
      let networkFailures = 0;
      const announce = (key: string, message: string) => {
        if (key === lastPhase) return;
        lastPhase = key;
        setAnnouncement(message);
      };

      try {
        while (following.current === jobId) {
          let status: StatusResponse;
          try {
            const res = await fetch(`/api/companies/provisioning/${jobId}`, { cache: "no-store" });
            if (res.status === 404) {
              /* Pekerjaan yang tidak ada (atau bukan milik tenant ini) — alamat
                 basi. Kembali ke formulir kosong, tanpa pesan galat palsu. */
              rememberJob(null);
              return;
            }
            if (!res.ok) throw new Error(String(res.status));
            status = (await res.json()) as StatusResponse;
            networkFailures = 0;
          } catch {
            networkFailures += 1;
            if (networkFailures >= MAX_NETWORK_FAILURES) {
              /* `?job=` SENGAJA dibiarkan: muat ulang melanjutkan penantian. */
              setError(t("companies.errNetwork"));
              return;
            }
            await new Promise((r) => setTimeout(r, POLL_MS * networkFailures));
            continue;
          }

          if (status.state === "queued") {
            setQueuedFor(status.waitingSeconds);
            announce("queued", t("companies.queued"));
          } else if (status.state === "running") {
            setQueuedFor(null);
            /* Diklaim tapi belum melapor = tahap pertama sudah dimulai. */
            const phase = status.phase ?? "validate";
            applyEvent({ phase, progress: status.migrateProgress });
            announce(phase, stepLabel(phase));
          } else if (status.state === "done") {
            setQueuedFor(null);
            applyEvent({ phase: "done" });
            announce("done", stepLabel("done"));
            rememberJob(null);
            setCreatedSlug(status.slug);
            /* Sesudah kartu sukses tampil, bukan sebelumnya: pemilihan sesi
               tidak boleh menahan kabar bahwa perusahaannya sudah jadi. */
            await selectIfUnset(status.companyId);
            return;
          } else {
            setQueuedFor(null);
            const failedAt = PROVISION_STEPS.indexOf(status.phase as (typeof PROVISION_STEPS)[number]);
            setProgress((prev) => ({
              ...prev,
              current: status.phase,
              completed: new Set(PROVISION_STEPS.slice(0, Math.max(0, failedAt))),
              failed: true,
            }));
            setError(status.message);
            setAnnouncement(status.message);
            rememberJob(null);
            return;
          }

          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } finally {
        if (following.current === jobId) following.current = null;
        setRunning(false);
      }
    },
    // `applyEvent`/`selectIfUnset` membaca setter & sesi terbaru lewat closure
    // render ini; penanya yang sudah berjalan tidak perlu dimulai ulang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, stepLabel]
  );

  /* Halaman yang dibuka dengan `?job=` langsung kembali menunggu. */
  useEffect(() => {
    if (initialJobId != null) void follow(initialJobId);
    return () => {
      following.current = null;
    };
  }, [initialJobId, follow]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (running) return;

    setRunning(true);
    setError(null);
    setProgress({ current: null, completed: new Set() });
    setAnnouncement(null);
    setCreatedSlug(null);
    setQueuedFor(null);

    let jobId: number;
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: effectiveSlug, legalForm }),
      });
      const data = await res.json().catch(() => null);
      if (res.status !== 202 || typeof data?.jobId !== "number") {
        const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
        const first = fieldErrors ? Object.values(fieldErrors).flat().find(Boolean) : undefined;
        setError(first ?? data?.error ?? t("companies.errFailed"));
        setRunning(false);
        return;
      }
      jobId = data.jobId;
    } catch {
      setError(t("companies.errNetwork"));
      setRunning(false);
      return;
    }

    rememberJob(jobId);
    await follow(jobId);
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
        {/*
         * Dua isian setara → `fieldGrid`. Catatan lamanya ("satu kolom, sebab
         * kartu `AuthShell` maks 28rem") sudah tidak berlaku: halaman ini kini
         * hidup di panel akun yang selebar layar. Yang menahan isiannya tidak
         * ikut membengkak adalah trek `fieldGrid` yang berhenti di
         * `LEBAR_KOLOM_ISIAN` — layar lebar menambah KOLOM, bukan melebarkan
         * kotak.
         */}
        <div style={fieldGrid()}>
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
        </div>

        <Flex vertical gap={token.marginXXS} style={{ maxWidth: 480 }}>
          <Select
            id="company-legal-form"
            label={t("legalForm.label")}
            value={legalForm}
            onChange={(e) => {
              if (isLegalForm(e.target.value)) setLegalForm(e.target.value);
            }}
            disabled={running}
            aria-describedby="company-legal-form-help"
            options={LEGAL_FORMS.map((f) => ({ value: f, label: t(LEGAL_FORM_LABEL_KEYS[f]) }))}
          />
          <Text id="company-legal-form-help" type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {t("legalForm.createHelp")}
          </Text>
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

        {queuedFor !== null && (
          /* Antrean disebut terus terang — layar yang diam tanpa tahap aktif
             tak bisa dibedakan dari layar yang macet. Lebih dari semenit
             berarti pekerja latar sedang sibuk atau mati, dan penunggunya
             berhak tahu bahwa ia tidak harus tetap di sini. */
          <Alert
            type={queuedFor >= SLOW_QUEUE_SECONDS ? "warning" : "info"}
            showIcon
            message={
              queuedFor >= SLOW_QUEUE_SECONDS ? t("companies.queuedSlow") : t("companies.queued")
            }
          />
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
