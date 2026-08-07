"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Flex, Grid, theme } from "antd";
import { CalculatorOutlined } from "@ant-design/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { effectiveAccountantMode } from "@/lib/accountant-mode";
import { ROLES, isFullAccessRole } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

/**
 * Mode Akuntan toggle (issue #11) — the primary surface for the preference.
 *
 * Lives in the navbar. Reads the current user's role + stored preference from
 * the session and shows the EFFECTIVE mode. Menekan tombol TIDAK langsung
 * mengganti mode: ia membuka dialog konfirmasi yang MENJELASKAN apa yang akan
 * berubah (ON vs OFF) dulu, baru menerapkan bila dikonfirmasi. Ini juga jadi
 * satu-satunya tempat penjelasan (menggantikan tooltip lama yang penuh jargon):
 * pengguna yang cuma ingin tahu tinggal buka lalu "Batal".
 *
 * Display-only: it changes what the user sees, never their role/authorisation,
 * and never what the posting engine writes.
 *
 * ── Setelah migrasi AntD (issue #193) ─────────────────────────────────────
 * Dulu elemen `button` mentah dengan pil rakitan tangan, dan karena itu terdaftar
 * di `RAW_BUTTON_ALLOWLIST`. Alasan pengecualian itu habis: yang dibutuhkan
 * ternyata persis `Button` primitif (40px, cincin fokus, transisi, keadaan
 * nonaktif) DITAMBAH satu `Badge` berteks sebagai penanda keadaan. Karena itu
 * berkas ini keluar dari daftar pengecualian.
 *
 * Dua hal yang sengaja dipertahankan lewat prop, bukan lewat rupa:
 *  • `role="switch"` + `aria-checked` — inilah yang membuat pembaca layar
 *    mengumumkannya sebagai sakelar dua keadaan, bukan tombol biasa. AntD
 *    `Switch` TIDAK dipakai: ia tidak punya tempat untuk label maupun kata
 *    "AKTIF/NONAKTIF", dan sakelar tanpa kata melanggar aturan "warna/posisi
 *    tak boleh jadi penanda tunggal".
 *  • Kata keadaannya (`ON`/`OFF`) lewat `Badge` — penanda kedua di samping
 *    warna, dan tetap terbaca di layar sempit tempat label "Mode Akuntan"
 *    sendiri disembunyikan.
 *
 * Yang HILANG dan disengaja: pemintal saat menyimpan. `Button` primitif tidak
 * meneruskan `loading` AntD (tanda tangannya sengaja `button` HTML), dan
 * `Spin` adalah sebuah `div` — tidak sah di dalam tombol. Umpan baliknya kini
 * keadaan nonaktif + `aria-busy`; jendelanya satu permintaan PATCH.
 */
export function AccountantModeToggle() {
  const t = useT();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const { data: session, update } = useSession();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!session?.user) return null;

  const role = session.user.role;
  // The toggle is meaningful only where there are accounting surfaces or
  // transaction forms with debit/kredit terminology: the full-access roles
  // (managing_director, administrator — menus + forms) and finance_manager
  // (forms). warehouse_head has neither, so it never sees a control that would
  // do nothing. Administrators default to ON, so this is also their way OFF.
  if (!isFullAccessRole(role) && role !== ROLES.FINANCE_MANAGER) return null;

  const isOn = effectiveAccountantMode({
    role,
    accountantMode: session.user.accountantMode,
  });

  async function applyToggle() {
    if (saving) return;
    const next = !isOn;
    setSaving(true);
    try {
      const res = await apiFetch("/api/user/accountant-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountantMode: next }),
      });
      if (!res.ok) return;
      // Push the new preference into the JWT (jwt callback handles the trigger),
      // then re-render server components that read effective mode.
      await update({ accountantMode: next });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // Pesan konfirmasi bahasa sehari-hari, menjelaskan AKIBAT dari pilihan ini —
  // jargon dijelaskan (jurnal, buku besar), bukan diasumsikan. Teksnya hidup di
  // kamus (`accountantMode.*`) supaya penjelasan panjang ini ikut berbahasa
  // pengguna, bukan hanya tombolnya.
  const dialogTitle = isOn
    ? t("accountantMode.turnOffTitle")
    : t("accountantMode.turnOnTitle");
  const dialogMessage = isOn
    ? t("accountantMode.turnOffMessage")
    : t("accountantMode.turnOnMessage");

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setDialogOpen(true)}
        disabled={saving}
        aria-busy={saving}
        role="switch"
        aria-checked={isOn}
        aria-label={t("accountantMode.toggleAria", {
          state: isOn ? t("accountantMode.state.on") : t("accountantMode.state.off"),
        })}
        title={t("accountantMode.toggleTitle")}
      >
        <Flex component="span" align="center" gap={token.marginXXS}>
          <CalculatorOutlined aria-hidden="true" style={{ fontSize: 16 }} />
          {screens.sm && <span>{t("accountantMode.label")}</span>}
          <Badge
            variant={isOn ? "success" : "default"}
            style={{ marginInlineEnd: 0 }}
          >
            {isOn ? t("accountantMode.on") : t("accountantMode.off")}
          </Badge>
        </Flex>
      </Button>

      {/* Dialog konfirmasi yang menjelaskan pilihan sebelum diterapkan. "Batal"
          juga berfungsi sebagai jalan "cuma ingin tahu" tanpa mengubah apa pun. */}
      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={dialogTitle}
        message={dialogMessage}
        confirmLabel={
          isOn ? t("accountantMode.confirmTurnOff") : t("accountantMode.confirmTurnOn")
        }
        confirmVariant="primary"
        onConfirm={applyToggle}
      />
    </>
  );
}
