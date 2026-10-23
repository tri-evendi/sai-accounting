"use client";

/**
 * KENDALI TINJAU & TERBIT isi halaman depan: pratinjau, terbitkan, buang
 * draf, dan bersihkan kunci yatim.
 *
 * Client karena tiga hal yang menuntut peramban: dialog konfirmasi, tautan
 * pratinjau yang hanya hidup di state (tokennya tidak boleh masuk HTML hasil
 * render server), dan pesan hasil tanpa memuat ulang. Daftar drafnya sendiri
 * dirender server (`content/page.tsx`).
 *
 * Satu aksi utama: "Terbitkan" (pemicu `ConfirmDialog`, MASTER.md §Aksi
 * utama). Pratinjau `secondary`; buang draf dan hapus kunci yatim merah +
 * konfirmasi (`tests/destructive-confirm.test.ts`).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Flex, theme } from "antd";
import { EyeOutlined } from "@ant-design/icons";

import { Button } from "@sai/ui/button";
import { ConfirmDialog } from "@sai/ui/confirm-dialog";
import { Input } from "@sai/ui/input";
import { useT } from "@sai/core/i18n/client";
import { SITE_CONTENT_LIVE_DELAY_SECONDS, SITE_CONTENT_NOTE_MAX } from "@sai/core/site-content";
import type { SiteContentPublishFormInput } from "@op/lib/validations/operator";
import type { OperatorContentActionResult } from "@op/app/(operator)/content/actions";

interface ContentPublishControlsProps {
  draftCount: number;
  canPublish: boolean;
  preview: () => Promise<OperatorContentActionResult>;
  publish: (input: SiteContentPublishFormInput) => Promise<OperatorContentActionResult>;
  discard: () => Promise<OperatorContentActionResult>;
}

export function ContentPublishControls({
  draftCount,
  canPublish,
  preview,
  publish,
  discard,
}: ContentPublishControlsProps) {
  const t = useT();
  const router = useRouter();
  const { token } = theme.useToken();
  const [result, setResult] = useState<OperatorContentActionResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const run = async (action: () => Promise<OperatorContentActionResult>) => {
    setBusy(true);
    setResult(null);
    try {
      const answer = await action();
      setResult(answer);
      if (answer.ok) router.refresh();
      return answer;
    } finally {
      setBusy(false);
    }
  };

  const onPreview = async () => {
    const answer = await run(preview);
    if (answer.ok && answer.previewUrl) {
      setPreviewUrl(answer.previewUrl);
      /* Dicoba langsung; bila peramban menahan jendela baru, tautannya tetap
         ada di bawah. */
      window.open(answer.previewUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: token.marginSM }}>
      {canPublish && (
        <div style={{ maxWidth: 480 }}>
          <Input
            name="note"
            label={t("operator.content.noteLabel")}
            placeholder={t("operator.content.notePlaceholder")}
            maxLength={SITE_CONTENT_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      )}

      <Flex wrap align="center" gap={token.marginSM}>
        {canPublish && (
          <ConfirmDialog
            title={t("operator.content.publishTitle", { count: draftCount })}
            message={t("operator.content.publishMessage", { seconds: SITE_CONTENT_LIVE_DELAY_SECONDS })}
            confirmLabel={t("operator.content.publishButton")}
            onConfirm={async () => {
              const answer = await run(() => publish({ note: note.trim() || undefined }));
              if (answer.ok) {
                setNote("");
                setPreviewUrl(null);
              }
            }}
            trigger={
              <Button type="button" variant="primary" disabled={busy}>
                {t("operator.content.publishButton")}
              </Button>
            }
          />
        )}
        <Button type="button" variant="secondary" disabled={busy} onClick={onPreview}>
          <EyeOutlined aria-hidden="true" />
          {t("operator.content.previewButton")}
        </Button>
        <ConfirmDialog
          title={t("operator.content.discardTitle", { count: draftCount })}
          message={t("operator.content.discardMessage")}
          confirmLabel={t("operator.content.discardButton")}
          confirmVariant="danger"
          onConfirm={async () => {
            const answer = await run(discard);
            if (answer.ok) setPreviewUrl(null);
          }}
          trigger={
            <Button type="button" variant="danger" disabled={busy}>
              {t("operator.content.discardButton")}
            </Button>
          }
        />
      </Flex>

      {previewUrl && (
        <Flex wrap align="center" gap={token.marginSM}>
          <Button href={previewUrl} target="_blank" rel="noopener noreferrer" variant="outline">
            {t("operator.content.previewOpen")}
          </Button>
        </Flex>
      )}

      {/* `Alert` AntD selalu `role="alert"`; jangan oper `role`. */}
      {result && <Alert type={result.ok ? "success" : "error"} message={result.message} showIcon />}
    </div>
  );
}

/** Hapus kunci yang sudah dicabut dari kamus (owner). */
export function ContentOrphanPurge({
  count,
  purge,
}: {
  count: number;
  purge: () => Promise<OperatorContentActionResult>;
}) {
  const t = useT();
  const router = useRouter();
  const [result, setResult] = useState<OperatorContentActionResult | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ant-margin-xs)" }}>
      <ConfirmDialog
        title={t("operator.content.orphanTitle", { count })}
        message={t("operator.content.orphanMessage")}
        confirmLabel={t("operator.content.orphanButton", { count })}
        confirmVariant="danger"
        onConfirm={async () => {
          const answer = await purge();
          setResult(answer);
          if (answer.ok) router.refresh();
        }}
        trigger={
          <Button type="button" variant="danger" size="sm">
            {t("operator.content.orphanButton", { count })}
          </Button>
        }
      />
      {result && !result.ok && <Alert type="error" message={result.message} showIcon />}
    </div>
  );
}
