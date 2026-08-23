"use client";

/**
 * "Kirim ke Pelanggan" — dua kanal + riwayatnya (issue #465).
 *
 * ══ KENAPA RIWAYATNYA SEBESAR TOMBOLNYA ═════════════════════════════════════
 * Tombol kirim tanpa riwayat hanya MEMINDAHKAN pekerjaan: pertanyaan yang
 * membuat orang membuka halaman ini bukan "bagaimana cara mengirim" melainkan
 * "apakah ini sudah saya kirim". Karena itu daftar kirimannya bukan pelengkap —
 * ia separuh dari fiturnya, dan ia yang mengubah menagih dari mengingat-ingat
 * menjadi membaca.
 *
 * ══ DUA KANAL YANG SENGAJA TIDAK DIBUAT SERAGAM ═════════════════════════════
 *   • Surel  — tombol biasa yang memanggil API; kitalah yang mengirim.
 *   • WhatsApp — TAUTAN sungguhan (`<Button href>`, `target="_blank"`) yang
 *     `href`-nya sudah dihitung server saat halaman dirender. Ia bukan tombol
 *     yang menunggu jawaban lalu memanggil `window.open()`: jendela yang dibuka
 *     skrip sesudah sebuah `await` diblokir peramban sebagai popup, dan yang
 *     dialami pengguna adalah tombol yang ditekan lalu tidak terjadi apa-apa.
 *
 * Kalimat di seluruh bagian ini tidak pernah menyebut WhatsApp "terkirim":
 * yang kita ketahui hanya bahwa pesannya DISIAPKAN.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flex, Typography, theme } from "antd";
import { MailOutlined, WhatsAppOutlined } from "@ant-design/icons";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-fetch";
import { useT } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/utils";

const { Text } = Typography;

export interface SendHistoryRow {
  id: number;
  channel: "email" | "whatsapp";
  recipient: string;
  /** ISO — dirakit di server; dirender di zona waktu pembaca. */
  sentAt: string;
  sentBy: string;
  /** Titik pengingat (#467), atau `null` bila kiriman ini ditekan seseorang. */
  reminderKind: string | null;
}

export function InvoiceSendSection({
  invoiceId,
  email,
  whatsAppUrl,
  history,
}: {
  invoiceId: number;
  /** Alamat surel pelanggan; `null` = tak ada, tombolnya dimatikan. */
  email: string | null;
  /** Tautan wa.me siap pakai; `null` = nomornya tak bisa dipahami. */
  whatsAppUrl: string | null;
  history: SendHistoryRow[];
}) {
  const t = useT();
  const router = useRouter();
  const { token } = theme.useToken();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  async function post(channel: "email" | "whatsapp"): Promise<boolean> {
    const res = await apiFetch(`/api/invoices/${invoiceId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast(data?.error ?? t("invoiceSend.errFailed"), "error");
      return false;
    }
    /* Riwayatnya dirender SERVER, jadi baris baru hanya muncul setelah data
       halaman diambil ulang. */
    router.refresh();
    return true;
  }

  async function sendEmail() {
    setSending(true);
    try {
      if (await post("email")) {
        toast(t("invoiceSend.sentEmail", { recipient: email ?? "" }));
      }
    } finally {
      setSending(false);
    }
  }

  /* WhatsApp: tautannya jalan terus (jangan pernah dihalangi menunggu jaringan);
     pencatatannya menyusul. Kalau pencatatannya gagal, yang hilang satu baris
     riwayat — bukan pesannya. */
  function noteWhatsApp() {
    void post("whatsapp").then((ok) => {
      if (ok) toast(t("invoiceSend.preparedWhatsApp"));
    });
  }

  /**
   * Label pendek titik pengingat ("H-3"); string kosong bila kuncinya asing.
   *
   * Kunci ditulis UTUH di tiap cabang, bukan dirakit dari `kind`: yang dirakit
   * tak terlihat penjaga kunci yatim, dan yang tak terlihat akan ikut tercabut
   * pada pembersihan kamus berikutnya.
   */
  function pointLabel(kind: string): string {
    if (kind === "before_3") return t("invoiceReminder.pointLabel.before_3");
    if (kind === "after_1") return t("invoiceReminder.pointLabel.after_1");
    if (kind === "after_7") return t("invoiceReminder.pointLabel.after_7");
    return "";
  }

  const lastSent = history[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle level={2}>{t("invoiceSend.sectionTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Flex vertical gap={token.marginSM}>
          <Text type="secondary">{t("invoiceSend.sectionDescription")}</Text>

          <Flex wrap gap={token.marginXS} aria-busy={sending}>
            <Button
              type="button"
              variant="secondary"
              onClick={sendEmail}
              /* Tanpa alamat surel tombolnya MATI, dan alasannya tertulis di
                 bawah — bukan tombol hidup yang baru menjelaskan setelah
                 ditekan dan gagal. */
              disabled={sending || !email}
              title={email ?? undefined}
            >
              <MailOutlined aria-hidden="true" />
              {sending ? t("invoiceSend.sending") : t("invoiceSend.email")}
            </Button>

            {whatsAppUrl && (
              <Button
                variant="secondary"
                href={whatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={noteWhatsApp}
              >
                <WhatsAppOutlined aria-hidden="true" />
                {t("invoiceSend.whatsapp")}
              </Button>
            )}
          </Flex>

          {/* Kenapa sebuah kanal tidak tersedia — dikatakan, bukan disembunyikan.
              Keduanya berujung ke layar yang sama (data pelanggan), jadi yang
              dibaca orang adalah tindakan yang harus ia kerjakan. */}
          {!email && <Text type="secondary">{t("invoiceSend.errNoEmail")}</Text>}
          {!whatsAppUrl && <Text type="secondary">{t("invoiceSend.errNoPhone")}</Text>}

          <div>
            <Text strong style={{ display: "block", marginBottom: token.marginXXS }}>
              {t("invoiceSend.historyTitle")}
            </Text>
            {history.length === 0 ? (
              <Text type="secondary">{t("invoiceSend.historyEmpty")}</Text>
            ) : (
              <Flex vertical gap={token.marginXXS}>
                {history.map((row) => (
                  <Text key={row.id} style={{ fontSize: token.fontSizeSM }}>
                    {/* Pengingat OTOMATIS diberi namanya sendiri (#467): baris
                        yang tampak seperti kiriman manual akan membuat orang
                        mengira ada rekan yang sudah menagih, lalu tidak
                        menindaklanjuti. */}
                    {row.reminderKind
                      ? t("invoiceReminder.channelReminder")
                      : row.channel === "email"
                        ? t("invoiceSend.channelEmail")
                        : t("invoiceSend.channelWhatsapp")}{" "}
                    · {row.recipient} · {formatDateTime(row.sentAt)}{" "}
                    {row.reminderKind ? (
                      <Text type="secondary">
                        {t("invoiceReminder.automatic")}
                        {pointLabel(row.reminderKind) ? ` · ${pointLabel(row.reminderKind)}` : ""}
                      </Text>
                    ) : (
                      <Text type="secondary">{t("invoiceSend.byUser", { name: row.sentBy })}</Text>
                    )}
                    {!row.reminderKind && row.channel === "whatsapp" && (
                      <Text type="secondary"> · {t("invoiceSend.channelWhatsappHint")}</Text>
                    )}
                  </Text>
                ))}
              </Flex>
            )}
          </div>

          {lastSent && (
            <Text type="secondary">
              {t("invoiceSend.lastSent", { date: formatDateTime(lastSent.sentAt) })}
            </Text>
          )}
        </Flex>
      </CardContent>
    </Card>
  );
}
