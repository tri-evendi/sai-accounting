/**
 * `/content` — ISI HALAMAN DEPAN: sunting draf → pratinjau → terbit → riwayat.
 *
 * ══ TIGA TAMPILAN, SATU URL ═══════════════════════════════════════════════
 * `?view=edit` (bawaan) · `?view=review` · `?view=history`, plus `?section=`,
 * `?show=`, `?q=` lewat form GET. Hasilnya alamat yang bisa ditempel ke tiket
 * dan tombol Kembali yang benar-benar kembali (pages/operator.md: saringan
 * lewat form GET).
 *
 *   • Sunting: satu bagian halaman, ketiga bahasa BERDAMPINGAN. Setiap isian
 *     menunjukkan teks bawaan, yang tayang, drafnya, batas karakternya, dan
 *     bahasa yang tertinggal. Simpan = draf; halaman publik belum berubah.
 *   • Tinjau: setiap draf sebagai baris "tayang sekarang → sesudah terbit",
 *     pratinjau lewat tautan bertoken, terbitkan (owner), buang draf, dan
 *     kunci yatim.
 *   • Riwayat: penerbitan terakhir dengan nilai sebelum/sesudah; "batalkan
 *     penerbitan" dan "pakai versi ini" membuat DRAF lalu membuka Tinjau.
 *
 * ══ BAWAAN TETAP DARI KAMUS ═══════════════════════════════════════════════
 * Kamus tetap sumber bawaan (alasannya di kepala `@sai/core/site-content`).
 * `getDictionary` di host konsol tidak memasang penimpa (`/content` bukan
 * jalur pemasaran), jadi yang tampil sebagai "bawaan" memang bawaan.
 */

import { HistoryOutlined } from "@ant-design/icons";

import { Link } from "@sai/ui/app-link";
import { Button, ButtonLink } from "@sai/ui/button";
import { EmptyState } from "@sai/ui/empty-state";
import { Input } from "@sai/ui/input";
import { PageHeader } from "@sai/ui/page-header";
import { Select } from "@sai/ui/select";
import { StaticTable } from "@sai/ui/static-table";
import type { SaiColumns } from "@sai/ui/table-columns";
import { LOCALES, LOCALE_LABELS, type Locale } from "@sai/core/i18n/config";
import type { Dictionary } from "@sai/core/i18n/dictionary";
import {
  SITE_CONTENT_PREFIX,
  SITE_CONTENT_PREVIEW_TTL_MINUTES,
  SITE_CONTENT_SECTIONS,
  contentCellState,
  contentFieldSpec,
  defaultsOf,
  isEditableInAll,
  lockedBehindLocales,
  resolveSection,
  sectionOf,
  siteContentDefaults,
  type ContentCell,
} from "@sai/core/site-content";
import { formatDateTime } from "@sai/core/utils";
import { getDictionary, getT } from "@sai/platform/i18n/server";
import {
  siteContentEntriesForOperator,
  siteContentPublications,
  type SiteContentEntryRow,
} from "@sai/platform/site-content-store";
import {
  CONSOLE_MUTED,
  CONSOLE_PAGE,
  ConsoleNotice,
  ConsolePanel,
  ConsoleSection,
} from "@op/components/operator/console-ui";
import {
  ContentEditor,
  type ContentEditorCell,
  type ContentEditorRow,
} from "@op/components/operator/content-editor";
import { ContentOrphanPurge, ContentPublishControls } from "@op/components/operator/content-publish-controls";
import { requireOperatorPage } from "@op/lib/operator/guard";
import { operatorCan } from "@op/lib/operator/roles";
import {
  operatorCreateContentPreview,
  operatorDiscardContentDrafts,
  operatorPublishContent,
  operatorPurgeOrphanContent,
  operatorRevertContent,
  operatorSaveContentDrafts,
} from "./actions";

export const dynamic = "force-dynamic";

const VIEWS = ["edit", "review", "history"] as const;
type View = (typeof VIEWS)[number];

const SHOWS = ["all", "changed", "behind"] as const;
type Show = (typeof SHOWS)[number];

