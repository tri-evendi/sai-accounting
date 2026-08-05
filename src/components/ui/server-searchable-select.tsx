"use client";

/**
 * ServerSearchableSelect (ditulis ulang di atas AntD `Select showSearch` pada
 * issue #188) — saudara `SearchableSelect` untuk daftar yang terlalu besar
 * untuk dikirim ke klien (audit: pemilih dokumen terpotong `take: 300`).
 *
 * Bedanya satu, dan tidak berubah: opsi TIDAK datang sebagai prop statis,
 * melainkan dicari ke server. Setiap ketikan menunggu ~300ms lalu memanggil
 * `fetchUrl` dengan `search=<q>&take=20` dan mengharapkan kontrak jawaban
 * tunggal `{ options: [{ value, label, hint? }] }` (lihat `src/lib/picker.ts`).
 * Muatan awal (pencarian kosong) berisi ±20 dokumen terbaru — dokumen lama
 * tetap terjangkau lewat pencarian, bukan hilang di balik potongan.
 *
 * ── Tiga hal yang harus selamat dari pergantian kulit ─────────────────────
 *
 *  1. **`filterOption: false`.** Menyaring adalah pekerjaan server. Kalau AntD
 *     ikut menyaring hasil yang sudah disaring server, opsi yang label-nya tidak
 *     memuat kata kunci (dicocokkan server lewat nomor dokumen, mitra, atau
 *     tanggal) akan hilang dari layar — hasil yang benar, disembunyikan klien.
 *
 *  2. **Label pilihan aktif tetap tampil walau barisnya tidak ada di halaman
 *     hasil sekarang.** AntD mengambil label dari daftar `options`; begitu
 *     pengguna mengetik lagi, baris yang sedang terpilih bisa lenyap dari daftar
 *     dan pemicunya akan menampilkan id mentah. `labelRender` di bawah menambal
 *     itu dari opsi yang terakhir dipilih (`picked`) atau dari `initialOption`
 *     yang dioper server.
 *
 *  3. **Debounce + pembatalan.** Permintaan sebelumnya di-`abort` saat ketikan
 *     berikutnya datang, dan spinner TIDAK dimatikan oleh permintaan yang
 *     dibatalkan — kalau tidak, kolom berkedip "kosong" di antara dua ketikan.
 *
 * ── Yang hilang ───────────────────────────────────────────────────────────
 * `searchPlaceholder` tidak lagi berpengaruh (alasannya sama dengan
 * `SearchableSelect`: yang diketik sekarang pemicunya sendiri). Prop-nya tetap
 * diterima agar lima pemanggilnya tidak disentuh di fase B.
 */

import { useEffect, useRef, useState } from "react";
import { Select, Spin } from "antd";

import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/client";
import type { PickerOption } from "@/lib/picker";

export type { PickerOption };

interface ServerSearchableSelectProps {
  /** Endpoint GET yang menjawab `{ options: [...] }`; boleh sudah membawa
   *  query string sendiri (mis. `/api/customers?active=1&picker=1`). */
  fetchUrl: string;
  /** Nama parameter pencarian. Bawaan `search`; `/api/returns/purchase`
   *  memakai `searchOrigin` agar tidak menabrak mode lamanya. */
  searchParam?: string;
  value: string | null;
  onChange: (value: string | null, option: PickerOption | null) => void;
  /** Opsi yang sudah terpilih saat halaman dirender server (mis. `?contractId=`)
   *  — supaya labelnya tampil tanpa menunggu halaman hasil memuatnya. */
  initialOption?: PickerOption | null;
  id?: string;
  label?: string;
  placeholder?: string;
  /** @deprecated Tidak berpengaruh sejak #188 — lihat komentar kepala berkas. */
  searchPlaceholder?: string;
  emptyText?: string;
  /** Show a clear (×) button when a value is selected. Default true. */
  clearable?: boolean;
  disabled?: boolean;
}

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

export function ServerSearchableSelect({
  fetchUrl,
  searchParam = "search",
  value,
  onChange,
  initialOption,
  id,
  label,
  placeholder,
  emptyText,
  clearable = true,
  disabled = false,
}: ServerSearchableSelectProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  /** Opsi yang terakhir dipilih pengguna — sumber label saat barisnya sudah
   *  tidak ada lagi di halaman hasil berikutnya. */
  const [picked, setPicked] = useState<PickerOption | null>(initialOption ?? null);
  /** Muatan pertama langsung; setelah itu tiap ketikan menunggu debounce. */
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(
      async () => {
        try {
          const sep = fetchUrl.includes("?") ? "&" : "?";
          const res = await fetch(
            `${fetchUrl}${sep}${searchParam}=${encodeURIComponent(query.trim())}&take=${PAGE_SIZE}`,
            { signal: controller.signal }
          );
          if (res.ok) {
            const data = (await res.json()) as { options?: PickerOption[] };
            setOptions(Array.isArray(data.options) ? data.options : []);
            loadedOnce.current = true;
          } else {
            setOptions([]);
          }
        } catch {
          // Dibatalkan (ketikan berikutnya) atau jaringan putus — hasil
          // sebelumnya dibiarkan; `finally` di bawah tidak mematikan spinner
          // pada pembatalan karena permintaan penggantinya sedang berjalan.
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      loadedOnce.current ? DEBOUNCE_MS : 0
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, fetchUrl, searchParam]);

  return (
    <div className="space-y-1">
      {label && <Label htmlFor={id}>{label}</Label>}
      <Select<string, PickerOption>
        data-slot="server-searchable-select"
        id={id}
        style={{ width: "100%" }}
        options={options}
        value={value ?? undefined}
        onChange={(next, option) => {
          const picking = Array.isArray(option) ? (option[0] ?? null) : (option ?? null);
          setPicked(picking);
          onChange(next ?? null, picking);
        }}
        onOpenChange={(next) => {
          setOpen(next);
          // Pencarian AntD dibersihkan sendiri saat popup tertutup; kalau
          // `query` tidak ikut dibersihkan, pembukaan berikutnya menampilkan
          // hasil pencarian lama sementara kotak ketiknya sudah kosong.
          if (!next) setQuery("");
        }}
        placeholder={placeholder ?? t("searchableSelect.placeholder")}
        labelRender={({ label: fromOptions, value: current }) =>
          fromOptions ??
          (picked?.value === current ? picked.label : undefined) ??
          (initialOption?.value === current ? initialOption.label : undefined) ??
          current
        }
        optionRender={(option) => (
          <span style={{ display: "block", minWidth: 0 }}>
            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>
              {option.data.label}
            </span>
            {option.data.hint && (
              <span
                style={{
                  display: "block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontSize: "0.75rem",
                  opacity: 0.8,
                }}
              >
                {option.data.hint}
              </span>
            )}
          </span>
        )}
        notFoundContent={
          loading ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Spin size="small" />
              {t("common.loading")}
            </span>
          ) : (
            (emptyText ?? t("searchableSelect.empty"))
          )
        }
        // Spinner juga di pemicunya: saat daftar lama masih terlihat, indikator
        // di dalam daftar tidak pernah muncul, dan pengguna tak tahu bahwa
        // hasilnya sedang diperbarui.
        loading={loading}
        allowClear={clearable}
        disabled={disabled}
        showSearch={{ onSearch: setQuery, filterOption: false }}
        popupMatchSelectWidth
      />
    </div>
  );
}
