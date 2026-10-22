"use client";

/**
 * Layar AKUN OPERATOR — buat, ubah peran, nonaktifkan, cabut sesi, atur ulang
 * kredensial (migration kendali 0004).
 *
 * Kredensial yang diterbitkan tampil SEKALI di kotak peringatan, dan hanya
 * hidup di state komponen ini: tidak di URL, tidak di cache, tidak di jejak.
 * Menutup kotaknya (atau berpindah halaman) membuangnya untuk selamanya —
 * memang itu maksudnya; yang lupa menyimpannya mengatur ulang kredensialnya.
 *
 * Layar ini hanya PERMUKAAN: setiap aturan (izin owner, tidak mengunci diri
 * sendiri, owner terakhir) ditegakkan ulang di server action dan di inti.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Flex } from "antd";

import { Badge } from "@sai/ui/badge";
import { Button } from "@sai/ui/button";
import { ConfirmDialog } from "@sai/ui/confirm-dialog";
import { Input } from "@sai/ui/input";
import { Select } from "@sai/ui/select";
import { StaticTable } from "@sai/ui/static-table";
import type { SaiColumns } from "@sai/ui/table-columns";
import { CONSOLE_MUTED, CONSOLE_TABULAR } from "@op/components/operator/console-ui";
import { QrCode } from "@op/components/operator/qr-code";
import { useT } from "@sai/core/i18n/client";
import type { DictionaryKey } from "@sai/core/i18n/dictionary";
import { OPERATOR_ROLES, type OperatorRole } from "@op/lib/operator/roles";
import type { IssuedCredential } from "@op/lib/operator/operator-accounts";
import type { OperatorAccountActionResult } from "@op/app/(operator)/accounts/actions";

export interface OperatorAccountView {
  id: number;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginLabel: string;
  createdBy: string;
}

type Change =
  | { kind: "role"; role: OperatorRole }
  | { kind: "deactivate" }
  | { kind: "activate" }
  | { kind: "revoke" }
  | { kind: "reset" };

export interface OperatorAccountsProps {
  rows: OperatorAccountView[];
  /** Nama operator yang sedang masuk — barisnya tidak bisa dinonaktifkan/diturunkan. */
  currentName: string;
  canManage: boolean;
  create: (input: { name: string; role: OperatorRole }) => Promise<OperatorAccountActionResult>;
  update: (input: { id: number; change: Change }) => Promise<OperatorAccountActionResult>;
}

/** Peta statis — penjaga kunci kamus yatim membaca rujukan sebagai teks. */
const ROLE_LABEL: Record<OperatorRole, DictionaryKey> = {
  owner: "operator.accounts.roles.owner",
  billing: "operator.accounts.roles.billing",
  support: "operator.accounts.roles.support",
  viewer: "operator.accounts.roles.viewer",
};

const CODE: React.CSSProperties = {
  fontFamily: "var(--ant-font-family-code)",
  wordBreak: "break-all",
  userSelect: "all",
};

function CredentialBox({
  credential,
  onDone,
}: {
  credential: IssuedCredential;
  onDone: () => void;
}) {
  const t = useT();
  return (
    <Alert
      type="warning"
      showIcon
      message={t("operator.accounts.credentialTitle", { name: credential.name })}
      description={
        <Flex vertical gap="small">
          <span>{t("operator.accounts.credentialOnce")}</span>
          <span>
            {t("operator.accounts.credentialPassword")}: <code style={CODE}>{credential.password}</code>
          </span>
          {/* QR dulu — itu yang dipindai; teks di bawahnya cadangan entri manual. */}
          <QrCode qr={credential.qr} label={t("operator.authenticator.qrLabel", { name: credential.name })} />
          <span>
            {t("operator.accounts.credentialTotp")}: <code style={CODE}>{credential.totpSecret}</code>
          </span>
          <span>
            {t("operator.accounts.credentialUri")}: <code style={CODE}>{credential.otpauthUri}</code>
          </span>
          <div>
            <Button variant="outline" size="sm" onClick={onDone}>
              {t("operator.accounts.credentialDone")}
            </Button>
          </div>
        </Flex>
      }
    />
  );
}

