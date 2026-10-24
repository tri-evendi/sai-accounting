"use client";

/**
 * DAFTAR PERMINTAAN AKTIVASI — alur demo-first (24 Okt 2026).
 *
 * Customer yang uji cobanya berjalan atau sudah beku menekan "Minta aktivasi"
 * di aplikasinya; barisnya mendarat di sini sebagai daftar kerja: siapa yang
 * menunggu dihubungi, sejak kapan, dan apa pesannya. Satu tindakan per baris —
 * "Tandai ditangani" — dengan ALASAN yang diketik (pola aksi tenant #155):
 * jejaknya menjawab "siapa menghubungi prospek ini, dan apa hasilnya".
 *
 * Aktivasinya sendiri BUKAN tombol di sini: ia keputusan uang yang berdiri di
 * rincian tenant, di sebelah fakta langganannya ("Aktifkan dari penawaran",
 * "Perpanjang uji coba").
 */

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Flex } from "antd";

import { Badge } from "@sai/ui/badge";
import { Button } from "@sai/ui/button";
import { Input } from "@sai/ui/input";
import { StaticTable } from "@sai/ui/static-table";
import type { SaiColumns } from "@sai/ui/table-columns";
import { CONSOLE_MUTED } from "@op/components/operator/console-ui";
import { useT } from "@sai/core/i18n/client";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import type { OperatorActionResult } from "@op/app/(operator)/tenants/[id]/actions";

export interface ActivationRequestView {
  id: number;
  tenantId: number;
  tenantName: string | null;
  referredByPartner: string | null;
  requestedByName: string | null;
  tenantStatus: string;
  note: string | null;
  createdLabel: string;
  status: string;
  handledLabel: string | null;
}

export interface ActivationRequestsProps {
  rows: ActivationRequestView[];
  canAct: boolean;
  /** Tampilkan kolom tenant (daftar umum) atau tidak (rincian satu tenant). */
  showTenant: boolean;
  markHandled: (input: { requestId: number; reason: string }) => Promise<OperatorActionResult>;
}

export function ActivationRequests({ rows, canAct, showTenant, markHandled }: ActivationRequestsProps) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<ActivationRequestView | null>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<OperatorActionResult | null>(null);

  function jalankan() {
    if (!target) return;
    startTransition(async () => {
      const r = await markHandled({ requestId: target.id, reason });
      setResult(r);
      if (r.ok) {
        setTarget(null);
        router.refresh();
      }
    });
  }

  const columns: SaiColumns<ActivationRequestView> = [
    ...(showTenant
      ? ([
          {
            key: "tenant",
            title: t("operator.tenants.colName"),
            align: "left",
            render: (_v, r) => (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <Link href={`/tenants/${r.tenantId}?tab=billing`} style={{ color: "var(--ant-color-link)", fontWeight: 500 }}>
                  {r.tenantName ?? `#${r.tenantId}`}
                </Link>
                {r.referredByPartner && (
                  <span style={{ ...CONSOLE_MUTED, fontSize: "var(--ant-font-size-sm)" }}>
                    {t("operator.partner.short", { partner: r.referredByPartner })}
                  </span>
                )}
              </div>
            ),
          },
        ] satisfies SaiColumns<ActivationRequestView>)
      : []),
    {
      key: "who",
      title: t("operator.activation.colRequestedBy"),
      align: "left",
      render: (_v, r) => (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span>{r.requestedByName ?? "—"}</span>
          <span style={{ ...CONSOLE_MUTED, fontSize: "var(--ant-font-size-sm)" }}>{r.createdLabel}</span>
        </div>
      ),
    },
    {
      key: "state",
      title: t("operator.tenants.colStatus"),
      align: "left",
      render: (_v, r) => (
        <Badge variant={r.tenantStatus === "trial_ended" ? "warning" : "default"}>
          {t(`tenantSettings.status.${r.tenantStatus}` as DictionaryKey)}
        </Badge>
      ),
    },
    {
      key: "note",
      title: t("operator.activation.colNote"),
      align: "left",
      render: (_v, r) => <span style={CONSOLE_MUTED}>{r.note || "—"}</span>,
    },
    {
      key: "actions",
      title: t("operator.users.colActions"),
      align: "left",
      render: (_v, r) =>
        r.status !== "open" ? (
          <span style={CONSOLE_MUTED}>{t("operator.activation.handledAt", { date: r.handledLabel ?? "—" })}</span>
        ) : canAct ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              setTarget(r);
              setReason("");
              setResult(null);
            }}
          >
            {t("operator.activation.markHandled")}
          </Button>
        ) : (
          <Badge variant="warning">{t("operator.activation.open")}</Badge>
        ),
    },
  ];

  return (
    <Flex vertical gap="middle">
      {result && <Alert type={result.ok ? "success" : "error"} showIcon message={result.message} />}
      {target && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            jalankan();
          }}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--ant-margin-sm)",
            padding: "var(--ant-padding)",
            border: "1px solid var(--ant-color-border-secondary)",
            borderRadius: "var(--ant-border-radius-lg)",
          }}
        >
          <strong>{t("operator.activation.confirm", { tenant: target.tenantName ?? `#${target.tenantId}` })}</strong>
          <Input
            name="reason"
            label={t("operator.users.reasonLabel")}
            placeholder={t("operator.activation.reasonPlaceholder")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoComplete="off"
          />
          <Flex gap="small">
            <Button type="submit" variant="primary" disabled={pending || reason.trim().length < 5}>
              {t("operator.users.confirm")}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setTarget(null)}>
              {t("operator.users.cancel")}
            </Button>
          </Flex>
        </form>
      )}
      <StaticTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={<p style={{ ...CONSOLE_MUTED, padding: "var(--ant-padding-lg)" }}>{t("operator.activation.empty")}</p>}
      />
    </Flex>
  );
}
