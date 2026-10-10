"use client";

/**
 * FORMULIR PENGATURAN SITUS — tiga nilai yang berhenti menuntut SSH.
 *
 * ══ YANG DIKATAKAN LAYAR INI, DAN KENAPA ═══════════════════════════════════
 * Setiap isian menyebut **dari mana nilainya sekarang berasal**: basis data
 * (disetel dari konsol) atau environment (`.env` di server). Tanpa itu,
 * operator yang melihat kotak terisi tidak bisa tahu apakah mengosongkannya
 * akan mencabut kanalnya atau "mengembalikannya ke env" — dua maksud yang
 * sangat berbeda dan, di formulir HTML, tidak bisa dibedakan dari satu kotak
 * teks. Karena itu:
 *
 *   • kotak KOSONG saat disimpan = **cabut kanalnya**;
 *   • "Kembalikan ke environment" = tombol TERSENDIRI yang menghapus barisnya.
 *
 * Keduanya dinyatakan di layar, bukan disimpan sebagai pengetahuan operator.
 *
 * ══ DUA GERBANG DI BAWAH ISIAN, DAN KENAPA BENTUKNYA BUKAN SAKELAR ═════════
 * Pendaftaran mandiri dan PPN adalah PILIHAN TIGA KEADAAN, bukan dua:
 * *ikut pengaturan server* · *nyala* · *mati*. Sebuah sakelar dua posisi akan
 * memaksa layar ini menjawab pertanyaan yang belum ditanyakan siapa pun —
 * sekali ia dirender dalam keadaan "mati", menyimpan formulir kontak akan ikut
 * merampas keputusan dari `.env` tanpa ada yang memintanya.
 *
 * Keduanya lewat KONFIRMASI yang menyebut akibatnya, bukan "Anda yakin?":
 * yang pertama membuka corong komersial kepada publik, yang kedua mengubah
 * NOMINAL yang benar-benar ditagih — termasuk oleh penjadwal di luar Next.
 * Konfirmasinya muncul HANYA bila salah satu gerbang berubah; menyunting nomor
 * WhatsApp tidak perlu melewati dialog tentang pajak.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, theme } from "antd";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { TextInput } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/client";
import { siteSettingsSchema, type SiteSettingsFormInput } from "@/lib/validations/operator";
import type { OperatorSettingsResult } from "@/app/(app)/(operator)/operator/settings/actions";

export interface SiteSettingsFormProps {
  /** Nilai awal = yang BERLAKU sekarang (DB bila ada, kalau tidak env). */
  initial: SiteSettingsFormInput;
  /** Per medan: apakah nilainya datang dari basis data atau dari environment. */
  fromDb: { whatsapp: boolean; email: boolean; payment: boolean };
  /**
   * Nilai gerbang yang BERLAKU bila pilihannya "ikut pengaturan server".
   *
   * Dihitung di server dari `.env` — tidak bisa dihitung di sini: client tidak
   * melihat environment, dan menebaknya berarti layar yang mengatakan
   * "pendaftaran terbuka" pada kotak yang sesungguhnya menutupnya.
   */
  envGates: { signupOpen: boolean; ppnEnabled: boolean };
  /** Ada barisnya di basis data — menentukan perlu-tidaknya tombol kembalikan. */
  rowExists: boolean;
  save: (input: SiteSettingsFormInput) => Promise<OperatorSettingsResult>;
  reset: () => Promise<OperatorSettingsResult>;
}

