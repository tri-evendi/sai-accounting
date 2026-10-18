"use client";

/**
 * BANNER PENGUMUMAN STATUS di seluruh aplikasi (migration platform 0004).
 *
 * Dibaca dari `GET /api/status/notices` di peramban, bukan di root layout —
 * root layout sengaja tidak menyentuh basis data (lihat komentarnya). Gagal
 * diam: platform mati / host operator (rutenya 404 di sana) → tanpa banner.
 *
 * Kalimatnya dari kamus (`statusNotice.*`), tidak pernah teks bebas — aturan
 * tiga bahasa yang sama dengan `/status`. Bisa ditutup per pengumuman untuk
 * sesi peramban ini (sessionStorage, dibungkus try/catch: penyimpanan yang
 * ditolak berarti banner tidak bisa ditutup, bukan halaman yang rusak).
 */
import { useEffect, useState } from "react";
import { Alert } from "antd";

import { useT } from "@sai/core/i18n/client";
import {
  COMPONENT_LABEL,
  NOTICE_SENTENCE,
  type PublicStatusNotice,
} from "@sai/core/status-notices";
import { formatDateTime } from "@sai/core/utils";

const KUNCI = "sai-status-banner-ditutup";

function bacaDitutup(): number[] {
  try {
    return JSON.parse(sessionStorage.getItem(KUNCI) ?? "[]") as number[];
  } catch {
    return [];
  }
}

export function StatusBanner() {
  const t = useT();
  const [notices, setNotices] = useState<PublicStatusNotice[]>([]);
  /* Inisialisasi malas, bukan setState di effect: di server sessionStorage tidak
     ada (→ []), dan perbedaan state awal tidak pernah terlihat — banner tidak
     menggambar apa pun sebelum fetch di bawah selesai. */
  const [ditutup, setDitutup] = useState<number[]>(bacaDitutup);

  useEffect(() => {
    let batal = false;
    /* Gagal = TIDAK MENYENTUH state (tetap tanpa banner), bukan "daftar
       kosong" — keduanya tampak sama di layar, tetapi hanya yang pertama jujur
       bila kelak ada pemanggil yang membedakannya. */
    fetch("/api/status/notices")
      .then((r) => (r.ok ? (r.json() as Promise<{ notices?: PublicStatusNotice[] }>) : null))
      .then((body) => {
        if (!batal && body && Array.isArray(body.notices)) setNotices(body.notices);
      })
      .catch(() => undefined);
    return () => {
      batal = true;
    };
  }, []);

  const tampil = notices.filter((n) => !ditutup.includes(n.id));
  if (tampil.length === 0) return null;

  return (
    <div role="region" aria-label={t("statusNotice.regionLabel")}>
      {tampil.map((n) => {
        const kunci = NOTICE_SENTENCE[n.kind]?.[n.phase];
        if (!kunci) return null;
        return (
          <Alert
            key={n.id}
            banner
            closable
            type={n.kind === "incident" ? "warning" : "info"}
            message={t(kunci, {
              component: t(COMPONENT_LABEL[n.component]),
              from: formatDateTime(n.startsAt),
              until: n.endsAt ? formatDateTime(n.endsAt) : "—",
            })}
            action={
              <a href="/status" style={{ whiteSpace: "nowrap" }}>
                {t("statusNotice.details")}
              </a>
            }
            onClose={() => {
              const baru = [...ditutup, n.id];
              setDitutup(baru);
              try {
                sessionStorage.setItem(KUNCI, JSON.stringify(baru));
              } catch {
                /* penyimpanan ditolak — banner tertutup untuk halaman ini saja */
              }
            }}
          />
        );
      })}
    </div>
  );
}
