/**
 * 404 konsol — untuk `notFound()` (tenant yang tidak ada, akun operator yang
 * sudah dicabut) DAN alamat yang tidak cocok dengan rute mana pun: aplikasi ini
 * punya SATU root layout, jadi `app/not-found.tsx` menangani keduanya.
 *
 * Yang tidak sampai ke sini: host yang salah dan IP di luar daftar — proxy
 * menjawabnya 404 polos lebih dulu, sengaja tanpa halaman apa pun.
 */
import { getT } from "@sai/platform/i18n/server";
import { StatusScreen } from "@sai/ui/status-screen";

export default async function OperatorNotFound() {
  const t = await getT();
  return (
    <StatusScreen
      kind="notFound"
      title={t("notFound.title")}
      description={t("notFound.description")}
      home={{ label: t("error.toHome"), href: "/" }}
    />
  );
}
