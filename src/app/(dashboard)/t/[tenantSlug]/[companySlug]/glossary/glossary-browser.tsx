"use client";

/**
 * Penjelajah Kamus Istilah (issue #21) — pencarian + saringan kategori.
 *
 * Semua isinya berasal dari `src/lib/labels.ts`, kamus yang sama dengan
 * `<TermTooltip>` (issue #1): definisi ditulis satu kali, dipakai di mana-mana.
 * Komponen ini hanya menyaring dan menggambar.
 *
 * ── Grup chip `aria-pressed` DIGANTI `Segmented` (issue #198) ──────────────
 * Berkas ini adalah salah satu dari dua pengecualian tombol MENTAH yang
 * disahkan `tests/design-system-primitives.test.ts`. Alasannya dulu: "semantik
 * toggle, belum ada primitifnya". Konversi AntD menghapus alasan itu —
 * `Segmented` adalah kelompok pilihan SALING MENIADAKAN, yang memang bentuk
 * saringan ini (satu kategori, atau "semua"), dan ia merender
 * `role="radiogroup"` berisi `<input type="radio">` sungguhan: panah kiri/kanan
 * berpindah pilihan, `checked` diumumkan pembaca layar, dan keadaan aktifnya
 * ditandai "ibu jari" yang bergeser — bukan warna saja.
 *
 * Itu lebih ketat daripada `aria-pressed`: tujuh tombol beratribut `aria-pressed`
 * mengumumkan tujuh keadaan tekan yang berdiri sendiri, padahal hanya satu yang
 * boleh aktif. `Tag.CheckableTag` sengaja TIDAK dipilih — ia `<span onClick>`,
 * tak bisa difokus keyboard sama sekali.
 *
 * Karena tombol mentahnya hilang, entri berkas ini DIKELUARKAN dari
 * `RAW_BUTTON_ALLOWLIST` (tes itu punya penjaga "daftar tidak menyimpan entri
 * basi" yang akan gagal kalau entrinya ditinggal).
 */

import { Link } from "@/components/ui/app-link";
import { useMemo, useState } from "react";
import { Flex, Segmented } from "antd";
import { Search, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  TERM_CATEGORIES,
  searchTerms,
  termAnchorId,
  termsByCategory,
  type TermCategory,
} from "@/lib/labels";
import { useDictionary, useT } from "@/lib/i18n/client";
import { termCategoryLabels } from "@/lib/i18n/labels";

/** `marginLG` 24 · `marginSM` 12 · `margin` 16 — token AntD sebagai angka. */
const SECTION_GAP = 24;
const GROUP_GAP = 32;
const CONTROL_GAP = 12;
const CARD_GAP = 16;
/** Lebar nyaman kotak pencarian (`max-w-md` lama) & lebar minimum satu kartu. */
const SEARCH_MAX_WIDTH = 448;
const CARD_MIN_WIDTH = 320;
/** Ruang untuk ikon cari di dalam kotak isian (`pl-9` lama). */
const SEARCH_ICON_INSET = 36;
/** Navbar menempel di atas — jangkar "Pelajari ini" tidak boleh tertutup. */
const ANCHOR_OFFSET = 96;
const ICON_SIZE = 16;
const STRONG = "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"];

const MUTED: React.CSSProperties = { color: "var(--ant-color-text-secondary)" };

type Filter = TermCategory | "semua";

