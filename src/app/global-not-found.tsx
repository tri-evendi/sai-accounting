/**
 * 404 untuk alamat yang TIDAK COCOK dengan rute mana pun.
 *
 * Aplikasi ini punya dua root layout — `(app)` dan `(marketing)` — dan tidak
 * punya `app/layout.tsx` di atasnya, jadi tidak ada `app/not-found.tsx` yang
 * bisa dirakit. Next menyediakan `global-not-found` (flag
 * `experimental.globalNotFound` di next.config.ts) untuk kasus PERSIS ini; ia
 * melewati layout, jadi `<html>` ditulis `RootDocument` di sini. Sebelum ini
 * alamat yang salah ketik mendarat di layar 404 bawaan Next — polos, berbahasa
 * Inggris, tanpa jalan kembali.
 *
 * Tujuan pulangnya halaman utama: orang yang mengetik alamat salah bisa
 * pelanggan yang sudah masuk maupun pengunjung pertama, dan `/` melayani
 * keduanya (dasbor tinggal satu klik dari sana).
 */
import type { Metadata } from "next";

import { APP_NAME } from "@sai/core/constants";
import { getLocale, getT } from "@sai/platform/i18n/server";
import { RootDocument } from "@sai/ui/providers/root-document";
import { StatusScreen } from "@sai/ui/status-screen";
import { getTheme } from "@sai/ui/theme/server";
import { activeBrandMarkSrc } from "@sai/platform/brand-routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `${t("notFound.title")} · ${APP_NAME}` };
}

export default async function GlobalNotFound() {
  const [locale, theme, t, brandMarkSrc] = await Promise.all([getLocale(), getTheme(), getT(), activeBrandMarkSrc()]);
  return (
    <RootDocument locale={locale} theme={theme} brandMarkSrc={brandMarkSrc}>
      <StatusScreen
        kind="notFound"
        minHeight="100vh"
        title={t("notFound.title")}
        description={t("notFound.description")}
        home={{ label: t("error.toLanding"), href: "/" }}
      />
    </RootDocument>
  );
}
