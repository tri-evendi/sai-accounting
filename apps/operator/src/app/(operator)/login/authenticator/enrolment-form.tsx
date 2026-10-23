"use client";

/**
 * Isian kode di halaman pemasangan: satu kode 6 digit dari aplikasi yang baru
 * memindai QR-nya. Semua aturan di server action (`enrolmentConfirm`); layar
 * ini hanya permukaan (pola `login-form.tsx`).
 *
 * Sesi pemasangan yang habis → pesan + tombol kembali ke login (pemuatan
 * penuh yang disengaja: halaman login digambar ulang tanpa cookie lama).
 */
import { useActionState } from "react";
import { Alert, Flex } from "antd";

import { Button } from "@sai/ui/button";
import { Input } from "@sai/ui/input";
import { useT } from "@sai/core/i18n/client";
import { enrolmentConfirm, type EnrolmentFormState } from "./actions";

const INITIAL_STATE: EnrolmentFormState = { error: null };

export function EnrolmentForm() {
  const t = useT();
  const [state, formAction, pending] = useActionState(enrolmentConfirm, INITIAL_STATE);

  if (state.expired) {
    return (
      <Flex vertical gap="middle">
        <Alert type="warning" showIcon message={state.error} />
        <Button href="/login" variant="primary">
          {t("operator.enrol.backToLogin")}
        </Button>
      </Flex>
    );
  }

  return (
    <form action={formAction}>
      <Flex vertical gap="middle">
        <div style={{ width: "100%", maxWidth: 240 }}>
          <Input
            name="code"
            label={t("operator.authenticator.confirmCode")}
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            required
          />
        </div>
        {state.error && <Alert type="error" showIcon message={state.error} />}
        <div>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? t("common.loading") : t("operator.enrol.submit")}
          </Button>
        </div>
      </Flex>
    </form>
  );
}
