"use client";

/**
 * BANTUAN PENGGUNA di rincian tenant — daftar pengguna & undangan terbuka,
 * dengan tiga tindakan yang membuka kembali jalan masuk tanpa operator
 * memegang rahasia siapa pun (`lib/operator/user-support.ts`).
 *
 * Setiap tindakan menuntut ALASAN yang diketik (pola aksi tenant #155): ia
 * masuk jejak TENANT, dan pelanggan yang bertanya "kenapa saya dikeluarkan?"
 * berhak mendapat jawaban yang lebih dari nama operator.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Flex } from "antd";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { CONSOLE_MUTED } from "@/components/operator/console-ui";
import { useT } from "@/lib/i18n/client";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import type { OperatorActionResult } from "@/app/(app)/(operator)/operator/tenants/[id]/actions";

export interface SupportUserView {
  id: number;
  label: string;
  email: string | null;
  mustChangePassword: boolean;
  activeMemberships: number;
}

export interface SupportInvitationView {
  id: number;
  email: string;
  companyName: string;
  companyRole: string;
  expiresLabel: string;
  expired: boolean;
}

type Kind = "revoke" | "reset" | "resend";
type Act = (input: { tenantId: number; targetId: number; reason: string }) => Promise<OperatorActionResult>;

export interface TenantUserSupportProps {
  tenantId: number;
  users: SupportUserView[];
  invitations: SupportInvitationView[];
  canAct: boolean;
  revoke: Act;
  reset: Act;
  resend: Act;
}

const JUDUL: Record<Kind, DictionaryKey> = {
  revoke: "operator.users.confirmRevoke",
  reset: "operator.users.confirmReset",
  resend: "operator.users.confirmResend",
};

export function TenantUserSupport(props: TenantUserSupportProps) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<{ kind: Kind; id: number; label: string } | null>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<OperatorActionResult | null>(null);

  function pilih(kind: Kind, id: number, label: string) {
    setTarget({ kind, id, label });
    setReason("");
    setResult(null);
  }

  function jalankan() {
    if (!target) return;
    const act = target.kind === "revoke" ? props.revoke : target.kind === "reset" ? props.reset : props.resend;
    startTransition(async () => {
      const r = await act({ tenantId: props.tenantId, targetId: target.id, reason });
      setResult(r);
      if (r.ok) {
        setTarget(null);
        router.refresh();
      }
    });
  }

  const userColumns: SaiColumns<SupportUserView> = [
    {
      key: "user",
      title: t("operator.users.colUser"),
      align: "left",
      render: (_v, u) => (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 500 }}>{u.label}</span>
          <span style={{ ...CONSOLE_MUTED, fontSize: "var(--ant-font-size-sm)" }}>{u.email ?? "—"}</span>
        </div>
      ),
    },
    {
      key: "state",
      title: t("operator.users.colState"),
      align: "left",
      render: (_v, u) =>
        u.activeMemberships === 0 ? (
          <Badge variant="outline">{t("operator.users.noAccess")}</Badge>
        ) : u.mustChangePassword ? (
          <Badge variant="warning">{t("operator.users.mustChange")}</Badge>
        ) : (
          <span style={CONSOLE_MUTED}>{t("operator.users.companies", { count: u.activeMemberships })}</span>
        ),
    },
    ...(props.canAct
      ? ([
          {
            key: "actions",
            title: t("operator.users.colActions"),
            align: "left",
            render: (_v, u) => (
              <Flex gap="small" wrap>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => pilih("revoke", u.id, u.label)}>
                  {t("operator.users.revoke")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending || !u.email}
                  onClick={() => pilih("reset", u.id, u.label)}
                >
                  {t("operator.users.sendReset")}
                </Button>
              </Flex>
            ),
          },
        ] satisfies SaiColumns<SupportUserView>)
      : []),
  ];

  const invitationColumns: SaiColumns<SupportInvitationView> = [
    {
      key: "email",
      title: t("operator.users.colInvitee"),
      align: "left",
      render: (_v, i) => (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 500 }}>{i.email}</span>
          <span style={{ ...CONSOLE_MUTED, fontSize: "var(--ant-font-size-sm)" }}>
            {i.companyName} · {i.companyRole}
          </span>
        </div>
      ),
    },
    {
      key: "expires",
      title: t("operator.users.colExpires"),
      align: "left",
      render: (_v, i) =>
        i.expired ? (
          <Badge variant="warning">{t("operator.users.expired", { date: i.expiresLabel })}</Badge>
        ) : (
          <span style={CONSOLE_MUTED}>{i.expiresLabel}</span>
        ),
    },
    ...(props.canAct
      ? ([
          {
            key: "actions",
            title: t("operator.users.colActions"),
            align: "left",
            render: (_v, i) => (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => pilih("resend", i.id, i.email)}>
                {t("operator.users.resend")}
              </Button>
            ),
          },
        ] satisfies SaiColumns<SupportInvitationView>)
      : []),
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
          <strong>{t(JUDUL[target.kind], { name: target.label })}</strong>
          <Input
            name="reason"
            label={t("operator.users.reasonLabel")}
            placeholder={t("operator.users.reasonPlaceholder")}
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
        columns={userColumns}
        rows={props.users}
        rowKey={(u) => u.id}
        empty={<p style={{ ...CONSOLE_MUTED, padding: "var(--ant-padding-lg)" }}>{t("operator.users.emptyUsers")}</p>}
      />

      {props.invitations.length > 0 && (
        <>
          <strong>{t("operator.users.invitationsHeading", { count: props.invitations.length })}</strong>
          <StaticTable columns={invitationColumns} rows={props.invitations} rowKey={(i) => i.id} />
        </>
      )}
    </Flex>
  );
}
