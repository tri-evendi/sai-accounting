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
 *
 * ══ SATU TAB, SATU BAGIAN ═════════════════════════════════════════════════
 * Sejak `/settings` dibagi tab (Pendaftaran & uji coba · Tagihan & PPN · Harga
 * publik · Kontak · Retensi), formulir ini merender HANYA medan bagiannya
 * (`section`) dan mengirim hanya medan itu (`siteSettingsSectionSchema`).
 * Menyimpan nomor WhatsApp tidak ikut menulis ulang gerbang PPN yang tidak
 * terlihat di tab itu. "Kembalikan ke pengaturan server" (`SiteSettingsReset`)
 * tetap SATU tombol untuk seluruh baris — konfirmasinya menyebut itu.
 *
 * Gerbang KETIGA, harga di situs publik (migration platform 0013), justru DUA
 * keadaan: ia tidak punya env untuk diikuti, dan `null` di kolom sudah berarti
 * tampil — jadi tidak ada keputusan `.env` yang bisa dirampas. Konfirmasinya
 * ikut pola yang sama: hanya bila berubah, dan menyebut akibatnya.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, theme } from "antd";

import { Button } from "@sai/ui/button";
import { ConfirmDialog } from "@sai/ui/confirm-dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@sai/ui/form";
import { TextInput } from "@sai/ui/input";
import { SelectField } from "@sai/ui/select";
import { Textarea } from "@sai/ui/textarea";
import { useT } from "@sai/core/i18n/client";
import {
  siteSettingsSectionSchema,
  type SiteSettingsFormInput,
  type SiteSettingsSection,
  type SiteSettingsSectionFormInput,
} from "@op/lib/validations/operator";
import type { OperatorSettingsResult } from "@op/app/(operator)/settings/actions";

/** Medan milik tiap bagian — satu tempat, dipakai nilai awal & kiriman. */
const SECTION_FIELDS: Record<SiteSettingsSection, (keyof SiteSettingsFormInput)[]> = {
  signup: ["selfServeSignup"],
  billing: ["ppn", "manualPaymentInstructions"],
  pricing: ["publicPricing"],
  contact: ["contactWhatsapp", "contactEmail"],
};

export interface SiteSettingsFormProps {
  /** Bagian (tab) yang dirender & disimpan formulir ini. */
  section: SiteSettingsSection;
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
  save: (input: SiteSettingsSectionFormInput) => Promise<OperatorSettingsResult>;
}