export function GlossaryBrowser() {
  const t = useT();
  const categoryLabels = termCategoryLabels(useDictionary());
  const [query, setQuery] = useState("");
  const [kategori, setKategori] = useState<Filter>("semua");

  const groups = useMemo(
    () => termsByCategory(searchTerms(query, kategori === "semua" ? undefined : kategori)),
    [query, kategori]
  );
  const total = groups.reduce((sum, group) => sum + group.terms.length, 0);

  const filters: { value: Filter; label: string }[] = [
    { value: "semua", label: t("common.all") },
    ...TERM_CATEGORIES.map((c) => ({ value: c as Filter, label: categoryLabels[c] })),
  ];

  return (
    <Flex vertical gap={SECTION_GAP}>
      <Flex vertical gap={CONTROL_GAP}>
        <div style={{ position: "relative", maxWidth: SEARCH_MAX_WIDTH }}>
          {/* Ikon diikat ke sisi BAWAH agar tetap sejajar dengan kotak isian,
              karena <Input> menaruh labelnya di atas kotak. */}
          <Search
            size={ICON_SIZE}
            style={{
              position: "absolute",
              bottom: 12,
              insetInlineStart: 12,
              pointerEvents: "none",
              color: "var(--ant-color-text-secondary)",
            }}
            aria-hidden="true"
          />
          <Input
            id="cari-istilah"
            label={t("glossary.searchLabel")}
            placeholder={t("glossary.searchPlaceholder")}
            style={{ paddingInlineStart: SEARCH_ICON_INSET }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Tujuh kategori tidak selalu muat di 375px; yang menggulung adalah
            kelompoknya sendiri, bukan halamannya. */}
        <div style={{ overflowX: "auto", maxWidth: "100%" }}>
          <Segmented<Filter>
            aria-label={t("glossary.filterAria")}
            value={kategori}
            onChange={setKategori}
            options={filters}
          />
        </div>

        <p style={{ margin: 0, fontVariantNumeric: "tabular-nums", ...MUTED }} aria-live="polite">
          {t("glossary.shown", { count: total })}
        </p>
      </Flex>

      {total === 0 ? (
        <Card>
          <EmptyState
            title={t("glossary.emptyTitle")}
            description={t("glossary.emptyDescription")}
          />
        </Card>
      ) : (
        <Flex vertical gap={GROUP_GAP}>
          {groups.map((group) => (
            <section key={group.kategori}>
              <h2
                style={{
                  margin: 0,
                  marginBottom: CONTROL_GAP,
                  fontSize: "var(--ant-font-size-lg)",
                  fontWeight: STRONG,
                }}
              >
                {categoryLabels[group.kategori]}
              </h2>
              <div
                style={{
                  display: "grid",
                  gap: CARD_GAP,
                  gridTemplateColumns: `repeat(auto-fit, minmax(${CARD_MIN_WIDTH}px, 1fr))`,
                }}
              >
                {group.terms.map((entry) => (
                  // Anchor "Pelajari ini" mendarat di sini; `scrollMarginTop`
                  // menjaga kartunya tidak tertutup navbar yang menempel di atas.
                  <div
                    key={entry.key}
                    id={termAnchorId(entry.key)}
                    style={{ scrollMarginTop: ANCHOR_OFFSET }}
                  >
                    <Card style={{ height: "100%" }}>
                      <div style={{ padding: 20 }}>
                        <h3 style={{ margin: 0, fontSize: "var(--ant-font-size)", fontWeight: STRONG }}>
                          {entry.label}
                        </h3>
                        <p
                          style={{
                            margin: 0,
                            marginTop: 2,
                            fontWeight: STRONG,
                            color: "var(--ant-color-link)",
                          }}
                        >
                          {entry.term}
                        </p>
                        <p style={{ margin: 0, marginTop: 8, ...MUTED }}>{entry.definisi}</p>
                        {entry.contoh && (
                          <p
                            style={{
                              margin: 0,
                              marginTop: CONTROL_GAP,
                              padding: CONTROL_GAP,
                              borderRadius: "var(--ant-border-radius)",
                              background: "var(--ant-color-fill-quaternary)",
                              ...MUTED,
                            }}
                          >
                            <span style={{ fontWeight: STRONG, color: "var(--ant-color-text)" }}>
                              {t("term.example")}{" "}
                            </span>
                            {entry.contoh}
                          </p>
                        )}
                        {entry.href && (
                          <Link
                            href={entry.href}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              marginTop: CONTROL_GAP,
                              fontWeight: STRONG,
                              color: "var(--ant-color-link)",
                            }}
                          >
                            {t("glossary.openInApp")}
                            <ArrowUpRight size={ICON_SIZE} aria-hidden="true" />
                          </Link>
                        )}
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </Flex>
      )}
    </Flex>
  );
}
