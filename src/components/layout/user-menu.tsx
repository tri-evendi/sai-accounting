"use client";

/**
 * Menu pengguna di top bar.
 *
 * Sebelumnya identitas pengguna (nama + peran) dan tombol "Keluar" berdiri
 * sendiri-sendiri sejajar di top bar — memenuhi bar dan mencampur "informasi"
 * (siapa saya) dengan "aksi" (keluar). Kini keduanya diringkas ke satu menu:
 * satu tombol avatar membuka daftar berisi identitas + aksi akun (ubah kata
 * sandi, ganti bahasa, keluar). Pola dropdown-nya sama dengan Menu Bantuan:
 * `<button>`/`<Link>` sungguhan, ditutup Escape & klik di luar, fokus terlihat.
 *
 * ── Pemilih bahasa (fondasi i18n) ──────────────────────────────────────────
 * Bahasa adalah preferensi AKUN dalam pandangan pengguna, jadi tempatnya di
 * menu akun — bukan ikon lepas yang menambah penghuni top bar. Tiap bahasa
 * ditulis DALAM BAHASANYA SENDIRI (`LOCALE_LABELS`) supaya pengguna yang
 * tersasar ke bahasa asing tetap mengenali barisnya sendiri. Barisnya
 * `role="menuitemradio"` + `aria-checked`: satu pilihan aktif dari tiga,
 * terbaca pembaca layar, dan tetap `<button>` sungguhan (bisa Tab & Enter).
 */
import { Link } from "@/components/ui/app-link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  Languages,
  LogOut,
  KeyRound,
  Monitor,
  Moon,
  Palette,
  ReceiptText,
  Sun,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { useTheme } from "@/lib/theme/client";
import { THEMES, type Theme } from "@/lib/theme/config";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

const THEME_ICONS: Record<Theme, LucideIcon> = { light: Sun, dark: Moon, system: Monitor };
const THEME_LABELS: Record<Theme, DictionaryKey> = {
  light: "theme.light",
  dark: "theme.dark",
  system: "theme.system",
};
import { setLocale } from "@/lib/i18n/actions";
import { useDictionary, useLocale, useT } from "@/lib/i18n/client";
import { roleLabels } from "@/lib/i18n/labels";
import type { SystemRole } from "@/lib/constants";
import { apiFetch } from "@/lib/api-fetch";