export function OperatorAccounts({ rows, currentName, canManage, create, update }: OperatorAccountsProps) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [credential, setCredential] = useState<IssuedCredential | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<OperatorRole>("viewer");
  const [roleDraft, setRoleDraft] = useState<Record<number, OperatorRole>>({});
  const [confirming, setConfirming] = useState<{ row: OperatorAccountView; change: Change } | null>(
    null
  );

  const roleOptions = OPERATOR_ROLES.map((value) => ({ value, label: t(ROLE_LABEL[value]) }));

  function apply(result: OperatorAccountActionResult) {
    setMessage({ ok: result.ok, text: result.message });
    if (result.credential) setCredential(result.credential);
    if (result.ok) router.refresh();
  }

  function submitCreate() {
    startTransition(async () => {
      const result = await create({ name, role });
      apply(result);
      if (result.ok) setName("");
    });
  }

  function submitChange(row: OperatorAccountView, change: Change) {
    startTransition(async () => apply(await update({ id: row.id, change })));
  }

  const confirmCopy = (c: Change): { title: DictionaryKey; body: DictionaryKey } =>
    c.kind === "deactivate"
      ? { title: "operator.accounts.confirmDeactivateTitle", body: "operator.accounts.confirmDeactivateBody" }
      : c.kind === "reset"
        ? { title: "operator.accounts.confirmResetTitle", body: "operator.accounts.confirmResetBody" }
        : { title: "operator.accounts.confirmRevokeTitle", body: "operator.accounts.confirmRevokeBody" };

  const columns: SaiColumns<OperatorAccountView> = [
    {
      key: "name",
      title: t("operator.accounts.colName"),
      align: "left",
      render: (_v, row) => (
        <span style={{ fontWeight: 500 }}>
          {row.name}
          {row.name === currentName && (
            <span style={{ ...CONSOLE_MUTED, fontWeight: 400 }}> · {t("operator.accounts.you")}</span>
          )}
        </span>
      ),
    },
    {
      key: "role",
      title: t("operator.accounts.colRole"),
      align: "left",
      render: (_v, row) => {
        const self = row.name === currentName;
        if (!canManage || self || !row.isActive) {
          return OPERATOR_ROLES.includes(row.role as OperatorRole)
            ? t(ROLE_LABEL[row.role as OperatorRole])
            : row.role;
        }
        const draft = roleDraft[row.id] ?? (row.role as OperatorRole);
        return (
          <Flex gap="small" align="center" wrap>
            <div style={{ minWidth: 160 }}>
              <Select
                aria-label={t("operator.accounts.colRole")}
                options={roleOptions}
                value={draft}
                onChange={(e) =>
                  setRoleDraft((d) => ({ ...d, [row.id]: e.target.value as OperatorRole }))
                }
              />
            </div>
            {draft !== row.role && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => submitChange(row, { kind: "role", role: draft })}
              >
                {t("operator.accounts.saveRole")}
              </Button>
            )}
          </Flex>
        );
      },
    },
    {
      key: "status",
      title: t("operator.accounts.colStatus"),
      align: "left",
      render: (_v, row) =>
        row.isActive ? (
          <Badge variant="success">{t("operator.accounts.active")}</Badge>
        ) : (
          <Badge variant="outline">{t("operator.accounts.inactive")}</Badge>
        ),
    },
    {
      key: "lastLogin",
      title: t("operator.accounts.colLastLogin"),
      align: "left",
      render: (_v, row) => <span style={{ ...CONSOLE_MUTED, ...CONSOLE_TABULAR }}>{row.lastLoginLabel}</span>,
    },
    ...(canManage
      ? ([
          {
            key: "actions",
            title: t("operator.accounts.colActions"),
            align: "left",
            render: (_v, row) => {
              const self = row.name === currentName;
              return (
                <Flex gap="small" wrap>
                  {row.isActive ? (
                    <>
                      {!self && (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={pending}
                          onClick={() => setConfirming({ row, change: { kind: "deactivate" } })}
                        >
                          {t("operator.accounts.deactivate")}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => setConfirming({ row, change: { kind: "revoke" } })}
                      >
                        {t("operator.accounts.revoke")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => setConfirming({ row, change: { kind: "reset" } })}
                      >
                        {t("operator.accounts.reset")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => submitChange(row, { kind: "activate" })}
                    >
                      {t("operator.accounts.activate")}
                    </Button>
                  )}
                </Flex>
              );
            },
          },
        ] satisfies SaiColumns<OperatorAccountView>)
      : []),
  ];

  return (
    <Flex vertical gap="middle">
      {credential && <CredentialBox credential={credential} onDone={() => setCredential(null)} />}
      {message && !credential && (
        <Alert type={message.ok ? "success" : "error"} showIcon message={message.text} />
      )}

      {canManage && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitCreate();
          }}
          style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "var(--ant-margin-sm)" }}
        >
          <div style={{ width: "100%", maxWidth: 240 }}>
            <Input
              name="name"
              label={t("operator.accounts.nameLabel")}
              placeholder={t("operator.accounts.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div style={{ width: "100%", maxWidth: 200 }}>
            <Select
              name="role"
              label={t("operator.accounts.roleLabel")}
              options={roleOptions}
              value={role}
              onChange={(e) => setRole(e.target.value as OperatorRole)}
            />
          </div>
          <Button type="submit" variant="primary" disabled={pending || name.trim().length < 2}>
            {t("operator.accounts.create")}
          </Button>
        </form>
      )}

      <StaticTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        empty={<p style={{ ...CONSOLE_MUTED, padding: "var(--ant-padding-lg)" }}>{t("operator.accounts.empty")}</p>}
      />

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(next) => {
          if (!next) setConfirming(null);
        }}
        title={confirming ? t(confirmCopy(confirming.change).title, { name: confirming.row.name }) : ""}
        message={confirming ? t(confirmCopy(confirming.change).body, { name: confirming.row.name }) : ""}
        confirmVariant={confirming?.change.kind === "deactivate" ? "danger" : "primary"}
        onConfirm={() => {
          if (confirming) submitChange(confirming.row, confirming.change);
          setConfirming(null);
        }}
      />
    </Flex>
  );
}
