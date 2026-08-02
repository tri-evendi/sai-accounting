"use client";

/**
 * Form masuk konsol operator (issue #154) — tiga isian, satu langkah:
 * nama akun + kata sandi + kode TOTP diverifikasi BERSAMA di server action
 * (`operatorLogin`), dan jawab gagalnya seragam. MFA bukan langkah kedua yang
 * bisa dilewati — tanpa kode, tombolnya memang tidak mengirim.
 *
 * Pola form login pelanggan (isian terkendali sederhana + pesan galat
 * `role="alert"`), bukan react-hook-form: tidak ada validasi per-field yang
 * berarti di sisi client — satu-satunya jawaban yang jujur datang dari server,
 * dan ia sengaja tidak menunjuk field.
 */

import { useActionState } from "react";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useT } from "@/lib/i18n/client";
import { operatorLogin, type OperatorLoginState } from "../actions";

const INITIAL_STATE: OperatorLoginState = { error: null };

export function OperatorLoginForm() {
  const t = useT();
  const [state, formAction, pending] = useActionState(operatorLogin, INITIAL_STATE);

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-6 space-y-1.5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {t("operator.login.heading")}
          </h1>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("operator.login.description")}
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <Input
          name="username"
          label={t("operator.login.username")}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <PasswordInput
          name="password"
          label={t("operator.login.password")}
          autoComplete="current-password"
          required
        />
        <div className="space-y-1">
          <Input
            name="totp"
            label={t("operator.login.totp")}
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("operator.login.totpHint")}
          </p>
        </div>

        {state.error && (
          <p role="alert" className="rounded-lg bg-destructive-soft p-3 text-sm text-destructive-strong">
            {state.error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t("common.loading") : t("operator.login.submit")}
        </Button>
      </form>
    </div>
  );
}
