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

export function SellerIdentityForm({
  initial,
}: {
  initial: { npwp: string | null; taxName: string | null; taxAddress: string | null };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [npwp, setNpwp] = useState(initial.npwp ?? "");
  const [taxName, setTaxName] = useState(initial.taxName ?? "");
  const [taxAddress, setTaxAddress] = useState(initial.taxAddress ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/company-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ npwp, taxName, taxAddress }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Gagal menyimpan identitas pajak", "error");
        return;
      }
      toast("Identitas pajak penjual tersimpan", "success");
      router.refresh();
    } catch {
      toast("Tidak dapat menghubungi server", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input
        id="npwp"
        label="NPWP Penjual"
        value={npwp}
        onChange={(e) => setNpwp(e.target.value)}
        maxLength={30}
      />
      <Input
        id="taxName"
        label="Nama sesuai NPWP (opsional)"
        value={taxName}
        onChange={(e) => setTaxName(e.target.value)}
        maxLength={150}
      />
      <div className="sm:col-span-2">
        <Input
          id="taxAddress"
          label="Alamat sesuai NPWP (opsional)"
          value={taxAddress}
          onChange={(e) => setTaxAddress(e.target.value)}
          maxLength={1000}
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="button" onClick={handleSave} disabled={saving}>
          <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {saving ? "Menyimpan..." : "Simpan Identitas Pajak"}
        </Button>
      </div>
    </div>
  );
}
