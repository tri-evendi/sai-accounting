"use client";

/**
 * Ganti kata sandi wajib — layar pertama yang dilewati SETIAP pengguna baru.
 *
 * Karena posisinya itu, ia juga formulir pertama yang pernah diisi orang di
 * aplikasi ini: apa pun kebiasaan yang ditanamkan di sini akan dibawa ke
 * ~40 formulir berikutnya. Sampai audit ini ia justru satu-satunya formulir
 * yang TIDAK mengikuti MASTER.md §Konvensi Form — `useState` + `fetch` manual,
 * aturan 8 karakter baru berbunyi setelah tombol ditekan, dan semua galat
 * (termasuk "kata sandi saat ini salah") mendarat sebagai satu pita merah di
 * kepala kartu tanpa menyebut field mana yang salah.
 *
 * Sekarang: `react-hook-form` + `zodResolver` dengan `changePasswordSchema`
 * yang field intinya DIPAKAI BERSAMA route handler (aturan 1), pesan inline
 * yang tertaut ke isiannya (aturan 3), dan daftar syarat yang tercentang saat
 * diketik — supaya syaratnya terbaca sebelum gagal, bukan sesudah.
 */

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import { Check, KeyRound } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PasswordField } from "@/components/ui/password-input";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validations/auth";
import { useT, type TranslateFn } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const MIN_LENGTH = 8;

/**
 * Daftar syarat yang hidup.
 *
 * Bukan pengganti `FormMessage` — zod tetap penjaga yang menolak kiriman. Ini
 * lapisan yang menjawab pertanyaan berbeda: "apa yang masih kurang", DI SAAT
 * mengetik, bukan "apa yang salah" setelah menekan tombol. Statusnya tidak
 * pernah disampaikan lewat warna saja (MASTER.md §Anti-Patterns): ikonnya
 * berganti antara centang dan titik, dan tiap baris membawa teks status
 * khusus pembaca layar.
 */
function RequirementList({
  currentPassword,
  newPassword,
  confirmPassword,
  t,
}: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  t: TranslateFn;
}) {
  const rules = [
    {
      key: "length",
      label: t("auth.changePassword.ruleLength", { count: MIN_LENGTH }),
      met: newPassword.length >= MIN_LENGTH,
    },
    {
      key: "different",
      label: t("auth.changePassword.ruleDifferent"),
      met: newPassword.length > 0 && newPassword !== currentPassword,
    },
    {
      key: "match",
      label: t("auth.changePassword.ruleMatch"),
      met: confirmPassword.length > 0 && newPassword === confirmPassword,
    },
  ];

  return (
    <ul className="space-y-2 rounded-lg bg-muted px-4 py-3">
      {rules.map((rule) => (
        <li key={rule.key} className="flex items-start gap-2 text-sm">
          <span
            aria-hidden="true"
            className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors duration-150 motion-reduce:transition-none",
              rule.met
                ? "bg-success text-primary-foreground"
                : "border border-border bg-background"
            )}
          >
            {rule.met && <Check className="h-3 w-3" strokeWidth={3} />}
          </span>
          <span className={rule.met ? "text-success-strong" : "text-muted-foreground"}>
            {rule.label}
            <span className="sr-only">
              {" — "}
              {rule.met ? t("auth.changePassword.ruleMet") : t("auth.changePassword.ruleUnmet")}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const { update } = useSession();
  const t = useT();

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    // Syarat terbaca sambil diketik lewat daftar di atas; pesan galat resmi
    // baru muncul setelah field ditinggalkan, supaya field yang belum selesai
    // diketik tidak dimerahkan pada karakter pertama.
    mode: "onBlur",
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  /*
   * `useWatch`, bukan `form.watch()`.
   *
   * Keduanya membaca nilai yang sama, tetapi `watch()` adalah fungsi yang
   * dikembalikan `useForm` dan React Compiler menolak memoisasi komponen yang
   * memanggilnya (`react-hooks/incompatible-library`) — seluruh layar ini
   * kehilangan optimasinya demi tiga nilai. `useWatch` adalah hook berlangganan
   * yang memang disediakan react-hook-form untuk keperluan ini.
   */
  const [currentPassword, newPassword, confirmPassword] = useWatch({
    control: form.control,
    name: ["currentPassword", "newPassword", "confirmPassword"],
  });

  async function onSubmit(values: ChangePasswordInput) {
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      // Server tetap penjaga terakhir (aturan 7): galat berlabel field
      // mendarat di fieldnya, sisanya jadi galat form.
      const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
      const known = ["currentPassword", "newPassword"] as const;
      let placed = false;
      for (const name of known) {
        const message = fieldErrors?.[name]?.[0];
        if (message) {
          form.setError(name, { message });
          placed = true;
        }
      }
      if (!placed) {
        form.setError("root", { message: data?.error || t("auth.changePassword.failed") });
      }
      return;
    }

    /*
     * Segarkan token SEBELUM berpindah.
     *
     * `mustChangePassword` hidup di dalam JWT dan hanya disegarkan tiap 60
     * detik; `proxy.ts` membaca tanda itu untuk memantulkan setiap tujuan
     * kembali ke halaman ini. Tanpa baris ini, kata sandi yang BERHASIL
     * diganti tetap berujung di formulir yang sama — kegagalan yang paling
     * membingungkan justru karena tidak ada galat apa pun yang menyertainya.
     */
    const next = await update({ passwordChanged: true });

    // Belum ada perusahaan aktif = pemegang lebih dari satu PT yang belum
    // memilih. Dikirim langsung ke pemilihnya, bukan lewat beranda yang toh
    // akan memantulkannya ke sana.
    router.replace(next?.user?.companyId == null ? "/select-company" : "/dashboard");
    router.refresh();
  }

  return (
    <AuthShell
      heading={t("auth.changePassword.heading")}
      description={t("auth.changePassword.description")}
      error={form.formState.errors.root?.message}
      icon={<KeyRound className="h-5 w-5" aria-hidden />}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
          <FormField
            control={form.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t("auth.changePassword.current")}</FormLabel>
                <FormControl>
                  <PasswordField
                    autoComplete="current-password"
                    autoFocus
                    disabled={form.formState.isSubmitting}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t("auth.changePassword.new")}</FormLabel>
                <FormControl>
                  <PasswordField
                    autoComplete="new-password"
                    disabled={form.formState.isSubmitting}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t("auth.changePassword.confirm")}</FormLabel>
                <FormControl>
                  <PasswordField
                    autoComplete="new-password"
                    disabled={form.formState.isSubmitting}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <RequirementList
            currentPassword={currentPassword}
            newPassword={newPassword}
            confirmPassword={confirmPassword}
            t={t}
          />

          <p className="text-xs text-muted-foreground">{t("auth.changePassword.hint")}</p>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting
              ? t("auth.changePassword.submitting")
              : t("auth.changePassword.submit")}
          </Button>
        </form>
      </Form>
    </AuthShell>
  );
}
