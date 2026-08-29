import type { DictionaryKey } from "@/lib/i18n/dictionary";

/**
 * Status perintah produksi → kunci kamus & warna lencana.
 *
 * Satu berkas dipakai daftar & detail: dua peta untuk satu kosakata adalah dua
 * peta yang suatu hari menyebut status yang sama dengan dua nama.
 *
 * Kuncinya ditulis UTUH, bukan dirangkai `productionOrders.status.${s}` —
 * bentuk rangkai membuat kuncinya tak terlihat pemindai kunci yatim (#260),
 * dan kunci yang dihapus dari kamus tidak akan ketahuan.
 */
const LABEL: Record<string, DictionaryKey> = {
  draft: "productionOrders.status.draft",
  released: "productionOrders.status.released",
  finished: "productionOrders.status.finished",
  canceled: "productionOrders.status.canceled",
};

export function statusLabelKey(status: string): DictionaryKey {
  return LABEL[status] ?? "productionOrders.status.draft";
}

export function statusVariant(status: string): "success" | "warning" | "default" {
  if (status === "finished") return "success";
  if (status === "released") return "warning";
  return "default";
}
