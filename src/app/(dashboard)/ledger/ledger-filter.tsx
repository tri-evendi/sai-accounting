"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

interface Props {
  accountOptions: { value: string; label: string }[];
  accountId: string;
  from: string;
  to: string;
}

export function LedgerFilter({ accountOptions, accountId, from, to }: Props) {
  const router = useRouter();
  const translate = useT();
  const [acc, setAcc] = useState(accountId);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (acc) p.set("accountId", acc);
    if (f) p.set("from", f);
    if (t) p.set("to", t);
    router.push(`/ledger?${p.toString()}`);
  }

  return (
    <form onSubmit={submit} className="mb-6 flex flex-wrap items-end gap-3">
      <div className="min-w-[260px]">
        <Select
          id="accountId"
          label={translate("common.account")}
          value={acc}
          onChange={(e) => setAcc(e.target.value)}
          options={accountOptions}
        />
      </div>
      <div>
        <Input id="from" type="date" label={translate("common.from")} value={f} onChange={(e) => setF(e.target.value)} />
      </div>
      <div>
        <Input id="to" type="date" label={translate("common.to")} value={t} onChange={(e) => setT(e.target.value)} />
      </div>
      <Button type="submit" disabled={!acc}>
        {translate("common.show")}
      </Button>
    </form>
  );
}
