"use client";

/**
 * Identitas + jalan keluar, untuk layar yang TIDAK punya chrome apa pun.
 *
 * Lahir di `/select-company` (issue #104) dan ditarik ke sini saat `/platform`
 * membutuhkannya juga (issue #172) — dua layar pra-aplikasi, satu janji.
 *
 * Tanpa komponen ini, layar semacam itu hanya bisa dimasuki dan tidak bisa
 * ditinggalkan: tidak ada menu samping, tidak ada menu avatar. Pengunjung yang
 * ternyata masuk sebagai AKUN YANG SALAH — komputer bersama, sesi rekan kerja
 * yang belum ditutup — hanya punya satu tindakan yang mungkin: membuka buku
 * perusahaan dengan akun orang lain. (MASTER.md §Orientasi Perusahaan: layar
 * pra-aplikasi WAJIB punya jalan keluar.)
 *
 * Namanya ditulis lebih dulu karena "keluar" baru berguna setelah orangnya
 * sadar ia masuk sebagai siapa.
 */

import { signOut } from "next-auth/react";
import { Flex, theme } from "antd";
import { LogoutOutlined } from "@ant-design/icons";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

export function SignedInAs({ name }: { name: string }) {
  const t = useT();
  const { token } = theme.useToken();
  return (
    <Flex wrap align="center" justify="space-between" gap={token.marginSM}>
      <p style={{ margin: 0, minWidth: 0, color: token.colorTextSecondary }}>
        {t("auth.selectCompany.signedInAs")}{" "}
        <span style={{ fontWeight: 500, color: token.colorText }}>{name}</span>
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        style={{ flexShrink: 0 }}
        onClick={() => void signOut({ callbackUrl: "/login" })}
      >
        <LogoutOutlined aria-hidden="true" style={{ fontSize: 16 }} />
        {t("auth.selectCompany.signOut")}
      </Button>
    </Flex>
  );
}
