"use client";

/**
 * Kartu "Surel Keluar" di halaman Akun — server surel milik tenant sendiri.
 *
 * ══ TIGA HAL YANG DIKATAKAN LAYAR INI, DAN KENAPA ═══════════════════════════
 *
 * 1. **Batasnya.** Surel akun — atur-ulang kata sandi, undangan staf,
 *    verifikasi — TIDAK lewat server ini. Tanpa kalimat itu, orang yang
 *    memasang SMTP-nya lalu tidak menerima undangan staf akan menyimpulkan
 *    pengaturannya rusak, dan mengubahnya berulang kali mencari kesalahan yang
 *    tidak ada.
 * 2. **Bahwa "Tahan dulu" berarti tidak terkirim ke siapa pun.** `file` adalah
 *    bawaan yang aman, tapi ia juga keadaan yang paling mudah disalahpahami
 *    sebagai "sudah jalan" — jadi ia memasang pita peringatan, bukan diam.
 * 3. **Hasil uji terakhir**, termasuk pesan galat mentah dari server SMTP-nya.
 *    "Uji gagal" tanpa sebabnya adalah kalimat yang tidak menolong siapa pun;
 *    "bad credentials" atau "relay access denied" langsung menunjuk isian mana
 *    yang salah.
 *
 * ══ KATA SANDI TIDAK PERNAH DIMUAT KE LAYAR ════════════════════════════════
 * Yang datang dari API hanya `hasPassword`. Isian dibiarkan kosong, dan kosong
 * berarti "jangan sentuh" — bukan "hapus". Menghapusnya menuntut satu centang
 * tersendiri, supaya kredensial yang bekerja tidak bisa hilang karena seseorang
 * menyimpan formulir untuk mengubah nomor port.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Flex, Typography, theme } from "antd";
import { SaveOutlined, SendOutlined } from "@ant-design/icons";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-fetch";
import { useT } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/utils";

const { Text } = Typography;

/** Kalimat penjelas di bawah sebuah isian. Primitif `Input` tidak punya slot
 *  untuknya, dan menambahkannya ke primitif demi satu formulir adalah harga
 *  yang salah — 39 pemanggil lain tidak membutuhkannya. */
function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Text type="secondary" style={{ display: "block", fontSize: "var(--ant-font-size-sm)" }}>
      {children}
    </Text>
  );
}

interface MailView {
  transport: "file" | "smtp";
  host: string;
  port: number | null;
  username: string;
  fromAddress: string;
  archiveAddress: string;
  hasPassword: boolean;
  lastTestAt: string | null;
  lastTestTo: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
}

export function TenantMailForm() {
  const t = useT();
  const { token } = theme.useToken();
  const { toast } = useToast();

  const [state, setState] = useState<MailView | null>(null);
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/tenant/mail");
    if (!res.ok) return;
    setState((await res.json()) as MailView);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state) return null;

  const set = <K extends keyof MailView>(key: K, value: MailView[K]) =>
    setState((prev) => (prev ? { ...prev, [key]: value } : prev));

  async function save() {
    if (!state) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/tenant/mail", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transport: state.transport,
          host: state.host,
          port: state.port,
          username: state.username,
          fromAddress: state.fromAddress,
          archiveAddress: state.archiveAddress,
          /* Kosong = jangan sentuh. Menghapus menuntut centangnya sendiri. */
          ...(clearPassword ? { password: "" } : password ? { password } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = data?.details?.fieldErrors;
        const first = detail ? Object.values(detail).flat().filter(Boolean)[0] : null;
        toast(String(first || data?.error || t("tenantMail.errSave")), "error");
        return;
      }
      setState(data as MailView);
      setPassword("");
      setClearPassword(false);
      toast(t("tenantMail.saved"));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await apiFetch("/api/tenant/mail", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(t("tenantMail.testFailed", { message: String(data?.error ?? "") }), "error");
        await load();
        return;
      }
      setState(data as MailView);
      toast(t("tenantMail.testOk", { recipient: String(data.recipient) }));
    } finally {
      setTesting(false);
    }
  }

  const smtp = state.transport === "smtp";

  return (
    <Flex vertical gap={token.marginSM}>
      <Text type="secondary">{t("tenantMail.description")}</Text>
      <Alert type="info" showIcon message={t("tenantMail.notForAuth")} />

      <Select
        label={t("tenantMail.transport")}
        value={state.transport}
        onChange={(e) => set("transport", e.target.value === "smtp" ? "smtp" : "file")}
        options={[
          { value: "file", label: t("tenantMail.transportFile") },
          { value: "smtp", label: t("tenantMail.transportSmtp") },
        ]}
      />

      {/* `file` adalah bawaan yang aman DAN keadaan yang paling mudah
          disalahpahami sebagai "sudah jalan". */}
      {!smtp && <Alert type="warning" showIcon message={t("tenantMail.fileNotice")} />}

      {smtp && (
        <>
          <Input
            label={t("tenantMail.host")}
            value={state.host}
            onChange={(e) => set("host", e.target.value)}
          />
          <div>
            <Input
              label={t("tenantMail.port")}
              type="number"
              value={state.port ?? ""}
              onChange={(e) => set("port", e.target.value === "" ? null : Number(e.target.value))}
            />
            <Hint>{t("tenantMail.portHint")}</Hint>
          </div>
          <Input
            label={t("tenantMail.username")}
            value={state.username}
            onChange={(e) => set("username", e.target.value)}
          />
          <div>
            <Input
              label={t("tenantMail.password")}
              type="password"
              value={password}
              disabled={clearPassword}
              onChange={(e) => setPassword(e.target.value)}
            />
            {state.hasPassword && <Hint>{t("tenantMail.passwordKept")}</Hint>}
          </div>
          {state.hasPassword && (
            <Checkbox checked={clearPassword} onCheckedChange={setClearPassword}>
              {t("tenantMail.passwordClear")}
            </Checkbox>
          )}
        </>
      )}

      <div>
        <Input
          label={t("tenantMail.fromAddress")}
          value={state.fromAddress}
          onChange={(e) => set("fromAddress", e.target.value)}
        />
        <Hint>{t("tenantMail.fromAddressHint")}</Hint>
      </div>
      <div>
        <Input
          label={t("tenantMail.archiveAddress")}
          value={state.archiveAddress}
          onChange={(e) => set("archiveAddress", e.target.value)}
        />
        <Hint>{t("tenantMail.archiveAddressHint")}</Hint>
      </div>

      {/* Hasil uji terakhir, LENGKAP dengan pesan mentah servernya. */}
      <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
        {state.lastTestAt === null
          ? t("tenantMail.neverTested")
          : state.lastTestStatus === "ok"
            ? t("tenantMail.lastTestOk", {
                date: formatDateTime(state.lastTestAt),
                recipient: state.lastTestTo ?? "",
              })
            : t("tenantMail.lastTestError", {
                date: formatDateTime(state.lastTestAt),
                message: state.lastTestMessage ?? "",
              })}
      </Text>

      <Flex wrap gap={token.marginXS}>
        <Button type="button" variant="primary" disabled={busy} onClick={save}>
          <SaveOutlined aria-hidden="true" />
          {busy ? t("common.processing") : t("tenantMail.save")}
        </Button>
        <Button type="button" variant="secondary" disabled={testing} onClick={sendTest}>
          <SendOutlined aria-hidden="true" />
          {testing ? t("tenantMail.testing") : t("tenantMail.test")}
        </Button>
      </Flex>
    </Flex>
  );
}
