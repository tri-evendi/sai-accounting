"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

export function AsOfFilter({ basePath, asOf }: { basePath: string; asOf: string }) {
  const router = useRouter();
  const t = useT();
  const [d, setD] = useState(asOf);
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (d) p.set("asOf", d);
    router.push(`${basePath}?${p.toString()}`);
  }
  return (
    <form onSubmit={submit} className="mb-6 flex items-end gap-3">
      <div>
        <Input
          id="asOf"
          type="date"
          label={t("reports.asOfDate")}
          value={d}
          onChange={(e) => setD(e.target.value)}
        />
      </div>
      <Button type="submit">{t("common.show")}</Button>
    </form>
  );
}

/**
 * Penyaring periode, dengan penyaring PUSAT BIAYA opsional (issue #91).
 *
 * Pemilihnya hanya muncul bila halaman memberi `costCenterOptions` — jadi
 * laporan yang memang tidak boleh dipilah per pusat biaya (Neraca: debit &
 * kredit takkan seimbang tanpa akun antar-unit) tidak menawarkannya sama
 * sekali, alih-alih menawarkan lalu diam-diam mengabaikannya.
 */
export function PeriodFilter({
  basePath,
  from,
  to,
  costCenterOptions,
  costCenter,
}: {
  basePath: string;
  from: string;
  to: string;
  costCenterOptions?: { value: string; label: string }[];
  costCenter?: string;
}) {
  const router = useRouter();
  // `t` sudah dipakai untuk tanggal "sampai" di komponen ini.
  const translate = useT();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [cc, setCc] = useState(costCenter ?? "");
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (f) p.set("from", f);
    if (t) p.set("to", t);
    if (cc) p.set("costCenter", cc);
    router.push(`${basePath}?${p.toString()}`);
  }
  return (
    <form onSubmit={submit} className="mb-6 flex flex-wrap items-end gap-3">
      <div>
        <Input
          id="from"
          type="date"
          label={translate("common.from")}
          value={f}
          onChange={(e) => setF(e.target.value)}
        />
      </div>
      <div>
        <Input
          id="to"
          type="date"
          label={translate("common.to")}
          value={t}
          onChange={(e) => setT(e.target.value)}
        />
      </div>
      {costCenterOptions && (
        <div className="min-w-[220px]">
          <Select
            id="costCenter"
            label={translate("costCenters.filterLabel")}
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            options={costCenterOptions}
          />
        </div>
      )}
      <Button type="submit">{translate("common.show")}</Button>
    </form>
  );
}
