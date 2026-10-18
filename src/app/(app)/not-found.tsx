/**
 * 404 di dalam aplikasi — untuk `notFound()` dari penjaga mana pun di bawah
 * root layout `(app)` (tenant/PT yang tidak dikenal, dokumen orang lain, rute
 * berlingkup jalur yang salah). Penjaga SENGAJA menjawab "tidak ada", bukan
 * "terlarang" (tests/tenant-routes.test.ts), jadi layar ini juga tidak
 * menyebut alasan apa pun.
 *
 * Alamat yang sama sekali tidak cocok dengan rute dijawab
 * `app/global-not-found.tsx` — aplikasi ini punya dua root layout, jadi tidak
 * ada satu `app/not-found.tsx` yang bisa dirakit untuk keduanya.
 */
import { getT } from "@sai/platform/i18n/server";
import { StatusScreen } from "@sai/ui/status-screen";

export default async function AppNotFound() {
  const t = await getT();
  return (
    <StatusScreen
      kind="notFound"
      title={t("notFound.title")}
      description={t("notFound.description")}
      home={{ label: t("error.toHome"), href: "/dashboard" }}
    />
  );
}
