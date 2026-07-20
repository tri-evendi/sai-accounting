"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AsOfFilter({ basePath, asOf }: { basePath: string; asOf: string }) {
  const router = useRouter();
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
        <Input id="asOf" type="date" label="Per Tanggal" value={d} onChange={(e) => setD(e.target.value)} />
      </div>
      <Button type="submit">Tampilkan</Button>
    </form>
  );
}

export function PeriodFilter({ basePath, from, to }: { basePath: string; from: string; to: string }) {
  const router = useRouter();
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
        <Input id="from" type="date" label="Dari" value={f} onChange={(e) => setF(e.target.value)} />
      </div>
      <div>
        <Input id="to" type="date" label="Sampai" value={t} onChange={(e) => setT(e.target.value)} />
      </div>
      <Button type="submit">Tampilkan</Button>
    </form>
  );
}
