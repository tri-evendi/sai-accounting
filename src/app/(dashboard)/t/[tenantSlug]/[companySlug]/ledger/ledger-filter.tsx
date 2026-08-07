"use client";

/**
 * Penyaring Buku Besar — dikonversi ke token Ant Design pada issue #196.
 *
 * Baris penyaring kaku (`flex flex-wrap items-end gap-3` + dua `min-w-[…]`)
 * menjadi `Row` yang membungkus: di 375px keempat kendali dulu saling
 * menghimpit karena lebar minimumnya tetap. Kendalinya sendiri tidak berubah.
 */

import { useState } from "react";
import { Col, Row, theme } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

interface Props {
  accountOptions: { value: string; label: string }[];
  accountId: string;
  from: string;
  to: string;
  /** issue #91 — pilihan pusat biaya; "" = semua, "unassigned" = belum ditetapkan. */
  costCenterOptions: { value: string; label: string }[];
  costCenter: string;
}

/** Lebar dasar tiap kendali penyaring (`min-w-[260px]`/`[220px]` lama). */
const ACCOUNT_BASIS = 260;
const COST_CENTER_BASIS = 220;
const DATE_BASIS = 160;

export function LedgerFilter({
  accountOptions,
  accountId,
  from,
  to,
  costCenterOptions,
  costCenter,
}: Props) {
  const router = useAppRouter();
  const translate = useT();
  const { token } = theme.useToken();
  const [acc, setAcc] = useState(accountId);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [cc, setCc] = useState(costCenter);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (acc) p.set("accountId", acc);
    if (f) p.set("from", f);
    if (t) p.set("to", t);
    if (cc) p.set("costCenter", cc);
    router.push(`/ledger?${p.toString()}`);
  }

  return (
    <form onSubmit={submit} style={{ marginBottom: token.marginLG }}>
      <Row gutter={[token.marginSM, token.marginSM]} align="bottom">
        <Col flex={`1 1 ${ACCOUNT_BASIS}px`} style={{ minWidth: 0 }}>
          <Select
            id="accountId"
            label={translate("common.account")}
            value={acc}
            onChange={(e) => setAcc(e.target.value)}
            options={accountOptions}
          />
        </Col>
        <Col flex={`1 1 ${DATE_BASIS}px`} style={{ minWidth: 0 }}>
          <Input id="from" type="date" label={translate("common.from")} value={f} onChange={(e) => setF(e.target.value)} />
        </Col>
        <Col flex={`1 1 ${DATE_BASIS}px`} style={{ minWidth: 0 }}>
          <Input id="to" type="date" label={translate("common.to")} value={t} onChange={(e) => setT(e.target.value)} />
        </Col>
        <Col flex={`1 1 ${COST_CENTER_BASIS}px`} style={{ minWidth: 0 }}>
          <Select
            id="costCenter"
            label={translate("costCenters.filterLabel")}
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            options={costCenterOptions}
          />
        </Col>
        <Col flex="none">
          <Button type="submit" disabled={!acc}>
            {translate("common.show")}
          </Button>
        </Col>
      </Row>
    </form>
  );
}