/** Inisial dari nama untuk avatar (maks 2 huruf), fallback ikon bila kosong. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export function UserMenu({
  userName,
  role,
  onSignOut,
}: {
  userName: string;
  role: string;
  onSignOut: () => void;
}) {
  /**
   * Perusahaan yang sedang dibuka + apakah ada yang lain (issue #104).
   *
   * Diambil hanya SAAT MENU DIBUKA, sekali per pemuatan halaman: ini informasi
   * yang jarang berubah dan tidak layak dibayar satu permintaan di setiap
   * render. Yang dipakai untuk berpindah tetap layar pemilih — di sanalah
   * pemuatan ulang penuh terjadi, dan itu memang yang dibutuhkan (lihat
   * CompanyChoices).
   */
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<{ id: number; name: string }[] | null>(null);
  const [activeCompany, setActiveCompany] = useState<string | null>(null);
  /* Boleh membuka /platform (akun: perusahaan, langganan, ekspor)? Dijawab
   * server lewat permintaan yang memang sudah dilakukan menu ini. */
  const [canOpenPlatform, setCanOpenPlatform] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const t = useT();
  const dictionary = useDictionary();
  const activeLocale = useLocale();
  const { theme, changeTheme } = useTheme();
  const router = useRouter();
  const [switching, startSwitching] = useTransition();
  // Peran kustom (data, tabel `roles`) tidak punya label di kamus — nilai
  // perannya sendiri jadi cadangan, sama seperti sebelum multibahasa.
  const roleLabel = roleLabels(dictionary)[role as SystemRole] || role;
  const abbr = initials(userName);

  useEffect(() => {
    if (!open || companies !== null) return;
    let cancelled = false;
    void apiFetch("/api/user/companies")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            activeId: number | null;
            companies: { id: number; name: string }[];
            canOpenPlatform?: boolean;
          } | null
        ) => {
          if (cancelled || !data) return;
          setCompanies(data.companies);
          setActiveCompany(data.companies.find((c) => c.id === data.activeId)?.name ?? null);
          setCanOpenPlatform(Boolean(data.canOpenPlatform));
        }
      )
      .catch(() => {
        // Menu tetap berguna tanpa daftar perusahaan; jangan menggagalkannya.
      });
    return () => {
      cancelled = true;
    };
  }, [open, companies]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  /**
   * Simpan pilihan bahasa (cookie, lewat server action) lalu minta server
   * merender ulang: kamus dipilih di root layout, jadi `router.refresh()`
   * adalah yang membuat seluruh chrome berganti bahasa tanpa muat ulang penuh.
   */
  function chooseLocale(next: Locale) {
    if (next === activeLocale) {
      setOpen(false);
      return;
    }
    startSwitching(async () => {
      await setLocale(next);
      router.refresh();
      setOpen(false);
    });
  }

  const itemClass =
    "flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("userMenu.trigger", { name: userName, role: roleLabel })}
        className={cn(
          "flex h-10 cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-2 text-sm font-medium transition-colors duration-150 sm:pr-3",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          open
            ? "border-primary/30 bg-primary/10"
            : "border-border bg-card hover:bg-muted"
        )}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
          aria-hidden="true"
        >
          {abbr || <User className="h-4 w-4" />}
        </span>
        <span className="hidden max-w-[10rem] truncate text-foreground sm:inline">{userName}</span>
        <ChevronDown
          className={cn("hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 sm:block", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t("userMenu.menu")}
          className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          {/* Identitas — informasi, bukan aksi. */}
          <div className="flex items-center gap-3 border-b border-border px-3 py-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
              aria-hidden="true"
            >
              {abbr || <User className="h-4 w-4" />}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold text-foreground">{userName}</span>
              <span className="mt-0.5 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {roleLabel}
              </span>
              {/* Perusahaan yang sedang dibuka — di aplikasi akuntansi, "buku
                  siapa yang sedang saya lihat" adalah hal yang tidak boleh
                  perlu ditebak. */}
              {activeCompany && (
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {activeCompany}
                </span>
              )}
            </span>
          </div>

          {/* Bahasa — preferensi tampilan, disimpan di cookie `locale`. */}
          <div
            role="group"
            aria-label={t("userMenu.languageMenu")}
            className="border-b border-border p-1"
          >
            <p className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Languages className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t("userMenu.language")}
            </p>
            {LOCALES.map((locale) => {
              const active = locale === activeLocale;
              return (
                <button
                  key={locale}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  lang={locale}
                  disabled={switching}
                  onClick={() => chooseLocale(locale)}
                  className={cn(
                    itemClass,
                    "justify-between disabled:cursor-not-allowed disabled:opacity-60",
                    active ? "font-semibold text-primary" : "text-foreground hover:bg-muted"
                  )}
                >
                  <span>{LOCALE_LABELS[locale]}</span>
                  {active && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </button>
              );
            })}
            {switching && (
              <p className="px-3 py-1 text-xs text-muted-foreground" role="status">
                {t("userMenu.languageSwitching")}
              </p>
            )}
          </div>

          {/*
           * Tema — tetangga bahasa, dan itu bukan kebetulan.
           *
           * Keduanya preferensi TAMPILAN milik orangnya (bukan milik
           * perusahaan, bukan data), keduanya disimpan sebagai cookie
           * tampilan-saja, dan keduanya dicari orang di tempat yang sama:
           * menu akun. Menaruh tema di ikon lepas pada top bar akan menambah
           * satu penghuni bar demi sesuatu yang disentuh sekali seumur
           * pemasangan.
           *
           * Bentuknya sama dengan blok bahasa di atas (`menuitemradio` +
           * `aria-checked`), bukan `ThemeToggle` berikonnya: di dalam dropdown,
           * baris berteks bisa dijelajahi dengan panah bersama baris lain —
           * tiga tombol ikon berdampingan justru memutus pola navigasinya.
           */}
          <div
            role="group"
            aria-label={t("theme.label")}
            className="border-b border-border p-1"
          >
            <p className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Palette className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t("theme.label")}
            </p>
            {THEMES.map((option) => {
              const active = option === theme;
              const Icon = THEME_ICONS[option];
              return (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => changeTheme(option)}
                  className={cn(
                    itemClass,
                    "justify-between",
                    active ? "font-semibold text-primary" : "text-foreground hover:bg-muted"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {t(THEME_LABELS[option])}
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          {/* Aksi akun */}
          <div className="p-1">
            {/* Ganti perusahaan — hanya muncul bila memang ADA yang lain.
                Menawarkan pilihan yang tidak ada hanya membuat orang menekan
                sesuatu yang mengembalikannya ke tempat yang sama. */}
            {companies !== null && companies.length > 1 && (
              <Link
                role="menuitem"
                href="/select-company"
                onClick={() => setOpen(false)}
                className={cn(itemClass, "text-foreground hover:bg-muted")}
              >
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>{t("auth.selectCompany.switchLabel")}</span>
              </Link>
            )}
            {/* Akun (halaman /platform, issue #172 — dulu /tenant). Terbuka
                untuk SETIAP anggota tenant: di sanalah ia melihat perusahaan
                yang boleh dibukanya, dan owner melihat langganannya. Yang
                membedakan peran adalah ISI halaman, bukan ada-tidaknya tautan
                ini — tetapi tautannya tetap dikondisikan `canOpenPlatform`
                supaya pengguna tanpa keanggotaan tenant (sisa masa adopsi
                #134) tidak ditawari pintu yang memantulkannya. */}
            {canOpenPlatform && (
              <Link
                role="menuitem"
                href="/platform"
                onClick={() => setOpen(false)}
                className={cn(itemClass, "text-foreground hover:bg-muted")}
              >
                <ReceiptText
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span>{t("userMenu.tenantAccount")}</span>
              </Link>
            )}
            <Link
              role="menuitem"
              href="/change-password"
              onClick={() => setOpen(false)}
              className={cn(itemClass, "text-foreground hover:bg-muted")}
            >
              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{t("userMenu.changePassword")}</span>
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className={cn(itemClass, "text-destructive-strong hover:bg-destructive-soft")}
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t("userMenu.signOut")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
