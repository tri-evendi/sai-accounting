"use client";

/**
 * Layar PASANG AUTHENTICATOR — dua langkah untuk akun yang sedang masuk:
 *
 *   1. Bukti ulang (kata sandi, + kode bila MFA hidup) → QR + rahasia teks.
 *   2. Ketik satu kode dari aplikasinya → server memverifikasi dan mencatat.
 *
 * Akun basis data punya jalur kedua di langkah 1: "buat rahasia baru". QR-nya
 * rahasia BARU, dan yang lama tetap berlaku sampai langkah 2 berhasil — jadi
 * menutup layar di tengah jalan tidak mengunci siapa pun.
 *
 * Rahasia hanya hidup di state komponen ini (pola kotak kredensial
 * `/accounts`): tidak di URL, tidak di cache, dan dibuang begitu konfirmasi
 * berhasil atau tombol "Tutup" ditekan. Semua aturan ditegakkan di server
 * action; layar ini hanya permukaan.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Flex } from "antd";

import { Button } from "@sai/ui/button";
import { Input } from "@sai/ui/input";
import { PasswordInput } from "@sai/ui/password-input";
import { useT } from "@sai/core/i18n/client";
import { CONSOLE_MUTED } from "@op/components/operator/console-ui";
import { QrCode } from "@op/components/operator/qr-code";
import type { AuthenticatorActionResult } from "@op/app/(operator)/accounts/authenticator/actions";
import type { AuthenticatorEnrolment } from "@op/lib/operator/authenticator";

export interface AuthenticatorSetupProps {
  /** `OPERATOR_MFA=off` — bukti ulang cukup kata sandi. */
  mfaOff: boolean;
  /** Akun basis data bisa memutar rahasianya sendiri; akun env tidak. */
  canRotate: boolean;
  reveal: (input: {
    password: string;
    code: string;
    mode: "current" | "rotate";
  }) => Promise<AuthenticatorActionResult>;
  confirm: (input: { code: string; ticket?: string }) => Promise<AuthenticatorActionResult>;
}

const CODE: React.CSSProperties = {
  fontFamily: "var(--ant-font-family-code)",
  wordBreak: "break-all",
  userSelect: "all",
};

export function AuthenticatorSetup({ mfaOff, canRotate, reveal, confirm }: AuthenticatorSetupProps) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [enrolment, setEnrolment] = useState<AuthenticatorEnrolment | null>(null);
  const [ticket, setTicket] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function discard() {
    setEnrolment(null);
    setTicket(undefined);
    setConfirmCode("");
  }

  function submitReveal(mode: "current" | "rotate") {
    startTransition(async () => {
      const result = await reveal({ password, code: mfaOff ? "" : currentCode, mode });
      /* Kata sandi tidak disimpan lebih lama dari satu permintaan. */
      setPassword("");
      setCurrentCode("");
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok && result.enrolment) {
        setEnrolment(result.enrolment);
        setTicket(result.ticket);
      }
    });
  }

  function submitConfirm() {
    startTransition(async () => {
      const result = await confirm({ code: confirmCode, ticket });
      setMessage({ ok: result.ok, text: result.message });
      setConfirmCode("");
      if (result.ok) {
        discard();
        router.refresh();
      }
    });
  }

  const feedback = message && (
    <Alert type={message.ok ? "success" : "error"} showIcon message={message.text} />
  );

  if (!enrolment) {
    return (
      <Flex vertical gap="middle">
        {feedback}
        <p style={CONSOLE_MUTED}>
          {t(mfaOff ? "operator.authenticator.reauthHintNoMfa" : "operator.authenticator.reauthHint")}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitReveal("current");
          }}
        >
          <Flex vertical gap="middle" style={{ maxWidth: 360 }}>
            <PasswordInput
              name="password"
              label={t("operator.login.password")}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {!mfaOff && (
              <Input
                name="totp"
                label={t("operator.authenticator.currentCode")}
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                value={currentCode}
                onChange={(e) => setCurrentCode(e.target.value)}
                required
              />
            )}
            <Flex gap="small" wrap>
              <Button type="submit" variant="primary" disabled={pending || password.length === 0}>
                {t("operator.authenticator.showQr")}
              </Button>
              {canRotate && (
                <Button
                  variant="outline"
                  disabled={pending || password.length === 0}
                  onClick={() => submitReveal("rotate")}
                >
                  {t("operator.authenticator.rotate")}
                </Button>
              )}
            </Flex>
          </Flex>
        </form>
      </Flex>
    );
  }

  return (
    <Flex vertical gap="middle">
      {feedback}
      <ol style={{ margin: 0, paddingInlineStart: "var(--ant-padding-lg)", lineHeight: 1.625 }}>
        <li>{t("operator.authenticator.step1")}</li>
        <li>{t("operator.authenticator.step2")}</li>
        <li>{t(ticket ? "operator.authenticator.step3Rotate" : "operator.authenticator.step3")}</li>
      </ol>

      <Flex gap="large" wrap align="flex-start">
        <QrCode qr={enrolment.qr} label={t("operator.authenticator.qrLabel", { name: enrolment.account })} />
        <Flex vertical gap="small" style={{ flex: "1 1 240px", minWidth: 0 }}>
          <span style={CONSOLE_MUTED}>{t("operator.authenticator.manualEntry")}</span>
          <span>
            {t("operator.authenticator.accountLabel")}: <code style={CODE}>{enrolment.account}</code>
          </span>
          <span>
            {t("operator.accounts.credentialTotp")}: <code style={CODE}>{enrolment.secretGrouped}</code>
          </span>
          <span style={CONSOLE_MUTED}>{t("operator.authenticator.manualParams")}</span>
        </Flex>
      </Flex>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitConfirm();
        }}
        style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "var(--ant-margin-sm)" }}
      >
        <div style={{ width: "100%", maxWidth: 200 }}>
          <Input
            name="confirm-code"
            label={t("operator.authenticator.confirmCode")}
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            value={confirmCode}
            onChange={(e) => setConfirmCode(e.target.value)}
            required
          />
        </div>
        <Button type="submit" variant="primary" disabled={pending || !/^\d{6}$/.test(confirmCode)}>
          {t("operator.authenticator.confirm")}
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => { discard(); setMessage(null); }}>
          {t("operator.authenticator.close")}
        </Button>
      </form>
    </Flex>
  );
}
