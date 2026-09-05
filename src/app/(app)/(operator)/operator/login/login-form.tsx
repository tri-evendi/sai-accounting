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
 *
 * ⚠ `role="alert"` tinggal di PEMBUNGKUS `Alert`, bukan pada `Alert` itu
 * sendiri: `Alert` AntD menyaring propnya lewat `pickAttrs(props, { aria: true,
 * data: true })`, jadi peran yang dioper ke sana hilang tanpa satu pun galat —
 * dan pesan gagal masuk yang tidak diumumkan adalah pesan yang tidak ada bagi
 * pengguna pembaca layar.
 *
 * Komponen ini TIDAK mengimpor apa pun dari sisi pelanggan: konsol operator
 * berjalan di domain terpisah dan tidak boleh mewarisi konteks perusahaan.
 */

import { useActionState } from "react";
import { Alert, Flex, Typography, theme } from "antd";
import { KeyOutlined } from "@ant-design/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useT } from "@/lib/i18n/client";
import { operatorLogin, type OperatorLoginState } from "../actions";

const { Title, Text } = Typography;

const INITIAL_STATE: OperatorLoginState = { error: null };

export function OperatorLoginForm({ mfaOff = false }: { mfaOff?: boolean }) {
  const t = useT();
  const { token } = theme.useToken();
  const [state, formAction, pending] = useActionState(operatorLogin, INITIAL_STATE);

  return (
    /* `Card` menggantikan kotak bergaris tulis tangan — sekaligus membawa
       permukaan & tepi token AntD, yang di tema gelap adalah satu-satunya yang
       memisahkan kartu dari halamannya. */
    <Card>
      <CardContent>
        <Flex vertical gap={token.marginLG}>
          <Flex vertical gap={token.marginXXS}>
            <Flex align="center" gap={token.marginXS}>
              <KeyOutlined aria-hidden="true" style={{ fontSize: 20, color: token.colorPrimary }} />
              <Title level={1} style={{ fontSize: token.fontSizeHeading4, marginBlock: 0 }}>
                {t("operator.login.heading")}
              </Title>
            </Flex>
            <Text type="secondary">{t("operator.login.description")}</Text>
          </Flex>

          <form action={formAction}>
            <Flex vertical gap={token.margin}>
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
              {/*
                * Medan TOTP HILANG sepenuhnya saat `OPERATOR_MFA=off`, bukan
                * sekadar tidak `required`.
                *
                * Sebabnya cacat sungguhan: sakelar itu melewati verifikasi di
                * SERVER, tetapi medan ini `required` + `pattern="[0-9]{6}"`,
                * jadi peramban menolak mengirim formulirnya sampai enam angka
                * diisi. Akibatnya MFA "sudah dimatikan" tetapi tidak ada yang
                * bisa masuk — dan penyebabnya tak terlihat di log mana pun,
                * sebab permintaannya tidak pernah sampai ke server.
                *
                * Medan opsional yang diabaikan akan lebih buruk lagi: ia
                * meminta sesuatu yang tidak berarti apa-apa, dan orang yang
                * mengisinya salah akan mengira ITU sebab gagalnya.
                */}
              {!mfaOff && (
                <Flex vertical gap={token.marginXXS}>
                  <Input
                    name="totp"
                    label={t("operator.login.totp")}
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    required
                  />
                  <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    {t("operator.login.totpHint")}
                  </Text>
                </Flex>
              )}

              {state.error && (
                /* `Alert` AntD sudah `role="alert"` sendiri; pembungkus tak menambah apa pun — lihat /forgot-password. */
                <Alert type="error" showIcon message={state.error} />
              )}

              <Button type="submit" variant="primary" style={{ width: "100%" }} disabled={pending}>
                {pending ? t("common.loading") : t("operator.login.submit")}
              </Button>
            </Flex>
          </form>
        </Flex>
      </CardContent>
    </Card>
  );
}