export function SiteSettingsForm({ section, initial, fromDb, envGates, save }: SiteSettingsFormProps) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const [result, setResult] = useState<OperatorSettingsResult | null>(null);
  /** Nilai yang menunggu konfirmasi gerbang — `null` = tidak ada yang menunggu. */
  const [pendingGates, setPendingGates] = useState<SiteSettingsSectionFormInput | null>(null);

  const defaults: SiteSettingsSectionFormInput = { section };
  for (const key of SECTION_FIELDS[section]) {
    (defaults as Record<string, unknown>)[key] = initial[key];
  }
  const form = useForm<SiteSettingsSectionFormInput>({
    resolver: zodResolver(siteSettingsSectionSchema) as unknown as Resolver<SiteSettingsSectionFormInput>,
    defaultValues: defaults,
  });

  /** Dari mana nilai medan ini berasal — dikatakan di bawah setiap isian. */
  const sumber = (db: boolean) =>
    db ? t("operator.settings.fromDb") : t("operator.settings.fromEnv");

  /** Tiga pilihan yang sama untuk kedua gerbang. */
  const gateOptions = (envValue: boolean) => [
    {
      value: "env",
      label: `${t("operator.settings.gateEnv")} (${
        envValue ? t("operator.settings.gateOn") : t("operator.settings.gateOff")
      })`,
    },
    { value: "on", label: t("operator.settings.gateOn") },
    { value: "off", label: t("operator.settings.gateOff") },
  ];

  /** Kalimat akibat untuk gerbang yang BERUBAH — kosong bila tak ada. */
  const gateWarnings = (values: SiteSettingsSectionFormInput): string[] => {
    const out: string[] = [];
    if (section === "signup" && values.selfServeSignup !== initial.selfServeSignup) {
      out.push(t("operator.settings.signupConfirm"));
    }
    if (section === "billing" && values.ppn !== initial.ppn) out.push(t("operator.settings.ppnConfirm"));
    if (section === "pricing" && values.publicPricing !== initial.publicPricing) {
      out.push(
        t(
          values.publicPricing === "on"
            ? "operator.settings.pricingShowConfirm"
            : "operator.settings.pricingHideConfirm"
        )
      );
    }
    return out;
  };

  const simpan = async (values: SiteSettingsSectionFormInput) => {
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
          {section === "contact" && (
            <>
              <FormField
                control={form.control}
                name="contactWhatsapp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("operator.settings.whatsappLabel")}</FormLabel>
                    <FormControl>
                      <TextInput {...field} value={field.value ?? ""} inputMode="numeric" placeholder="628123456789" />
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
                      <TextInput {...field} value={field.value ?? ""} inputMode="email" placeholder="sales@contoh.id" />
                    </FormControl>
                    <FormDescription>
                      {t("operator.settings.emailHint")} · {sumber(fromDb.email)}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* Kotak kosong = CABUT, bukan "pakai env" — dikatakan sebelum
                  tombol simpan, bukan sesudah orang kehilangan kanalnya. */}
              <p style={{ margin: 0, fontSize: token.fontSize, color: token.colorTextSecondary }}>
                {t("operator.settings.emptyMeans")}
              </p>
            </>
          )}

          {section === "signup" && (
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
          )}

          {section === "billing" && (
            <>
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
              <FormField
                control={form.control}
                name="manualPaymentInstructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("operator.settings.paymentLabel")}</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value ?? ""} rows={3} />
                    </FormControl>
                    <FormDescription>
                      {t("operator.settings.paymentHint")} · {sumber(fromDb.payment)}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

          {/* Harga publik (migration platform 0013) — dua keadaan, tanpa env:
              tidak ada "ikut pengaturan server" untuk ditawarkan. */}
          {section === "pricing" && (
            <FormField
              control={form.control}
              name="publicPricing"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("operator.settings.pricingLabel")}</FormLabel>
                  <FormControl>
                    <SelectField
                      {...field}
                      options={[
                        { value: "on", label: t("operator.settings.pricingShow") },
                        { value: "off", label: t("operator.settings.pricingHide") },
                      ]}
                    />
                  </FormControl>
                  <FormDescription>{t("operator.settings.pricingHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {result && <Alert type="success" showIcon message={result.message} />}
          {form.formState.errors.root?.message && (
            <Alert type="error" showIcon message={form.formState.errors.root.message} />
          )}

          <Flex wrap gap={token.marginXS}>
            <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t("common.saving") : t("common.save")}
            </Button>
          </Flex>
        </Flex>

        {/* Gerbang yang berubah disebut AKIBATNYA — bukan "Anda yakin?"
            (MASTER.md §Form). */}
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
      </form>
    </Form>
  );
}

/**
 * "Kembalikan ke pengaturan server" — MENGHAPUS barisnya, jadi SEMUA nilai di
 * semua tab kembali ke `.env`/bawaan. Satu tombol untuk seluruh halaman,
 * bukan per tab, dan konfirmasinya menyebut akibatnya (MASTER.md §Form).
 */
export function SiteSettingsReset({ reset }: { reset: () => Promise<OperatorSettingsResult> }) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<OperatorSettingsResult | null>(null);

  return (
    <Flex vertical gap={token.marginXS} align="flex-start">
      {result && <Alert type={result.ok ? "success" : "error"} showIcon message={result.message} />}
      <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
        {t("operator.settings.resetSubmit")}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("operator.settings.resetSubmit")}
        message={t("operator.settings.resetConfirm")}
        confirmLabel={t("operator.settings.resetSubmit")}
        onConfirm={async () => {
          const res = await reset();
          setResult(res);
          router.refresh();
        }}
      />
    </Flex>
  );
}
