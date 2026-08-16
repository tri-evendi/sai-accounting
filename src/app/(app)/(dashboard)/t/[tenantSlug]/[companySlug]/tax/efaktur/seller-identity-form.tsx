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
import { SaveOutlined } from "@ant-design/icons";
import { Col, Row } from "antd";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

/** `margin` 16 — jarak antar isian. */
const FIELD_GAP = 16;
const ICON_SIZE = 16;

export function SellerIdentityForm({
  initial,
  identityIncomplete,
}: {
  initial: { npwp: string | null; taxName: string | null; taxAddress: string | null };
  /**
   * NPWP penjual belum terisi — halaman ini TIDAK merender tombol unduh pada
   * keadaan itu (lihat `page.tsx`), jadi menyimpan identitas adalah satu-satunya
   * jalan maju layarnya. Dipakai untuk eskalasi berkondisi di tombol simpan;
   * lihat catatan di sana.
   */
  identityIncomplete: boolean;
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

  /*
   * Kisi 24 kolom AntD, bukan `sm:grid-cols-2`: NPWP dan nama pajak berbagi
   * satu baris di layar ≥576px (`sm` AntD, titik patah yang sama dengan
   * kelasnya dulu), sedangkan alamat & tombol simpan selalu satu baris penuh.
   */
  return (
    <Row gutter={[FIELD_GAP, FIELD_GAP]}>
      <Col xs={24} sm={12}>
        <Input
          id="npwp"
          label={t("tax.npwpField")}
          value={npwp}
          onChange={(e) => setNpwp(e.target.value)}
          maxLength={30}
        />
      </Col>
      <Col xs={24} sm={12}>
        <Input
          id="taxName"
          label={t("tax.taxNameField")}
          value={taxName}
          onChange={(e) => setTaxName(e.target.value)}
          maxLength={150}
        />
      </Col>
      <Col span={24}>
        <Input
          id="taxAddress"
          label={t("tax.taxAddressField")}
          value={taxAddress}
          onChange={(e) => setTaxAddress(e.target.value)}
          maxLength={1000}
        />
      </Col>
      <Col span={24}>
        {/*
          ESKALASI BERKONDISI (#267 potongan 4) — bentuk yang MASTER.md sebut
          disukai, dan syaratnya benar-benar terpenuhi di sini.

          `/tax/efaktur` memikul dua aksi yang mengikat dari dua berkas: menyimpan
          identitas penjual (di sini) dan mengunduh CSV-nya (`page.tsx`). Dua blok
          biru sekaligus — dan tak satu penjaga pun bisa melihatnya.

          Yang menyelesaikannya bukan memilih salah satu selamanya, melainkan
          kenyataan halamannya: ketika NPWP belum terisi, tombol unduh TIDAK
          dirender sama sekali (diganti catatan "NPWP diperlukan"), jadi mengisi
          identitas adalah satu-satunya jalan maju dan ia satu-satunya primer.
          Begitu identitasnya lengkap, menyimpannya berubah menjadi penyuntingan
          pemeliharaan, dan penekanan pindah ke unduhan — alasan orang membuka
          halaman ini.
        */}
        <Button
          type="button"
          variant={identityIncomplete ? "primary" : "secondary"}
          onClick={handleSave}
          disabled={saving}
        >
          <SaveOutlined aria-hidden="true" style={{ fontSize: ICON_SIZE, marginInlineEnd: 6 }} />
          {saving ? t("common.saving") : t("tax.saveIdentity")}
        </Button>
      </Col>
    </Row>
  );
}
