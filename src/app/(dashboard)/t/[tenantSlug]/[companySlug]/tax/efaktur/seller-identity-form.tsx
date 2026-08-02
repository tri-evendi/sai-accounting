"use client";

/**
 * Seller tax identity editor (issue #17) — the editable NPWP surface the
 * e-Faktur export needs. Kept small on purpose: it PATCHes only the tax-identity
 * fields on the singleton CompanySetting (the setup wizard, issue #20, owns the
 * rest and is run-once), then refreshes so the export re-evaluates.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Save } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

export function SellerIdentityForm({
  initial,
}: {
  initial: { npwp: string | null; taxName: string | null; taxAddress: string | null };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [npwp, setNpwp] = useState(initial.npwp ?? "");
  const [taxName, setTaxName] = useState(initial.taxName ?? "");
  const [taxAddress, setTaxAddress] = useState(initial.taxAddress ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await apiFetch("/api/company-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ npwp, taxName, taxAddress }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || t("tax.saveFailed"), "error");
        return;
      }
      toast(t("tax.saved"), "success");
      router.refresh();
    } catch {
      toast(t("tax.networkFailed"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input
        id="npwp"
        label={t("tax.npwpField")}
        value={npwp}
        onChange={(e) => setNpwp(e.target.value)}
        maxLength={30}
      />
      <Input
        id="taxName"
        label={t("tax.taxNameField")}
        value={taxName}
        onChange={(e) => setTaxName(e.target.value)}
        maxLength={150}
      />
      <div className="sm:col-span-2">
        <Input
          id="taxAddress"
          label={t("tax.taxAddressField")}
          value={taxAddress}
          onChange={(e) => setTaxAddress(e.target.value)}
          maxLength={1000}
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="button" onClick={handleSave} disabled={saving}>
          <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {saving ? t("common.saving") : t("tax.saveIdentity")}
        </Button>
      </div>
    </div>
  );
}
