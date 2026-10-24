"use client";

/**
 * Tombol ekspor data mandiri (#142) — dua bentuk, satu sakelar.
 *
 * `runner` datang dari server (`tenantExportRunner()`, yaitu `runner:` kind
 * `tenant.data_export` di `contract/kinds.yaml`):
 *
 *   • `node` — tautan unduh biasa (`GET /api/tenant/export`); server
 *     men-stream ZIP-nya seketika, seperti sejak #142.
 *   • `go`   — "minta, tunggu, unduh": `POST` menerbitkan pekerjaan jalur
 *     `bulk`, layar menanyai `/api/tenant/export/jobs` tiap beberapa detik
 *     (kemajuan nyata dari pelari, bukan jadwal karangan), lalu menampilkan
 *     tautan unduh berkas hasilnya.
 *
 * Kalimat keadaannya `role="status"` (sopan) dan galatnya `role="alert"` —
 * keduanya satu-satunya umpan balik dari permintaan yang tidak memindahkan
 * halaman; tanpa itu pembaca layar mendengar sunyi lalu menekan lagi.
 *
 * Halaman ini BOLEH ditutup selama menunggu: pekerjaannya hidup di antrean,
 * dan saat dibuka lagi keadaan terbarunya dibaca ulang.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Flex, Typography, theme } from "antd";
import { DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button } from "@sai/ui/button";
import { Progress } from "@sai/ui/progress";
import { formatDate } from "@sai/core/utils";
import { useT } from "@sai/core/i18n/client";
import { DONE_RETENTION_DAYS } from "@sai/core/generated/job-numbers";
import { moneyPalette } from "@sai/ui/theme/antd-tokens";

const { Text } = Typography;

type ExportState = "queued" | "running" | "ready" | "failed";

interface ExportJob {
  id: number;
  state: ExportState;
  progress: number;
  createdAt: string;
  finishedAt: string | null;
}

/** Selang tanya keadaan. Ekspor tenant berjalan menit, bukan detik. */
const POLL_MS = 3000;

export function ExportPanel({ runner, body }: { runner: "node" | "go"; body: string }) {
  const t = useT();
  const { token } = theme.useToken();

  return (
    <Flex wrap align="center" justify="space-between" gap={token.marginSM}>
      <Text type="secondary" style={{ flex: "1 1 260px", lineHeight: 1.625 }}>
        {body}
      </Text>
      {runner === "node" ? (
        /* `download` menempel di TOMBOLNYA — `Button href` merender `<a>`
           itu sendiri, jadi atribut anchor apa pun harus ikut ke sini. */
        <Button href="/api/tenant/export" download variant="outline" style={{ flexShrink: 0 }}>
          <DownloadOutlined aria-hidden="true" />
          {t("tenantSettings.exportButton")}
        </Button>
      ) : (
        <JobExport />
      )}
    </Flex>
  );
}

function JobExport() {
  const t = useT();
  const { token } = theme.useToken();
  const money = moneyPalette(token);
  const [job, setJob] = useState<ExportJob | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/tenant/export/jobs", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { job: ExportJob | null };
      setJob(data.job);
    } catch {
      /* Jaringan putus sesaat: putaran berikutnya mencoba lagi. */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pending = job !== null && (job.state === "queued" || job.state === "running");
  /* `setInterval`, bukan rantai `setTimeout` per jawaban: satu tanya yang
     gagal (jaringan putus sesaat) tidak boleh menghentikan penantiannya. */
  useEffect(() => {
    if (!pending) return;
    timer.current = setInterval(() => void refresh(), POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [pending, refresh]);

  async function request() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/tenant/export", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? t("tenantSettings.exportFailed"));
        return;
      }
      setJob({
        id: data.jobId,
        state: "queued",
        progress: 0,
        createdAt: new Date().toISOString(),
        finishedAt: null,
      });
    } catch {
      setError(t("tenantSettings.exportFailed"));
    } finally {
      setBusy(false);
    }
  }

  const requestButton = (label: string, variant: "outline" | "secondary") => (
    <Button
      variant={variant}
      disabled={busy || !loaded}
      onClick={request}
      style={{ flexShrink: 0 }}
    >
      {variant === "outline" ? (
        <DownloadOutlined aria-hidden="true" />
      ) : (
        <ReloadOutlined aria-hidden="true" />
      )}
      {label}
    </Button>
  );

  return (
    <Flex vertical gap={token.marginXS} style={{ flex: "1 1 260px", maxWidth: 420 }}>
      {pending && (
        <>
          <Text role="status" style={{ fontVariantNumeric: "tabular-nums" }}>
            {job!.state === "queued"
              ? t("tenantSettings.exportQueued")
              : t("tenantSettings.exportRunning", { percent: job!.progress })}
          </Text>
          <Progress value={job!.progress / 100} label={t("tenantSettings.exportProgressLabel")} />
        </>
      )}

      {job?.state === "ready" && (
        <>
          <Text role="status">
            {t("tenantSettings.exportReady", {
              date: formatDate(job.finishedAt ?? job.createdAt),
              days: DONE_RETENTION_DAYS,
            })}
          </Text>
          <Flex wrap gap={token.marginXS}>
            <Button
              href={`/api/tenant/export/jobs/${job.id}/result`}
              download
              variant="primary"
              style={{ flexShrink: 0 }}
            >
              <DownloadOutlined aria-hidden="true" />
              {t("tenantSettings.exportDownload")}
            </Button>
            {requestButton(t("tenantSettings.exportRequestAgain"), "secondary")}
          </Flex>
        </>
      )}

      {job?.state === "failed" && (
        <Text role="alert" style={{ color: money.colorMoneyNegative }}>
          {t("tenantSettings.exportJobFailed")}
        </Text>
      )}
      {error && (
        <Text role="alert" style={{ color: money.colorMoneyNegative }}>
          {error}
        </Text>
      )}

      {(job === null || job.state === "failed") && (
        <div>{requestButton(t("tenantSettings.exportRequestButton"), "outline")}</div>
      )}
    </Flex>
  );
}