/** Jumlah penerbitan di tampilan riwayat. */
const HISTORY_LIMIT = 30;

/** Teks panjang di sel tabel: dibungkus, bukan memaksa tabel melebar. */
const CELL_TEXT: React.CSSProperties = {
  display: "block",
  maxWidth: 420,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

type T = Awaited<ReturnType<typeof getT>>;

interface KeyModel extends ContentEditorRow {
  sectionId: string;
}

/** Baris basis data → model per kunci, ketiga bahasa. */
function buildModel(
  dictionaries: Record<Locale, Dictionary>,
  rows: readonly SiteContentEntryRow[]
): { keys: KeyModel[]; orphans: string[] } {
  const byKey = new Map<string, SiteContentEntryRow[]>();
  for (const row of rows) byKey.set(row.key, [...(byKey.get(row.key) ?? []), row]);

  const keys: KeyModel[] = [];
  for (const key of siteContentDefaults(dictionaries.id).keys()) {
    if (!isEditableInAll(dictionaries, key)) continue;
    const defaults = defaultsOf(dictionaries, key);
    const stored = byKey.get(key) ?? [];
    const cells = {} as Record<Locale, ContentEditorCell>;
    for (const locale of LOCALES) {
      const published = stored.find((r) => r.locale === locale && r.status === "published");
      const draft = stored.find((r) => r.locale === locale && r.status === "draft");
      cells[locale] = {
        defaultValue: defaults[locale],
        published: published?.value ?? null,
        draft: draft ? draft.value : undefined,
        /* Diformat DI SERVER: `Intl` di peramban memakai zona waktu
           pengunjung, dua jawaban untuk satu peristiwa. */
        publishedBy: published?.updatedBy ?? "",
        publishedAt: published ? formatDateTime(published.updatedAt) : "",
        draftBy: draft?.updatedBy ?? "",
        draftAt: draft ? formatDateTime(draft.updatedAt) : "",
      };
    }
    keys.push({
      key,
      name: key.slice(SITE_CONTENT_PREFIX.length),
      sectionId: sectionOf(key).id,
      spec: contentFieldSpec(Object.values(defaults)),
      cells,
      behind: lockedBehindLocales(cells),
    });
  }

  const orphans = [...byKey.keys()].filter((k) => !isEditableInAll(dictionaries, k)).sort();
  return { keys, orphans };
}

function isChanged(model: KeyModel): boolean {
  return LOCALES.some((l) => contentCellState(model.cells[l]) !== "default");
}

function matches(model: KeyModel, q: string): boolean {
  if (model.key.toLowerCase().includes(q)) return true;
  return LOCALES.some((l) => {
    const c: ContentCell = model.cells[l];
    return [c.defaultValue, c.published ?? "", c.draft ?? ""].some((v) => v.toLowerCase().includes(q));
  });
}

function viewHref(view: View, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ view, ...extra });
  return `/content?${params.toString()}`;
}

function ViewTabs({ view, draftCount, t }: { view: View; draftCount: number; t: T }) {
  const tabs: { id: View; label: string }[] = [
    { id: "edit", label: t("operator.content.viewEdit") },
    { id: "review", label: t("operator.content.viewReview", { count: draftCount }) },
    { id: "history", label: t("operator.content.viewHistory") },
  ];
  /* Chip tampilan: yang aktif `secondary` (berbingkai), saudaranya `ghost`,
     tidak pernah berisi penuh (MASTER.md §Aksi utama per layar). */
  return (
    <nav aria-label={t("operator.content.viewsAria")}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ant-margin-xs)" }}>
        {tabs.map((tab) => (
          <ButtonLink
            key={tab.id}
            href={viewHref(tab.id)}
            size="sm"
            variant={tab.id === view ? "secondary" : "ghost"}
            aria-current={tab.id === view ? "page" : undefined}
          >
            {tab.label}
          </ButtonLink>
        ))}
      </div>
    </nav>
  );
}

function shownValue(value: string | null, fallback: string, t: T): string {
  return value === null ? t("operator.content.valueDefault", { text: fallback }) : value;
}

