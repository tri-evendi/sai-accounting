"use client";

import { useState, useEffect } from "react";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Flex } from "antd";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DOCUMENT_TYPES } from "@/lib/constants";
import { UploadOutlined } from "@ant-design/icons";
import { useDictionary, useT } from "@/lib/i18n/client";
import { documentTypeLabels } from "@/lib/i18n/labels";
import { apiFetch } from "@/lib/api-fetch";

/** `marginLG` 24 · `margin` 16 · `marginSM` 12 — token AntD sebagai angka. */
const SECTION_GAP = 24;
const FIELD_GAP = 16;
const CONTROL_GAP = 12;
/** Tinggi area jatuhkan-berkas — `h-32` lama. */
const DROPZONE_HEIGHT = 128;
const STRONG = "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"];

const MUTED: React.CSSProperties = { color: "var(--ant-color-text-secondary)" };

interface ContractOption {
  id: number;
  contractNo: string;
}

export function UploadClient() {
  const t = useT();
  const typeLabels = documentTypeLabels(useDictionary());
  const router = useAppRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [contracts, setContracts] = useState<ContractOption[]>([]);

  useEffect(() => {
    apiFetch("/api/contracts")
      .then((res) => res.json())
      .then((data) => {
        setContracts(
          data.map((c: { id: number; contractNo: string }) => ({
            id: c.id,
            contractNo: c.contractNo,
          }))
        );
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!file) {
      setError(t("documents.errPickFile"));
      return;
    }

    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set("file", file);

    const res = await apiFetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || t("documents.errUpload"));
      setLoading(false);
    } else {
      router.push("/documents");
      router.refresh();
    }
  }

  return (
    <div style={{ width: "100%" }}>
      <PageHeader
        breadcrumbs={[
          { label: t("nav.items.documents"), href: "/documents" },
          { label: t("documents.uploadTitle") },
        ]}
        title={t("documents.uploadTitle")}
      />

      {error && (
        <div
          style={{
            margin: 0,
            marginBottom: FIELD_GAP,
            padding: 12,
            borderRadius: "var(--ant-border-radius)",
            background: "var(--ant-color-error-bg)",
            color: "var(--ant-color-money-negative)",
          }}
          role="alert"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card style={{ marginBottom: SECTION_GAP }}>
          <div
            style={{
              padding: "var(--ant-padding-lg)",
              borderBottom: "1px solid var(--ant-color-border-secondary)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "var(--ant-font-size-lg)", fontWeight: STRONG }}>
              {t("documents.formTitle")}
            </h2>
          </div>
          <div style={{ padding: "var(--ant-padding-lg)" }}>
            <Flex vertical gap={FIELD_GAP}>
              {/* File Input */}
              <div>
                {/* Label ini dulu tidak tertaut ke isian mana pun; `htmlFor`
                    menautkannya ke isian berkas yang sesungguhnya, jadi
                    pembaca layar mengumumkan namanya. */}
                <label
                  htmlFor="document-file"
                  style={{ display: "block", marginBottom: 4, fontWeight: STRONG }}
                >
                  {t("documents.fileField")}
                </label>
                <label
                  htmlFor="document-file"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: DROPZONE_HEIGHT,
                    padding: "20px 16px",
                    border: "2px dashed var(--ant-color-border)",
                    borderRadius: "var(--ant-border-radius-lg)",
                    background: "var(--ant-color-fill-quaternary)",
                    cursor: "pointer",
                  }}
                >
                  <UploadOutlined aria-hidden="true" style={{ fontSize: 32, marginBottom: 8, color: "var(--ant-color-text-secondary)" }} />
                  {file ? (
                    <p style={{ margin: 0, fontWeight: STRONG }}>{file.name}</p>
                  ) : (
                    <>
                      <p style={{ margin: 0, ...MUTED }}>{t("documents.pickFile")}</p>
                      <p
                        style={{
                          margin: 0,
                          marginTop: 4,
                          fontSize: "var(--ant-font-size-sm)",
                          ...MUTED,
                        }}
                      >
                        {t("documents.fileHint")}
                      </p>
                    </>
                  )}
                  <input
                    id="document-file"
                    type="file"
                    style={{ display: "none" }}
                    accept=".jpg,.jpeg,.png,.gif,.pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

              <Select
                id="type"
                name="type"
                label={t("documents.typeField")}
                placeholder={t("documents.typePlaceholder")}
                options={DOCUMENT_TYPES.map((value) => ({
                  value,
                  label: typeLabels[value],
                }))}
              />

              <Select
                id="contractId"
                name="contractId"
                label={t("documents.contractField")}
                placeholder={t("documents.contractPlaceholder")}
                options={contracts.map((c) => ({
                  value: String(c.id),
                  label: c.contractNo,
                }))}
              />
            </Flex>
          </div>
        </Card>

        <Flex gap={CONTROL_GAP}>
          <Button type="submit" disabled={loading || !file}>
            {loading ? t("documents.uploading") : t("documents.uploadTitle")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/documents")}>
            {t("common.cancel")}
          </Button>
        </Flex>
      </form>
    </div>
  );
}
