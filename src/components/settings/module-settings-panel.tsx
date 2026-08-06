"use client";

/**
 * Kartu "Modul Usaha" di halaman Pengaturan (issue #99) — permukaan pengelolaan
 * modul setelah penyiapan.
 *
 * Kenapa DI SINI, bukan di /permissions: modul menjawab "perusahaan ini
 * bidangnya apa" — satu keluarga dengan profil & identitas pajak perusahaan —
 * sedangkan /permissions menjawab "siapa boleh apa". Menaruhnya di matriks izin
 * akan mengaburkan justru perbedaan yang paling penting dijaga fitur ini: modul
 * TIDAK memberi atau mencabut izin siapa pun. Halaman /permissions tetap ikut
 * berubah — baris untuk modul non-aktif disembunyikan di sana, dengan tautan
 * kembali ke kartu ini.
 *
 * Panel hanya dirender bila server menilai penggunanya memegang
 * `company_setting.manage` (dihitung di `settings/page.tsx` terhadap matriks
 * EFEKTIF, pola panel Audit). API-nya ber-gate izin yang sama — pertahanan
 * berlapis, bukan tampilan yang menjaga dirinya sendiri.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Flex, Typography, theme } from "antd";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { ModulePicker } from "@/components/settings/module-picker";
import {
  BUSINESS_MODULES,
  isBusinessCategory,
  modulesForCategory,
  normalizeEnabledModules,
  validateEnabledModules,
  type BusinessCategory,
  type BusinessModule,
} from "@/lib/business-modules";
import { useT } from "@/lib/i18n/client";
import { Save } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";

interface ModulesResponse {
  businessCategory: string | null;
  modules: BusinessModule[];
}

export function ModuleSettingsPanel() {
  const t = useT();
  const { token } = theme.useToken();
  const router = useRouter();
  const { toast } = useToast();
  const [saved, setSaved] = useState<ModulesResponse | null>(null);
  const [category, setCategory] = useState<BusinessCategory | "">("");
  const [modules, setModules] = useState<ReadonlySet<BusinessModule>>(new Set(BUSINESS_MODULES));
  const [loadError, setLoadError] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/company-settings/modules");
      if (!res.ok) throw new Error(t("modules.errLoad"));
      const json = (await res.json()) as ModulesResponse;
      setSaved(json);
      setModules(new Set(json.modules));
      setCategory(
        json.businessCategory && isBusinessCategory(json.businessCategory)
          ? json.businessCategory
          : ""
      );
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Preset = NILAI AWAL: ia mengisi daftar centang, tidak mengunci apa pun. */
  function pickCategory(next: BusinessCategory) {
    setCategory(next);
    setModules(new Set(modulesForCategory(next)));
    setErrors([]);
  }

  function toggle(module: BusinessModule, next: boolean) {
    setErrors([]);
    setModules((prev) => {
      const draft = new Set(prev);
      if (next) draft.add(module);
      else draft.delete(module);
      return draft;
    });
  }

  const chosen = normalizeEnabledModules(modules);
  const isDirty =
    !!saved &&
    (chosen.join(",") !== normalizeEnabledModules(saved.modules).join(",") ||
      (category || null) !== (saved.businessCategory ?? null));

  async function submit() {
    // Umpan balik seketika di client; server tetap penjaga terakhir.
    const found = validateEnabledModules(chosen);
    if (found.length > 0) {
      setErrors(found);
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/company-settings/modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessCategory: category || null, modules: chosen }),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = (json as { error?: string }).error ?? t("modules.errSave");
        setErrors((json as { errors?: string[] }).errors ?? [message]);
        toast(message, "error");
        return;
      }
      const next = json as ModulesResponse;
      setSaved(next);
      setModules(new Set(next.modules));
      setErrors([]);
      toast(t("modules.saved"));
      // Tanpa ini permukaan yang dirender server (banner, halaman yang menunya
      // ikut modul) tetap memakai keadaan lama sampai reload manual — tampak
      // seperti simpanannya gagal. Catatan: sidebar & palet perintah membaca
      // izinnya lewat fetch client saat mount (`useEffectivePermissions`), jadi
      // keduanya baru menyusul pada navigasi berikutnya; refresh ini tetap
      // membereskan semua permukaan server.
      router.refresh();
    } catch {
      toast(t("modules.errNetwork"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={{ marginBottom: token.marginLG }}>
      <CardHeader>
        <CardTitle>{t("modules.sectionTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Typography.Paragraph type="secondary" style={{ marginBottom: token.margin }}>
          {t("modules.sectionDescription")}
        </Typography.Paragraph>

        {/* `Alert` AntD sudah `role="alert"` sendiri; pembungkus tak menambah
            apa pun — lihat catatan di `app/(auth)/forgot-password/page.tsx`. */}
        {loadError ? (
          <Alert type="error" showIcon message={loadError} />
        ) : (
          <>
            {errors.length > 0 && (
              <Alert
                type="error"
                showIcon
                style={{ marginBottom: token.margin }}
                message={
                  <ul style={{ margin: 0, paddingInlineStart: token.paddingLG }}>
                    {errors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                }
              />
            )}

            <ModulePicker
              category={category}
              modules={modules}
              onCategoryChange={pickCategory}
              onToggleModule={toggle}
              disabled={saving || !saved}
            />

            <Flex justify="flex-end" style={{ marginTop: token.margin }}>
              <Button disabled={saving || !isDirty} onClick={() => setConfirm(true)}>
                <Save aria-hidden="true" />
                {t("common.saveChanges")}
              </Button>
            </Flex>
          </>
        )}

        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={t("modules.confirmTitle")}
          message={t("modules.confirmMessage")}
          confirmLabel={t("common.save")}
          onConfirm={submit}
        />
      </CardContent>
    </Card>
  );
}
