"use client";

/**
 * Layar PENGUMUMAN STATUS di konsol operator — buat pemeliharaan/insiden dan
 * pindahkan fasenya. Tanpa teks bebas: pratinjau kalimat dirakit dari kamus
 * yang sama dengan `/status` dan banner, supaya operator melihat PERSIS yang
 * akan dibaca pelanggan sebelum menekan tombol.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Flex } from "antd";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { CONSOLE_MUTED } from "@/components/operator/console-ui";
import { useT } from "@/lib/i18n/client";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import {
  COMPONENT_LABEL,
  NOTICE_SENTENCE,
  PHASES_FOR,
  STATUS_NOTICE_COMPONENTS,
  type PublicStatusNotice,
  type StatusNoticeKind,
  type StatusNoticePhase,
} from "@/lib/status-notices";
import { formatDateTime } from "@sai/core/utils";
import type { StatusNoticeActionResult } from "@/app/(app)/(operator)/operator/status-notices/actions";

const PHASE_LABEL: Record<StatusNoticePhase, DictionaryKey> = {
  scheduled: "operator.statusNotices.phase.scheduled",
  investigating: "operator.statusNotices.phase.investigating",
  identified: "operator.statusNotices.phase.identified",
  monitoring: "operator.statusNotices.phase.monitoring",
  resolved: "operator.statusNotices.phase.resolved",
};
const KIND_LABEL: Record<StatusNoticeKind, DictionaryKey> = {
  maintenance: "operator.statusNotices.kind.maintenance",
  incident: "operator.statusNotices.kind.incident",
};

export interface StatusNoticesPanelProps {
  notices: PublicStatusNotice[];
  canEdit: boolean;
  create: (input: {
    kind: StatusNoticeKind;
    component: string;
    phase: StatusNoticePhase;
    startsAt: string;
    endsAt?: string;
    showInApp: boolean;
  }) => Promise<StatusNoticeActionResult>;
  setPhase: (input: { id: number; phase: StatusNoticePhase }) => Promise<StatusNoticeActionResult>;
}

export function StatusNoticesPanel({ notices, canEdit, create, setPhase }: StatusNoticesPanelProps) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<StatusNoticeActionResult | null>(null);
  const [kind, setKind] = useState<StatusNoticeKind>("maintenance");
  const [component, setComponent] = useState<string>("application");
  const [phase, setPhaseDraft] = useState<StatusNoticePhase>("scheduled");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [showInApp, setShowInApp] = useState(true);

  const kalimat = (n: { kind: StatusNoticeKind; phase: StatusNoticePhase; component: string; startsAt: string; endsAt: string | null }) => {
    const kunci = NOTICE_SENTENCE[n.kind]?.[n.phase];
    if (!kunci) return "—";
    return t(kunci, {
      component: t(COMPONENT_LABEL[n.component as PublicStatusNotice["component"]]),
      from: n.startsAt ? formatDateTime(n.startsAt) : "—",
      until: n.endsAt ? formatDateTime(n.endsAt) : "—",
    });
  };

  function run(p: Promise<StatusNoticeActionResult>) {
    startTransition(async () => {
      const r = await p;
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  const columns: SaiColumns<PublicStatusNotice> = [
    {
      key: "what",
      title: t("operator.statusNotices.colNotice"),
      align: "left",
      render: (_v, n) => (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span>{kalimat(n)}</span>
          <span style={{ ...CONSOLE_MUTED, fontSize: "var(--ant-font-size-sm)" }}>
            {t(KIND_LABEL[n.kind])} · {n.showInApp ? t("operator.statusNotices.inApp") : t("operator.statusNotices.statusOnly")}
          </span>
        </div>
      ),
    },
    {
      key: "phase",
      title: t("operator.statusNotices.colPhase"),
      align: "left",
      render: (_v, n) =>
        n.resolvedAt ? (
          <Badge variant="success">{t(PHASE_LABEL.resolved)}</Badge>
        ) : (
          <Badge variant={n.kind === "incident" ? "warning" : "default"}>{t(PHASE_LABEL[n.phase])}</Badge>
        ),
    },
    ...(canEdit
      ? ([
          {
            key: "next",
            title: t("operator.statusNotices.colNext"),
            align: "left",
            render: (_v, n) =>
              n.resolvedAt ? null : (
                <Flex gap="small" wrap>
                  {PHASES_FOR[n.kind]
                    .filter((p) => p !== n.phase)
                    .map((p) => (
                      <Button
                        key={p}
                        variant={p === "resolved" ? "primary" : "outline"}
                        size="sm"
                        disabled={pending}
                        onClick={() => run(setPhase({ id: n.id, phase: p }))}
                      >
                        {t(PHASE_LABEL[p])}
                      </Button>
                    ))}
                </Flex>
              ),
          },
        ] satisfies SaiColumns<PublicStatusNotice>)
      : []),
  ];

  return (
    <Flex vertical gap="middle">
      {result && <Alert type={result.ok ? "success" : "error"} showIcon message={result.message} />}

      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(create({ kind, component, phase, startsAt, endsAt: endsAt || undefined, showInApp }));
          }}
          style={{ display: "flex", flexDirection: "column", gap: "var(--ant-margin-sm)" }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ant-margin-sm)", alignItems: "flex-end" }}>
            <div style={{ width: "100%", maxWidth: 180 }}>
              <Select
                label={t("operator.statusNotices.kindLabel")}
                options={(["maintenance", "incident"] as const).map((k) => ({ value: k, label: t(KIND_LABEL[k]) }))}
                value={kind}
                onChange={(e) => {
                  const k = e.target.value as StatusNoticeKind;
                  setKind(k);
                  setPhaseDraft(PHASES_FOR[k][0]);
                }}
              />
            </div>
            <div style={{ width: "100%", maxWidth: 200 }}>
              <Select
                label={t("operator.statusNotices.componentLabel")}
                options={STATUS_NOTICE_COMPONENTS.map((c) => ({ value: c, label: t(COMPONENT_LABEL[c]) }))}
                value={component}
                onChange={(e) => setComponent(e.target.value)}
              />
            </div>
            <div style={{ width: "100%", maxWidth: 200 }}>
              <Select
                label={t("operator.statusNotices.phaseLabel")}
                options={PHASES_FOR[kind]
                  .filter((p) => p !== "resolved")
                  .map((p) => ({ value: p, label: t(PHASE_LABEL[p]) }))}
                value={phase}
                onChange={(e) => setPhaseDraft(e.target.value as StatusNoticePhase)}
              />
            </div>
            <div style={{ width: "100%", maxWidth: 220 }}>
              <Input
                type="datetime-local"
                label={t("operator.statusNotices.startsLabel")}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div style={{ width: "100%", maxWidth: 220 }}>
              <Input
                type="datetime-local"
                label={t("operator.statusNotices.endsLabel")}
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
          <Checkbox checked={showInApp} onCheckedChange={setShowInApp}>
            {t("operator.statusNotices.showInApp")}
          </Checkbox>
          <p style={{ ...CONSOLE_MUTED, margin: 0 }}>
            {t("operator.statusNotices.previewLabel")}:{" "}
            <strong>{kalimat({ kind, phase, component, startsAt, endsAt: endsAt || null })}</strong>
          </p>
          <div>
            <Button type="submit" variant="primary" disabled={pending || startsAt.length < 16}>
              {t("operator.statusNotices.create")}
            </Button>
          </div>
        </form>
      )}

      <StaticTable
        columns={columns}
        rows={notices}
        rowKey={(n) => n.id}
        empty={<p style={{ ...CONSOLE_MUTED, padding: "var(--ant-padding-lg)" }}>{t("operator.statusNotices.empty")}</p>}
      />
    </Flex>
  );
}