export function SiteSettingsForm({
  initial,
  fromDb,
  envGates,
  rowExists,
  save,
  reset,
}: SiteSettingsFormProps) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const [result, setResult] = useState<OperatorSettingsResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  /** Nilai yang menunggu konfirmasi gerbang — `null` = tidak ada yang menunggu. */
  const [pendingGates, setPendingGates] = useState<SiteSettingsFormInput | null>(null);

  const form = useForm<SiteSettingsFormInput>({
    resolver: zodResolver(siteSettingsSchema) as Resolver<SiteSettingsFormInput>,
    defaultValues: initial,
  });

  /** Dari mana nilai medan ini berasal — dikatakan di bawah setiap isian. */
  const sumber = (db: boolean) =>
    db ? t("operator.settings.fromDb") : t("operator.settings.fromEnv");

  /** Tiga pilihan yang sama untuk kedua gerbang. */
  const gateOptions = (envValue: boolean) => [
    {
      value: "env",
      label: `${t("operator.settings.gateEnv")} — ${
        envValue ? t("operator.settings.gateOn") : t("operator.settings.gateOff")
      }`,
    },
    { value: "on", label: t("operator.settings.gateOn") },
    { value: "off", label: t("operator.settings.gateOff") },
  ];

  /** Kalimat akibat untuk gerbang yang BERUBAH — kosong bila tak ada. */
  const gateWarnings = (values: SiteSettingsFormInput): string[] => {
    const out: string[] = [];
    if (values.selfServeSignup !== initial.selfServeSignup) {
      out.push(t("operator.settings.signupConfirm"));
    }
    if (values.ppn !== initial.ppn) out.push(t("operator.settings.ppnConfirm"));
    return out;
  };

  const simpan = async (values: SiteSettingsFormInput) => {
    setResult(null);
    const res = await save(values);
    if (!res.ok) {
      form.setError("root", { message: res.message });
      return;
    }
    setResult(res);
    /* Dibaca ULANG dari server: label "dari basis data / dari environment"
       berubah setelah simpan, dan menebaknya di client berarti dua kebenaran. */
    router.refresh();
  };

  const onSubmit = form.handleSubmit(async (values) => {
    /* Gerbang berubah → konfirmasi lebih dulu. Menyunting nomor telepon tidak
       pernah melewati dialog tentang pajak; lihat kepala berkas. */
    if (gateWarnings(values).length > 0) {
      setPendingGates(values);
      return;
    }
    await simpan(values);
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate>
        <Flex vertical gap={token.marginLG} style={{ maxWidth: 560 }}>
          <FormField
            control={form.control}
            name="contactWhatsapp"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("operator.settings.whatsappLabel")}</FormLabel>
                <FormControl>
                  <TextInput {...field} inputMode="numeric" placeholder="628123456789" />
                </FormControl>
                <FormDescription>
                  {t("operator.settings.whatsappHint")} · {sumber(fromDb.whatsapp)}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="contactEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("operator.settings.emailLabel")}</FormLabel>
                <FormControl>
                  <TextInput {...field} inputMode="email" placeholder="sales@contoh.id" />
                </FormControl>
                <FormDescription>
                  {t("operator.settings.emailHint")} · {sumber(fromDb.email)}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="manualPaymentInstructions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("operator.settings.paymentLabel")}</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} />
                </FormControl>
                <FormDescription>
                  {t("operator.settings.paymentHint")} · {sumber(fromDb.payment)}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Kotak kosong = CABUT, bukan "pakai env" — dikatakan sebelum tombol
              simpan, bukan sesudah orang kehilangan kanalnya. */}
          <p style={{ margin: 0, fontSize: token.fontSize, color: token.colorTextSecondary }}>
            {t("operator.settings.emptyMeans")}
          </p>

          {/* ══ GERBANG ══ Dipisah dari isian di atas oleh judulnya sendiri:
              yang di atas adalah ISI yang dipajang, yang di bawah MENGUBAH
              perilaku — pendaftaran dan nominal tagihan. */}
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: token.fontSizeLG,
                fontWeight: 600,
                color: token.colorText,
              }}
            >
              {t("operator.settings.gatesHeading")}
            </h2>
            <p
              style={{
                margin: `${token.marginXXS}px 0 0`,
                fontSize: token.fontSize,
                color: token.colorTextSecondary,
                lineHeight: 1.625,
              }}
            >
              {t("operator.settings.gatesIntro")}
            </p>
          </div>

          <FormField
            control={form.control}
            name="selfServeSignup"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("operator.settings.signupLabel")}</FormLabel>
                <FormControl>
                  <SelectField {...field} options={gateOptions(envGates.signupOpen)} />
                </FormControl>
                <FormDescription>{t("operator.settings.signupHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="ppn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("operator.settings.ppnLabel")}</FormLabel>
                <FormControl>
                  <SelectField {...field} options={gateOptions(envGates.ppnEnabled)} />
                </FormControl>
                <FormDescription>{t("operator.settings.ppnHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {result && <Alert type="success" showIcon message={result.message} />}
          {form.formState.errors.root?.message && (
            <Alert type="error" showIcon message={form.formState.errors.root.message} />
          )}

          <Flex wrap gap={token.marginXS}>
            <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("common.saving") : t("common.save")}
            </Button>
            {rowExists && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setConfirming(true)}
              >
                {t("operator.settings.resetSubmit")}
              </Button>
            )}
          </Flex>
        </Flex>

        {/* Gerbang yang berubah disebut AKIBATNYA, satu kalimat per gerbang —
            bukan "Anda yakin?" (MASTER.md §Form). Keduanya bisa berubah dalam
            satu simpan, jadi pesannya digabung alih-alih dua dialog berurutan. */}
        <ConfirmDialog
          open={pendingGates !== null}
          onOpenChange={(open) => {
            if (!open) setPendingGates(null);
          }}
          title={t("operator.settings.gateConfirmTitle")}
          message={pendingGates ? gateWarnings(pendingGates).join(" ") : ""}
          confirmLabel={t("common.save")}
          onConfirm={async () => {
            const values = pendingGates;
            setPendingGates(null);
            if (values) await simpan(values);
          }}
        />

        {/* Mengembalikan ke environment MENGHAPUS barisnya — pesannya menyebut
            akibatnya, bukan "Anda yakin?" (MASTER.md §Form). */}
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={t("operator.settings.resetSubmit")}
          message={t("operator.settings.resetConfirm")}
          confirmLabel={t("operator.settings.resetSubmit")}
          onConfirm={async () => {
            const res = await reset();
            setResult(res.ok ? res : null);
            if (!res.ok) form.setError("root", { message: res.message });
            router.refresh();
          }}
        />
      </form>
    </Form>
  );
}