function sectionLabelOf(key: string, t: T): string {
  return t(sectionOf(key).labelKey);
}

/* ═══════════════════════════════════ Halaman ═══════════════════════════════════ */

export default async function OperatorContentPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; section?: string; show?: string; q?: string; reverted?: string }>;
}) {
  const { operator } = await requireOperatorPage();
  const t = await getT();
  const params = await searchParams;

  const view: View = (VIEWS as readonly string[]).includes(params.view ?? "")
    ? (params.view as View)
    : "edit";
  const canEdit = operatorCan(operator.role, "site.content");
  const canPublish = operatorCan(operator.role, "site.publish");

  const [dictionaryList, rows] = await Promise.all([
    Promise.all(LOCALES.map((l) => getDictionary(l))),
    siteContentEntriesForOperator(),
  ]);
  const dictionaries = Object.fromEntries(LOCALES.map((l, i) => [l, dictionaryList[i]])) as Record<
    Locale,
    Dictionary
  >;
  const { keys, orphans } = buildModel(dictionaries, rows ?? []);
  const draftCount = keys.reduce(
    (n, k) => n + LOCALES.filter((l) => k.cells[l].draft !== undefined).length,
    0
  );

  return (
    <div>
      <PageHeader
        title={t("operator.content.heading")}
        description={t("operator.content.description")}
        actions={
          <ButtonLink href="/audit" variant="outline" size="sm">
            {t("operator.nav.audit")}
          </ButtonLink>
        }
      />

      <div style={CONSOLE_PAGE}>
        <ViewTabs view={view} draftCount={draftCount} t={t} />

        {rows === null && <ConsoleNotice>{t("operator.content.unavailable")}</ConsoleNotice>}

        {rows !== null && view === "edit" && (
          <EditView keys={keys} draftCount={draftCount} canEdit={canEdit} params={params} t={t} />
        )}
        {rows !== null && view === "review" && (
          <ReviewView
            keys={keys}
            orphans={orphans}
            draftCount={draftCount}
            canEdit={canEdit}
            canPublish={canPublish}
            reverted={params.reverted}
            t={t}
          />
        )}
        {rows !== null && view === "history" && (
          <HistoryView dictionaries={dictionaries} canEdit={canEdit} reverted={params.reverted} t={t} />
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────── Sunting ─────────────────────────────────── */

function EditView({
  keys,
  draftCount,
  canEdit,
  params,
  t,
}: {
  keys: KeyModel[];
  draftCount: number;
  canEdit: boolean;
  params: { section?: string; show?: string; q?: string };
  t: T;
}) {
  const section = resolveSection(params.section);
  const show: Show = (SHOWS as readonly string[]).includes(params.show ?? "")
    ? (params.show as Show)
    : "all";
  const q = params.q?.trim().toLowerCase() ?? "";

  /* Saat mencari, BAGIAN diabaikan: orang datang membawa kalimat dari layar
     atau nama kunci dari laporan, bukan nama bagian. */
  const visible = keys.filter((k) => {
    if (q ? !matches(k, q) : k.sectionId !== section.id) return false;
    if (show === "changed") return isChanged(k);
    if (show === "behind") return k.behind.length > 0;
    return true;
  });

  const changedPerSection = new Map<string, number>();
  for (const k of keys) {
    if (isChanged(k)) changedPerSection.set(k.sectionId, (changedPerSection.get(k.sectionId) ?? 0) + 1);
  }
  const sectionOptions = SITE_CONTENT_SECTIONS.filter(
    (s) => s.id !== "other" || keys.some((k) => k.sectionId === "other")
  ).map((s) => {
    const count = changedPerSection.get(s.id) ?? 0;
    const label = t(s.labelKey);
    return {
      value: s.id,
      label: count > 0 ? t("operator.content.sectionOptionCounts", { label, count }) : label,
    };
  });

  return (
    <>
      <ConsolePanel>
        <form
          method="get"
          action="/content"
          style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "var(--ant-margin-sm)" }}
        >
          <input type="hidden" name="view" value="edit" />
          <div style={{ width: "100%", maxWidth: 280 }}>
            <Select
              name="section"
              label={t("operator.content.sectionLabel")}
              defaultValue={section.id}
              options={sectionOptions}
            />
          </div>
          <div style={{ width: "100%", maxWidth: 240 }}>
            <Select
              name="show"
              label={t("operator.content.showLabel")}
              defaultValue={show}
              options={[
                { value: "all", label: t("operator.content.showAll") },
                { value: "changed", label: t("operator.content.showChanged") },
                { value: "behind", label: t("operator.content.showBehind") },
              ]}
            />
          </div>
          <div style={{ width: "100%", maxWidth: 320 }}>
            <Input
              name="q"
              label={t("operator.content.searchLabel")}
              placeholder={t("operator.content.searchPlaceholder")}
              defaultValue={params.q?.trim() ?? ""}
            />
          </div>
          {/* Kirim form GET: membaca ulang, tidak menulis — `outline`. */}
          <Button type="submit" variant="outline">
            {t("operator.tenants.filter")}
          </Button>
        </form>
      </ConsolePanel>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--ant-margin-sm)",
        }}
      >
        <p style={CONSOLE_MUTED}>
          {q
            ? visible.length === 0
              ? t("operator.content.searchEmpty", { q })
              : t("operator.content.searchFound", { count: visible.length, q })
            : draftCount > 0
              ? t("operator.content.draftsPending", { count: draftCount })
              : t("operator.content.draftsNone")}
        </p>
        {draftCount > 0 && (
          <ButtonLink href={viewHref("review")} variant="outline">
            {t("operator.content.reviewLink")}
          </ButtonLink>
        )}
      </div>

      {!canEdit ? (
        <ConsoleNotice>{t("operator.roleCannotEdit")}</ConsoleNotice>
      ) : visible.length === 0 ? (
        !q && <ConsoleNotice>{t("operator.content.filterEmpty")}</ConsoleNotice>
      ) : (
        <ContentEditor
          /* `key` membangun ulang editor saat pilihan berganti: tanpa itu RHF
             mempertahankan `defaultValues` render pertama, dan isian akan
             memperlihatkan nilai bagian SEBELUMNYA. */
          key={`${section.id}:${show}:${q}`}
          section={q ? "search" : section.id}
          rows={visible}
          showSection={q.length > 0}
          sectionLabels={Object.fromEntries(visible.map((k) => [k.key, sectionLabelOf(k.key, t)]))}
          localeLabels={LOCALE_LABELS}
          save={operatorSaveContentDrafts}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────── Tinjau ─────────────────────────────────── */

interface DraftRow {
  id: string;
  text: string;
  section: string;
  locale: string;
  live: string;
  after: string;
  by: string;
}

function ReviewView({
  keys,
  orphans,
  draftCount,
  canEdit,
  canPublish,
  reverted,
  t,
}: {
  keys: KeyModel[];
  orphans: string[];
  draftCount: number;
  canEdit: boolean;
  canPublish: boolean;
  reverted?: string;
  t: T;
}) {
  const drafts: DraftRow[] = [];
  for (const k of keys) {
    for (const locale of LOCALES) {
      const c = k.cells[locale];
      if (c.draft === undefined) continue;
      drafts.push({
        id: `${locale}:${k.key}`,
        text: k.name,
        section: sectionLabelOf(k.key, t),
        locale: LOCALE_LABELS[locale],
        live: shownValue(c.published, c.defaultValue, t),
        after: shownValue(c.draft, c.defaultValue, t),
        by: `${c.draftBy}, ${c.draftAt}`,
      });
    }
  }
  /* Tertinggal SESUDAH terbit: dihitung dari keadaan yang akan tayang. */
  const behind = keys.filter((k) => k.behind.length > 0);

  const columns: SaiColumns<DraftRow> = [
    {
      key: "text",
      title: t("operator.content.colText"),
      align: "left",
      render: (_v, row) => (
        <span>
          <span style={{ fontFamily: "var(--ant-font-family-code)" }}>{row.text}</span>
          <span style={{ ...CONSOLE_MUTED, display: "block" }}>{row.section}</span>
        </span>
      ),
    },
    { key: "locale", title: t("operator.content.colLocale"), align: "left", render: (_v, row) => row.locale },
    {
      key: "live",
      title: t("operator.content.colLive"),
      align: "left",
      render: (_v, row) => <span style={{ ...CELL_TEXT, color: "var(--ant-color-text-secondary)" }}>{row.live}</span>,
    },
    {
      key: "after",
      title: t("operator.content.colDraft"),
      align: "left",
      render: (_v, row) => <span style={CELL_TEXT}>{row.after}</span>,
    },
    {
      key: "by",
      title: t("operator.content.colBy"),
      align: "left",
      render: (_v, row) => <span style={{ ...CONSOLE_MUTED, whiteSpace: "nowrap" }}>{row.by}</span>,
    },
  ];

  const revertedCount = reverted !== undefined ? Number.parseInt(reverted, 10) : NaN;

  return (
    <>
      {Number.isFinite(revertedCount) && (
        <ConsoleNotice>
          {revertedCount > 0
            ? t("operator.content.reverted", { count: revertedCount })
            : t("operator.content.revertNothing")}
        </ConsoleNotice>
      )}

      <ConsolePanel
        title={t("operator.content.reviewHeading")}
        description={t("operator.content.reviewDescription", { minutes: SITE_CONTENT_PREVIEW_TTL_MINUTES })}
      >
        {drafts.length === 0 ? (
          <p style={CONSOLE_MUTED}>{t("operator.content.draftsNone")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--ant-margin)" }}>
            <StaticTable columns={columns} rows={drafts} rowKey={(row) => row.id} size="small" />
            {!canPublish && <ConsoleNotice>{t("operator.content.publishOwnerOnly")}</ConsoleNotice>}
            {canEdit && (
              <ContentPublishControls
                draftCount={draftCount}
                canPublish={canPublish}
                preview={operatorCreateContentPreview}
                publish={operatorPublishContent}
                discard={operatorDiscardContentDrafts}
              />
            )}
          </div>
        )}
      </ConsolePanel>

      {behind.length > 0 && (
        <ConsolePanel
          title={t("operator.content.behindHeading")}
          description={t("operator.content.behindDescription")}
        >
          <ul style={{ margin: 0, paddingInlineStart: "var(--ant-padding-lg)" }}>
            {behind.map((k) => {
              const done = LOCALES.filter((l) => !k.behind.includes(l));
              return (
                <li key={k.key} style={{ marginBottom: "var(--ant-margin-xxs)" }}>
                  <Link
                    href={viewHref("edit", { q: k.name })}
                    style={{ fontFamily: "var(--ant-font-family-code)", color: "var(--ant-color-link)" }}
                  >
                    {k.name}
                  </Link>{" "}
                  <span style={CONSOLE_MUTED}>
                    {t("operator.content.behind", {
                      done: done.map((l) => LOCALE_LABELS[l]).join(", "),
                      missing: k.behind.map((l) => LOCALE_LABELS[l]).join(", "),
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        </ConsolePanel>
      )}

      {orphans.length > 0 && (
        <ConsolePanel
          title={t("operator.content.orphanHeading")}
          description={t("operator.content.orphanDescription")}
          actions={
            canPublish ? <ContentOrphanPurge count={orphans.length} purge={operatorPurgeOrphanContent} /> : undefined
          }
        >
          <p style={{ ...CONSOLE_MUTED, fontFamily: "var(--ant-font-family-code)" }}>{orphans.join(", ")}</p>
        </ConsolePanel>
      )}
    </>
  );
}

/* ─────────────────────────────────── Riwayat ─────────────────────────────────── */

interface RevisionRow {
  id: number;
  text: string;
  locale: string;
  before: string;
  after: string;
}

async function HistoryView({
  dictionaries,
  canEdit,
  reverted,
  t,
}: {
  dictionaries: Record<Locale, Dictionary>;
  canEdit: boolean;
  reverted?: string;
  t: T;
}) {
  const publications = await siteContentPublications(HISTORY_LIMIT);
  if (publications === null) return <ConsoleNotice>{t("operator.content.unavailable")}</ConsoleNotice>;
  if (publications.length === 0) {
    return (
      <ConsolePanel>
        <EmptyState
          icon={<HistoryOutlined aria-hidden="true" style={{ fontSize: 48 }} />}
          title={t("operator.content.historyEmpty")}
        />
      </ConsolePanel>
    );
  }

  const kindLabel = (kind: string) =>
    kind === "baseline"
      ? t("operator.content.kindBaseline")
      : kind === "purge"
        ? t("operator.content.kindPurge")
        : t("operator.content.kindPublish");

  const defaultOf = (key: string, locale: string) => {
    const l = (LOCALES as readonly string[]).includes(locale) ? (locale as Locale) : "id";
    return defaultsOf(dictionaries, key)[l];
  };

  return (
    <>
      {reverted === "error" && <ConsoleNotice>{t("operator.content.errSave")}</ConsoleNotice>}
      <ConsoleSection
        title={t("operator.content.historyHeading")}
        description={t("operator.content.historyDescription", { count: HISTORY_LIMIT })}
      >
      {publications.map((pub) => {
        const rows: RevisionRow[] = pub.revisions.map((r) => ({
          id: r.id,
          text: r.key.slice(SITE_CONTENT_PREFIX.length),
          locale: (LOCALE_LABELS as Record<string, string>)[r.locale] ?? r.locale,
          before: shownValue(r.previousValue, defaultOf(r.key, r.locale), t),
          after: shownValue(r.value, defaultOf(r.key, r.locale), t),
        }));
        const editable = new Set(
          pub.revisions.filter((r) => isEditableInAll(dictionaries, r.key)).map((r) => r.id)
        );
        const columns: SaiColumns<RevisionRow> = [
          {
            key: "text",
            title: t("operator.content.colText"),
            align: "left",
            render: (_v, row) => <span style={{ fontFamily: "var(--ant-font-family-code)" }}>{row.text}</span>,
          },
          { key: "locale", title: t("operator.content.colLocale"), align: "left", render: (_v, row) => row.locale },
          {
            key: "before",
            title: t("operator.content.colBefore"),
            align: "left",
            render: (_v, row) => (
              <span style={{ ...CELL_TEXT, color: "var(--ant-color-text-secondary)" }}>{row.before}</span>
            ),
          },
          {
            key: "after",
            title: t("operator.content.colAfter"),
            align: "left",
            render: (_v, row) => <span style={CELL_TEXT}>{row.after}</span>,
          },
          ...(canEdit
            ? ([
                {
                  key: "restore",
                  title: "",
                  align: "right",
                  render: (_v, row) =>
                    editable.has(row.id) ? (
                      <form action={operatorRevertContent}>
                        <input type="hidden" name="mode" value="restore" />
                        <input type="hidden" name="id" value={row.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          {t("operator.content.restoreRevision")}
                        </Button>
                      </form>
                    ) : null,
                },
              ] satisfies SaiColumns<RevisionRow>)
            : []),
        ];
        return (
          <ConsolePanel
            key={pub.id}
            flush
            title={t("operator.content.pubTitle", { id: pub.id, when: formatDateTime(pub.createdAt) })}
            description={[
              t("operator.content.pubMeta", {
                kind: kindLabel(pub.kind),
                who: pub.publishedBy,
                count: pub.changeCount,
              }),
              pub.note,
            ]
              .filter(Boolean)
              .join(" · ")}
            actions={
              canEdit && editable.size > 0 ? (
                <form action={operatorRevertContent}>
                  <input type="hidden" name="mode" value="undo" />
                  <input type="hidden" name="id" value={pub.id} />
                  <Button type="submit" variant="outline" size="sm">
                    {t("operator.content.undoPublication")}
                  </Button>
                </form>
              ) : undefined
            }
          >
            <StaticTable columns={columns} rows={rows} rowKey={(row) => row.id} size="small" />
          </ConsolePanel>
        );
      })}
      </ConsoleSection>
    </>
  );
}
