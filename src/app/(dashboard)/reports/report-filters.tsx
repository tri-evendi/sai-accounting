"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
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

export function PeriodFilter({ basePath, from, to }: { basePath: string; from: string; to: string }) {
  const router = useRouter();
  // `t` sudah dipakai untuk tanggal "sampai" di komponen ini.
  const translate = useT();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (f) p.set("from", f);
    if (t) p.set("to", t);
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
      <Button type="submit">{translate("common.show")}</Button>
    </form>
  );
}
