/**
 * 404 untuk `notFound()` di permukaan pemasaran. Tanpa `<LocaleProvider>` di
 * sini (#399), jadi teks diterjemahkan di server dan diteruskan lewat prop.
 */
import { getT } from "@sai/platform/i18n/server";
import { StatusScreen } from "@sai/ui/status-screen";

export default async function MarketingNotFound() {
  const t = await getT();
  return (
    <StatusScreen
      kind="notFound"
      title={t("notFound.title")}
      description={t("notFound.description")}
      home={{ label: t("error.toLanding"), href: "/" }}
    />
  );
}
