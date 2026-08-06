"use client";

/**
 * Setup wizard (issue #20) — company identity → base currency + fiscal year →
 * confirm the seeded COA → opening balances → review & post.
 *
 * The Modal/Ekuitas line is the BALANCING FIGURE: the user enters assets (kas,
 * piutang, persediaan) and liabilities (utang), and equity is derived so the
 * opening journal always balances (Σ debit = Σ credit in IDR base). The running
 * "Aset = Kewajiban + Modal" panel shows that figure live before saving, and the
 * server re-derives and re-checks it (`assertBalanced`) — the client preview is
 * never the authority. A foreign balance with no rate is refused, here and again
 * on the server, rather than valued 1:1.
 *
 * ── Tata letak baris saldo awal setelah AntD (issue #200) ─────────────────
 * Baris kas/piutang/utang dulu `grid sm:grid-cols-12` dengan lebar kolom yang
 * ditulis sebagai kelas per isian. Sekarang `Row`/`Col` AntD dengan `xs`/`sm` —
 * kisi 24 kolom, jadi setiap angka lama dikalikan dua. Yang didapat bukan cuma
 * hilangnya kelas: titik patahnya kini milik satu sistem yang sama dengan
 * seluruh aplikasi, dan kolom kurs yang muncul-hilang tidak lagi memaksa
 * menghitung ulang sisa kolomnya dengan tangan.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Col, Flex, Row, Typography, theme } from "antd";
import type { GlobalToken } from "antd";
import { useAppRouter } from "@/components/ui/app-link";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import {
  Loader2,
  Info,
  Plus,
  Trash2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Save,
} from "lucide-react";
import { useT, type TranslateFn } from "@/lib/i18n/client";
import { moneyPalette } from "@/lib/theme/antd-tokens";
import { ModulePicker } from "@/components/settings/module-picker";
import {
  BUSINESS_MODULES,
  isBusinessCategory,
  modulesForCategory,
  normalizeEnabledModules,
  type BusinessCategory,
  type BusinessModule,
} from "@/lib/business-modules";

const { Title, Text } = Typography;

interface CashAccount {
  id: number;
  code: string;
  name: string;
  currency: string;
}
interface Party {
  id: number;
  name: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const baseOf = (amount: number, rate: number) => round2(round2(amount) * rate);

let uid = 0;
const nextId = () => ++uid;

/** Kunci draf sessionStorage — lihat blok "Draf tahan-muat-ulang" di bawah. */
const SETUP_DRAFT_KEY = "setup-wizard-draft";

/** Isian nominal: rata kanan + digit sejajar (MASTER.md §Angka rapi & jujur). */
const AMOUNT_INPUT: React.CSSProperties = {
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const TABULAR: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

/** Lihat `Spinner` di bawah — pengganti `animate-spin` + `motion-reduce:`. */
const SPIN_RULE = `
[data-spin]{animation:sai-spin 1s linear infinite}
@keyframes sai-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){[data-spin]{animation:none}}
`;

interface CashRow {
  key: number;
  accountId: string;
  amount: string;
  rate: string;
}
interface PartnerRow {
  key: number;
  partnerId: string;
  currency: string;
  amount: string;
  rate: string;
}

/** Judul langkah — `<h2>` yang ukurannya token, bukan `text-lg`. */
function StepTitle({ children, token }: { children: React.ReactNode; token: GlobalToken }) {
  return (
    <Title level={2} style={{ fontSize: token.fontSizeLG, marginBlock: 0 }}>
      {children}
    </Title>
  );
}

export function SetupWizard({
  defaults,
  currencies,
  coaCount,
  cashAccounts,
  customers,
  suppliers,
}: {
  defaults: { name: string; address: string; baseCurrency: string };
  currencies: string[];
  coaCount: number;
  cashAccounts: CashAccount[];
  customers: Party[];
  suppliers: Party[];
}) {
  const t = useT();
  const { token } = theme.useToken();
  const money = moneyPalette(token);
  const router = useAppRouter();
  const { toast } = useToast();

  /**
   * Langkah dirujuk lewat NAMA, bukan angka (issue #99 menyisipkan satu langkah
   * baru di tengah). Angka yang tersebar di JSX membuat penyisipan berikutnya
   * jadi latihan menggeser indeks — dan satu indeks yang lupa digeser adalah
   * langkah yang hilang tanpa galat.
   *
   * Kunci kamusnya ikut bernama, bukan bernomor (issue #103). `setup.step1`–
   * `step5` sudah bohong sejak langkah modul disisipkan di posisi kedua:
   * "step2" adalah langkah KETIGA di layar. Nomor pada nama kunci hanya benar
   * selama tak ada yang menyisipkan langkah — dan itu sudah terjadi sekali.
   * Jumlah langkah kini dihitung dari `steps.length`, bukan diketik ulang.
   */
  const STEP_KEYS = ["identity", "modules", "settings", "coa", "balances", "review"] as const;
  const steps = [
    t("setup.stepIdentity"),
    t("modules.stepTitle"),
    t("setup.stepCurrency"),
    t("setup.stepCoa"),
    t("setup.stepBalances"),
    t("setup.stepReview"),
  ];

  const [step, setStep] = useState(0);
  const current = STEP_KEYS[step];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1–2: identity + settings
  const [name, setName] = useState(defaults.name);
  const [address, setAddress] = useState(defaults.address);
  // Seller NPWP for e-Faktur (issue #17) — optional at setup, editable later.
  const [npwp, setNpwp] = useState("");
  const [baseCurrency, setBaseCurrency] = useState(defaults.baseCurrency);
  const [fiscalYearStart, setFiscalYearStart] = useState(`${new Date().getFullYear()}-01-01`);

  // Langkah modul (issue #99). Nilai awalnya SEMUA modul menyala: wizard yang
  // diklik lewat begitu saja meninggalkan aplikasi persis seperti sebelum fitur
  // ini ada — kolomnya tersimpan NULL (lihat `serializeEnabledModules`).
  const [category, setCategory] = useState<BusinessCategory | "">("");
  const [modules, setModules] = useState<ReadonlySet<BusinessModule>>(new Set(BUSINESS_MODULES));

  // Step 4: opening balances
  const [cash, setCash] = useState<CashRow[]>([]);
  const [receivables, setReceivables] = useState<PartnerRow[]>([]);
  const [payables, setPayables] = useState<PartnerRow[]>([]);
  const [inventory, setInventory] = useState("");

  // ── Draf tahan-muat-ulang (audit 2026-07) ──────────────────────────────────
  // Empat puluh baris saldo awal yang lenyap karena tab ter-refresh adalah
  // cara tercepat kehilangan kepercayaan operator. Draf hidup di
  // sessionStorage (BUKAN localStorage: draf setup adalah satu sesi kerja, dan
  // mesin bersama tidak boleh mewariskan draf orang lain), dipulihkan saat
  // mount, dan dihapus saat POST sukses. Server tetap memvalidasi semuanya —
  // draf hanyalah ketikan, bukan data tepercaya.
  const hydrated = useRef(false);
  const submitted = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SETUP_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        const str = (v: unknown): v is string => typeof v === "string";
        const rows = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
        if (typeof d.step === "number" && d.step >= 0 && d.step < STEP_KEYS.length)
          setStep(d.step);
        if (str(d.name) && d.name) setName(d.name);
        if (str(d.address)) setAddress(d.address);
        if (str(d.npwp)) setNpwp(d.npwp);
        if (str(d.baseCurrency) && d.baseCurrency) setBaseCurrency(d.baseCurrency);
        if (str(d.fiscalYearStart) && d.fiscalYearStart) setFiscalYearStart(d.fiscalYearStart);
        if (str(d.category) && isBusinessCategory(d.category)) setCategory(d.category);
        if (Array.isArray(d.modules)) {
          const known = new Set<string>(BUSINESS_MODULES);
          setModules(new Set(d.modules.filter((m): m is BusinessModule => known.has(String(m)))));
        }
        if (d.cash != null) setCash(rows<CashRow>(d.cash));
        if (d.receivables != null) setReceivables(rows<PartnerRow>(d.receivables));
        if (d.payables != null) setPayables(rows<PartnerRow>(d.payables));
        if (str(d.inventory)) setInventory(d.inventory);
      }
    } catch {
      // Draf rusak → mulai bersih; jangan pernah memblokir wizard-nya sendiri.
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Menyimpan sebelum pulih akan MENIMPA draf dengan nilai awal — tunggu.
    if (!hydrated.current || submitted.current) return;
    try {
      sessionStorage.setItem(
        SETUP_DRAFT_KEY,
        JSON.stringify({
          step,
          name,
          address,
          npwp,
          baseCurrency,
          fiscalYearStart,
          category,
          modules: [...modules],
          cash,
          receivables,
          payables,
          inventory,
        })
      );
    } catch {
      // Storage penuh/di-nonaktifkan — draf memang best-effort.
    }
  }, [step, name, address, npwp, baseCurrency, fiscalYearStart, category, modules, cash, receivables, payables, inventory]);

  const hasMeaningfulDraft =
    cash.length > 0 || receivables.length > 0 || payables.length > 0 || inventory !== "";

  useEffect(() => {
    if (!hasMeaningfulDraft) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (submitted.current) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasMeaningfulDraft]);

  const cashById = useMemo(
    () => new Map(cashAccounts.map((a) => [String(a.id), a])),
    [cashAccounts]
  );

  // ── Live totals (IDR base) ──
  const totals = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    let unrated = 0; // foreign rows missing a rate

    for (const r of cash) {
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      const acc = cashById.get(r.accountId);
      const cur = acc?.currency ?? "IDR";
      if (cur === "IDR") assets = round2(assets + baseOf(amt, 1));
      else {
        const rate = Number(r.rate) || 0;
        if (rate > 0) assets = round2(assets + baseOf(amt, rate));
        else unrated++;
      }
    }
    for (const r of receivables) {
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      if (r.currency === "IDR") assets = round2(assets + baseOf(amt, 1));
      else {
        const rate = Number(r.rate) || 0;
        if (rate > 0) assets = round2(assets + baseOf(amt, rate));
        else unrated++;
      }
    }
    const inv = Number(inventory) || 0;
    if (inv > 0) assets = round2(assets + baseOf(inv, 1));

    for (const r of payables) {
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      if (r.currency === "IDR") liabilities = round2(liabilities + baseOf(amt, 1));
      else {
        const rate = Number(r.rate) || 0;
        if (rate > 0) liabilities = round2(liabilities + baseOf(amt, rate));
        else unrated++;
      }
    }

    const equity = round2(assets - liabilities);
    const hasAny = assets > 0 || liabilities > 0;
    return { assets, liabilities, equity, unrated, hasAny };
  }, [cash, receivables, payables, inventory, cashById]);

  function updateCash(key: number, patch: Partial<CashRow>) {
    setCash((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function updatePartner(
    setter: React.Dispatch<React.SetStateAction<PartnerRow[]>>,
    key: number,
    patch: Partial<PartnerRow>
  ) {
    setter((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleSubmit() {
    setError(null);
    if (!totals.hasAny) {
      setError(t("setup.errNoBalance"));
      return;
    }
    if (totals.unrated > 0) {
      setError(t("setup.errUnrated"));
      return;
    }
    setSaving(true);

    const payload = {
      company: {
        name,
        address: address || undefined,
        baseCurrency,
        fiscalYearStart,
        npwp: npwp || undefined,
        // Modul usaha (issue #99). Kategori hanya dicatat; yang berlaku adalah
        // himpunan modulnya, dan server menormalkan + memvalidasinya lagi
        // (modul inti tak bisa dimatikan, bahkan dari sini).
        businessCategory: category || undefined,
        modules: normalizeEnabledModules(modules),
      },
      cash: cash
        .filter((r) => r.accountId && (Number(r.amount) || 0) > 0)
        .map((r) => {
          const cur = cashById.get(r.accountId)?.currency ?? "IDR";
          return {
            accountId: Number(r.accountId),
            currency: cur,
            amount: Number(r.amount),
            ...(cur !== "IDR" ? { rate: Number(r.rate) } : {}),
          };
        }),
      receivables: receivables
        .filter((r) => r.partnerId && (Number(r.amount) || 0) > 0)
        .map((r) => ({
          partnerId: Number(r.partnerId),
          currency: r.currency,
          amount: Number(r.amount),
          ...(r.currency !== "IDR" ? { rate: Number(r.rate) } : {}),
        })),
      payables: payables
        .filter((r) => r.partnerId && (Number(r.amount) || 0) > 0)
        .map((r) => ({
          partnerId: Number(r.partnerId),
          currency: r.currency,
          amount: Number(r.amount),
          ...(r.currency !== "IDR" ? { rate: Number(r.rate) } : {}),
        })),
      inventory: Number(inventory) || 0,
    };

    try {
      const res = await apiFetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
        const first = fieldErrors
          ? Object.values(fieldErrors).flat().find(Boolean)
          : undefined;
        setError(first ?? data?.error ?? t("setup.errSaveFailed"));
        return;
      }
      toast(t("setup.toastDone"), "success");
      // Setup tersimpan — drafnya selesai bertugas dan tidak boleh muncul
      // lagi di kunjungan berikutnya (halaman ini berubah jadi ringkasan).
      submitted.current = true;
      try {
        sessionStorage.removeItem(SETUP_DRAFT_KEY);
      } catch {
        /* storage tak tersedia — tak apa */
      }
      /*
       * Ke layar "penyiapan selesai", BUKAN ke `/reports`.
       *
       * Tujuan lama menyerahkan pelanggan baru kepada sebuah laporan atas
       * perusahaan yang baru punya satu jurnal — tanpa menyebut apa yang
       * barusan dibuat, dan tanpa satu pun langkah berikutnya. Neracanya tetap
       * satu klik dari layar baru itu, bagi yang memang datang untuk melihatnya.
       */
      router.push("/setup/done");
      router.refresh();
    } catch {
      setError(t("setup.errNetwork"));
    } finally {
      setSaving(false);
    }
  }

  /*
   * ── Validasi per langkah: TOMBOL HIDUP, bukan tombol mati ─────────────────
   *
   * Sampai audit ini tombol "Lanjut" hanya `disabled` selama syarat langkahnya
   * belum terpenuhi. Bentuk itu benar secara mekanis dan diam secara total:
   * pada layar wajib pertama, seorang pengguna awam menghadapi tombol yang
   * tidak bereaksi dan tidak satu pun kalimat yang mengatakan field mana yang
   * kurang. Yang tersisa baginya adalah menebak — atau menyimpulkan
   * aplikasinya rusak.
   *
   * Sekarang tombolnya selalu bisa ditekan, dan penekanan yang belum memenuhi
   * syarat MENJAWAB: pesan mendarat di bawah field yang bersangkutan dan fokus
   * dipindahkan ke sana (Forms · Inline Validation, ui-ux-pro-max).
   */
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

  function validateStep(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (current === "identity" && name.trim().length === 0) {
      errors.name = t("validation.companyNameRequired");
    }
    /*
     * Mata uang dasar TIDAK divalidasi di sini: pemilihnya diisi dari
     * `CURRENCIES` tanpa opsi kosong dan berangkat dari "IDR", jadi keadaan
     * "belum dipilih" tidak bisa dicapai lewat layar ini. Memvalidasinya hanya
     * menambah satu pesan yang tak akan pernah dibaca siapa pun — dan satu
     * kunci kamus yang tak dipakai skema mana pun (dijaga
     * `tests/i18n-validation.test.tsx`).
     */
    if (current === "settings" && !fiscalYearStart) {
      errors.fiscalYearStart = t("validation.fiscalYearStartRequired");
    }
    // Langkah modul, COA, dan saldo awal tak pernah menghalangi: melewatinya
    // masing-masing berarti "semua modul aktif", "COA bawaan diterima", dan
    // "saldo awal diisi di langkah tinjauan" — ketiganya keadaan yang sah.
    return errors;
  }

  function goNext() {
    const errors = validateStep();
    setStepErrors(errors);
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    setStep((s) => Math.min(steps.length - 1, s + 1));
  }

  /** Pesan sebuah field lenyap begitu isinya disentuh — bukan menunggu
   *  penekanan "Lanjut" berikutnya untuk membuktikan sudah diperbaiki. */
  function clearStepError(field: string) {
    setStepErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  const currencyOptions = currencies.map((c) => ({ value: c, label: c }));

  /** Warna pil langkah — selesai / sedang / belum. Ketiganya juga dibedakan
   *  IKON (centang vs nomor), jadi warnanya bukan penanda tunggal. */
  function pillStyle(index: number): React.CSSProperties {
    const base: React.CSSProperties = {
      display: "flex",
      alignItems: "center",
      gap: token.marginXS,
      padding: `${token.paddingXXS}px ${token.paddingSM}px`,
      borderRadius: token.borderRadius,
      fontSize: token.fontSize,
    };
    if (index === step) {
      return { ...base, background: token.colorPrimary, color: token.colorTextLightSolid };
    }
    if (index < step) {
      return { ...base, background: token.colorSuccessBg, color: money.colorMoneyPositive };
    }
    return { ...base, background: token.colorFillQuaternary, color: token.colorTextSecondary };
  }

  return (
    <Flex vertical gap={token.marginLG}>
      <style href="sai-spin" precedence="default">
        {SPIN_RULE}
      </style>
      {/*
       * Stepper + hitungan "Langkah X dari Y" (issue #103 · Progress
       * Indicators). Hitungannya DITURUNKAN dari `steps`, tidak pernah diketik:
       * langkah modul yang disisipkan #99 membuat wizard ini enam langkah
       * sementara kamusnya masih bernomor sampai lima, dan angka yang diketik
       * ulang cepat atau lambat akan berbohong lagi.
       *
       * Kalimatnya berdiri sendiri di atas deretan pil, bukan mengandalkan
       * pil-pilnya saja: pada layar sempit deretan itu membungkus jadi dua-tiga
       * baris, dan "seberapa jauh lagi" — satu-satunya pertanyaan pengguna di
       * layar wajib — jadi harus dihitung sendiri dengan mata.
       */}
      <Flex wrap align="center" justify="space-between" gap={token.marginXS}>
        <Text strong type="secondary" style={TABULAR}>
          {t("setup.stepCounter", { current: step + 1, total: steps.length })}
        </Text>

        {/*
         * Penanda draf — mekanismenya sudah ada sejak audit 2026-07, yang
         * belum ada adalah pemberitahuannya.
         *
         * Ketikan wizard disimpan ke `sessionStorage` pada setiap perubahan
         * dan dipulihkan saat halaman dimuat ulang. Selama itu tak pernah
         * dikatakan, jaringnya tidak menolong siapa pun: orang yang tabnya
         * tertutup di tengah empat puluh baris saldo awal tetap mengira
         * pekerjaannya hilang, dan yang ragu-ragu tetap tidak berani
         * meninggalkan layar ini untuk mencari angkanya. Rasa aman itulah
         * gunanya, dan rasa aman harus terbaca.
         */}
        {(step > 0 || hasMeaningfulDraft) && (
          <Flex align="center" gap={token.marginXXS}>
            <Save size={14} style={{ flexShrink: 0, color: token.colorTextSecondary }} aria-hidden="true" />
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
              {t("setup.draftSaved")}
            </Text>
          </Flex>
        )}
      </Flex>

      <Flex
        component="ol"
        wrap
        gap={token.marginXS}
        aria-label={t("setup.stepsAria")}
        style={{ listStyle: "none", margin: 0, padding: 0 }}
      >
        {steps.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined} style={pillStyle(i)}>
            {i < step ? (
              <CheckCircle2 size={16} aria-hidden="true" />
            ) : (
              <span style={TABULAR}>{i + 1}.</span>
            )}
            {label}
          </li>
        ))}
      </Flex>

      <Card style={{ padding: token.paddingLG }}>
        {/* Step 0 — identity */}
        {current === "identity" && (
          <Flex vertical gap={token.margin}>
            {/*
             * Panel pembuka — hanya di langkah pertama.
             *
             * Wizard ini enam langkah dan berakhir dengan sebuah JURNAL yang
             * menjadi titik nol seluruh laporan perusahaan. Sampai audit ini,
             * langkah pertamanya langsung meminta nama perusahaan tanpa
             * menyebut apa yang sedang dimulai, berapa lama, atau apa yang
             * terjadi bila salah — padahal yang membukanya adalah orang yang
             * belum pernah melihat aplikasi ini.
             *
             * Tiga kalimat, dan yang ketiga adalah yang paling penting: saldo
             * awal bisa diisi belakangan. Tanpa itu, orang yang belum memegang
             * angka neraca akan berhenti di sini dan menunda seluruh
             * pemasangan, atau — lebih buruk — mengarang angkanya.
             */}
            <div
              style={{
                padding: `${token.paddingSM}px ${token.padding}px`,
                borderRadius: token.borderRadiusLG,
                border: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillQuaternary,
              }}
            >
              <Text strong>{t("setup.introTitle")}</Text>
              <Flex
                component="ul"
                vertical
                gap={token.marginXXS}
                style={{
                  listStyle: "none",
                  margin: `${token.marginXS}px 0 0`,
                  padding: 0,
                }}
              >
                {(["introPoint1", "introPoint2", "introPoint3"] as const).map((key) => (
                  <li key={key} style={{ display: "flex", alignItems: "flex-start", gap: token.marginXS }}>
                    <span
                      aria-hidden="true"
                      style={{
                        marginTop: 8,
                        width: 6,
                        height: 6,
                        flexShrink: 0,
                        borderRadius: "50%",
                        background: token.colorTextSecondary,
                      }}
                    />
                    <Text type="secondary">{t(`setup.${key}`)}</Text>
                  </li>
                ))}
              </Flex>
            </div>

            <StepTitle token={token}>{t("setup.identityTitle")}</StepTitle>
            <Input
              id="name"
              label={t("setup.nameField")}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearStepError("name");
              }}
              error={stepErrors.name}
              maxLength={150}
              required
            />
            <Flex vertical gap={token.marginXXS}>
              <Label htmlFor="address">{t("common.address")}</Label>
              <Textarea
                id="address"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                maxLength={1000}
              />
            </Flex>
            <Input
              id="npwp"
              label={t("setup.npwpField")}
              value={npwp}
              onChange={(e) => setNpwp(e.target.value)}
              maxLength={30}
              placeholder={t("setup.npwpPlaceholder")}
            />
          </Flex>
        )}

        {/* Modul usaha (issue #99) — kategori sebagai preset, modul tetap
            bisa diubah satu per satu. Melewatinya = semua modul aktif. */}
        {current === "modules" && (
          <Flex vertical gap={token.margin}>
            <StepTitle token={token}>{t("modules.stepHeading")}</StepTitle>
            <Text type="secondary">{t("modules.stepHint")}</Text>
            {/*
             * "Ini bisa diubah lagi" — kalimat terpenting di seluruh langkah ini
             * (issue #103 · UX Onboarding · User Freedom).
             *
             * Wizard ini WAJIB dan tidak bisa dilewati, jadi langkah modul mudah
             * terbaca sebagai pintu satu arah. Pengguna yang mengira begitu akan
             * menyalakan semuanya untuk berjaga-jaga — dan seluruh guna fitur ini
             * (menyusutkan permukaan aplikasi) hilang tepat pada satu-satunya
             * kesempatan ia dipakai.
             *
             * Sengaja kotak bertanda, bukan tambahan kalimat pada `stepHint` yang
             * abu-abu kecil di atasnya: yang perlu diyakinkan justru orang yang
             * sedang ragu-ragu memandangi daftar centang, dan teks samar tidak
             * meyakinkan siapa pun.
             */}
            <Alert
              type="info"
              icon={<RotateCcw size={16} aria-hidden="true" />}
              showIcon
              message={t("modules.stepReversible")}
            />
            <ModulePicker
              category={category}
              modules={modules}
              onCategoryChange={(next) => {
                setCategory(next);
                setModules(new Set(modulesForCategory(next)));
              }}
              onToggleModule={(module, next) =>
                setModules((prev) => {
                  const draft = new Set(prev);
                  if (next) draft.add(module);
                  else draft.delete(module);
                  return draft;
                })
              }
              disabled={saving}
            />
          </Flex>
        )}

        {/* Step 1 — base currency + fiscal year */}
        {current === "settings" && (
          <Flex vertical gap={token.margin}>
            <StepTitle token={token}>{t("setup.stepCurrency")}</StepTitle>
            <Row gutter={[token.margin, token.margin]}>
              <Col xs={24} sm={12}>
                <Select
                  id="baseCurrency"
                  label={t("setup.baseCurrencyField")}
                  value={baseCurrency}
                  onChange={(e) => {
                    setBaseCurrency(e.target.value);
                    clearStepError("baseCurrency");
                  }}
                  error={stepErrors.baseCurrency}
                  options={currencyOptions}
                />
              </Col>
              <Col xs={24} sm={12}>
                <Input
                  id="fiscalYearStart"
                  type="date"
                  label={t("setup.fiscalYearStartField")}
                  value={fiscalYearStart}
                  onChange={(e) => {
                    setFiscalYearStart(e.target.value);
                    clearStepError("fiscalYearStart");
                  }}
                  error={stepErrors.fiscalYearStart}
                  required
                />
              </Col>
            </Row>
            <Alert
              type="info"
              icon={<Info size={16} aria-hidden="true" />}
              showIcon
              message={
                <>
                  {t("setup.ledgerNoteBefore")} <strong>IDR</strong> {t("setup.ledgerNoteAfter")}
                </>
              }
            />
          </Flex>
        )}

        {/* Step 2 — confirm COA */}
        {current === "coa" && (
          <Flex vertical gap={token.margin}>
            <StepTitle token={token}>{t("setup.coaTitle")}</StepTitle>
            <Alert
              type="success"
              icon={<CheckCircle2 size={16} aria-hidden="true" />}
              showIcon
              message={
                <>
                  {t("setup.coaNoteBefore")}{" "}
                  <strong style={TABULAR}>{coaCount}</strong> {t("setup.coaNoteAfter")}
                </>
              }
            />
            <Text type="secondary">{t("setup.coaHint")}</Text>
          </Flex>
        )}

        {/* Step 3 — opening balances */}
        {current === "balances" && (
          <Flex vertical gap={token.marginXL}>
            <StepTitle token={token}>{t("setup.stepBalances")}</StepTitle>

            {/* Kas / Bank */}
            <Section
              title={t("nav.groups.cash")}
              hint={t("setup.cashSectionHint")}
              token={token}
              onAdd={() =>
                cashAccounts.length > 0 &&
                setCash((r) => [...r, { key: nextId(), accountId: "", amount: "", rate: "" }])
              }
              addLabel={t("setup.cashAddLabel")}
              empty={cashAccounts.length === 0 ? t("setup.cashEmpty") : undefined}
            >
              {cash.map((row) => {
                const acc = cashById.get(row.accountId);
                const foreign = acc && acc.currency !== "IDR";
                return (
                  <Row key={row.key} gutter={[token.marginXS, token.marginXS]} align="bottom">
                    <Col xs={24} sm={10}>
                      <Select
                        id={`cash-acc-${row.key}`}
                        label={t("common.account")}
                        value={row.accountId}
                        onChange={(e) => updateCash(row.key, { accountId: e.target.value })}
                        placeholder={t("setup.accountPick")}
                        options={cashAccounts.map((a) => ({
                          value: String(a.id),
                          label: `${a.code} · ${a.name} (${a.currency})`,
                        }))}
                      />
                    </Col>
                    <Col xs={24} sm={foreign ? 6 : 12}>
                      <Input
                        id={`cash-amt-${row.key}`}
                        type="number"
                        step="0.01"
                        min="0"
                        style={AMOUNT_INPUT}
                        label={
                          acc
                            ? t("setup.balanceWithCurrency", { currency: acc.currency })
                            : t("common.balance")
                        }
                        value={row.amount}
                        onChange={(e) => updateCash(row.key, { amount: e.target.value })}
                      />
                    </Col>
                    {foreign && (
                      <Col xs={24} sm={6}>
                        <Input
                          id={`cash-rate-${row.key}`}
                          type="number"
                          step="0.000001"
                          min="0"
                          style={AMOUNT_INPUT}
                          label={t("setup.rateToIdr")}
                          value={row.rate}
                          onChange={(e) => updateCash(row.key, { rate: e.target.value })}
                        />
                      </Col>
                    )}
                    <Col xs={24} sm={2}>
                      <Flex justify="flex-end">
                        <RemoveButton
                          onClick={() => setCash((r) => r.filter((x) => x.key !== row.key))}
                          label={t("journal.removeRow")}
                        />
                      </Flex>
                    </Col>
                  </Row>
                );
              })}
            </Section>

            {/* Piutang */}
            <PartnerSection
              title={t("setup.receivablesTitle")}
              hint={t("setup.receivablesHint")}
              rows={receivables}
              setRows={setReceivables}
              parties={customers}
              partyLabel={t("common.customer")}
              addLabel={t("setup.addCustomer")}
              pickLabel={t("setup.pickCustomer")}
              emptyLabel={t("setup.emptyCustomers")}
              currencies={currencyOptions}
              t={t}
              token={token}
              onUpdate={(k, p) => updatePartner(setReceivables, k, p)}
            />

            {/* Persediaan */}
            <div>
              <Title level={3} style={{ fontSize: token.fontSize, marginBlock: 0 }}>
                {t("accountType.inventory")}
              </Title>
              <Text
                type="secondary"
                style={{ display: "block", marginBottom: token.marginXS, fontSize: token.fontSizeSM }}
              >
                {t("setup.inventoryHint")}
              </Text>
              <Row>
                <Col xs={24} sm={12}>
                  <Input
                    id="inventory"
                    type="number"
                    step="0.01"
                    min="0"
                    style={AMOUNT_INPUT}
                    label={t("setup.inventoryField")}
                    value={inventory}
                    onChange={(e) => setInventory(e.target.value)}
                  />
                </Col>
              </Row>
            </div>

            {/* Utang */}
            <PartnerSection
              title={t("setup.payablesTitle")}
              hint={t("setup.payablesHint")}
              rows={payables}
              setRows={setPayables}
              parties={suppliers}
              partyLabel={t("payables.colSupplier")}
              addLabel={t("setup.addSupplier")}
              pickLabel={t("setup.pickSupplier")}
              emptyLabel={t("setup.emptySuppliers")}
              currencies={currencyOptions}
              t={t}
              token={token}
              onUpdate={(k, p) => updatePartner(setPayables, k, p)}
            />

            <BalancePanel totals={totals} t={t} token={token} />
          </Flex>
        )}

        {/* Step 4 — review */}
        {current === "review" && (
          <Flex vertical gap={token.margin}>
            <StepTitle token={token}>{t("setup.reviewTitle")}</StepTitle>
            {/* `<dl>` tetap `<dl>`: `Row`/`Col` AntD hanya menggambar `<div>`,
                dan menyisipkannya di antara daftar dan butirnya akan memutus
                hubungan istilah–definisi yang dibaca pembaca layar. Kisinya
                karena itu membagi lebarnya sendiri, tanpa media query. */}
            <dl
              style={{
                display: "grid",
                gap: token.marginSM,
                margin: 0,
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
              }}
            >
              <div>
                <dt>
                  <Text strong type="secondary">
                    {t("setup.companyLabel")}
                  </Text>
                </dt>
                <dd style={{ margin: 0 }}>
                  <Text>{name}</Text>
                </dd>
              </div>
              <div>
                <dt>
                  <Text strong type="secondary">
                    {t("setup.fiscalYearStartField")}
                  </Text>
                </dt>
                <dd style={{ margin: 0 }}>
                  <Text style={TABULAR}>{fiscalYearStart}</Text>
                </dd>
              </div>
              {/* issue #99 — apa yang akan tampil di menu setelah wizard selesai. */}
              <div>
                <dt>
                  <Text strong type="secondary">
                    {t("modules.sectionTitle")}
                  </Text>
                </dt>
                <dd style={{ margin: 0 }}>
                  <Text>
                    {t("modules.activeCount", {
                      count: normalizeEnabledModules(modules).length,
                      total: BUSINESS_MODULES.length,
                    })}
                  </Text>
                </dd>
              </div>
            </dl>
            <BalancePanel totals={totals} t={t} token={token} />
            <Alert
              type="info"
              icon={<Info size={16} aria-hidden="true" />}
              showIcon
              message={
                <>
                  {t("setup.saveNoteBefore")} <strong>{t("setup.saveNoteStrong")}</strong>{" "}
                  {t("setup.saveNoteAfter")}
                </>
              }
            />
          </Flex>
        )}

        {error && (
          /* `role` di pembungkus: `Alert` AntD hanya meneruskan `aria-*`/`data-*`,
             jadi peran yang dioper langsung ke sana hilang tanpa galat. */
          <div role="alert" style={{ marginTop: token.margin }}>
            <Alert type="error" showIcon message={error} />
          </div>
        )}

        {/*
         * Keadaan MENYIMPAN, dikatakan dengan kata — bukan hanya pemutar kecil
         * di dalam tombol (issue #103).
         *
         * Langkah terakhir ini menulis identitas, modul, bagan akun, DAN
         * membukukan jurnal saldo awal. Di sambungan yang lambat itu beberapa
         * detik layar diam, dan yang paling mungkin dilakukan pengguna adalah
         * menekan tombolnya lagi. `role="status"` membuatnya ikut DIBACAKAN —
         * pemutar di dalam tombol `aria-hidden`, jadi tanpa baris ini pengguna
         * pembaca layar tidak mendapat tanda apa pun bahwa sesuatu dimulai.
         *
         * Sengaja TIDAK mengarang tahapan ("menyimpan identitas… menyiapkan
         * akun…"): servernya mengerjakan semuanya dalam satu transaksi dan
         * tidak melaporkan kemajuan, jadi tahapan yang ditampilkan hanyalah
         * tebakan berjadwal. Bandingkan dengan pembuatan perusahaan
         * (`/companies/new`), yang kemajuannya SUNGGUHAN karena servernya
         * memang mengalirkannya.
         */}
        {saving && (
          <Flex
            role="status"
            aria-live="polite"
            align="center"
            gap={token.marginXS}
            style={{
              marginTop: token.margin,
              padding: token.paddingSM,
              borderRadius: token.borderRadius,
              background: token.colorFillQuaternary,
              color: token.colorTextSecondary,
            }}
          >
            <Spinner size={16} />
            {t("setup.savingStatus")}
          </Flex>
        )}
      </Card>

      {/* Nav */}
      <Flex justify="space-between">
        <Button
          type="button"
          variant="ghost"
          disabled={step === 0 || saving}
          onClick={() => {
            // Mundur tidak pernah dihalangi, jadi pesan langkah ini ikut
            // ditinggalkan — membawanya mundur berarti memerahi field yang
            // penggunanya justru sedang menjauh darinya.
            setStepErrors({});
            setStep((s) => Math.max(0, s - 1));
          }}
        >
          <ArrowLeft aria-hidden="true" />
          {t("common.back")}
        </Button>

        {step < steps.length - 1 ? (
          <Button type="button" disabled={saving} onClick={goNext}>
            {t("setup.next")}
            <ArrowRight aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="button"
            disabled={saving || !totals.hasAny || totals.unrated > 0}
            onClick={handleSubmit}
          >
            {saving && <Spinner size={16} />}
            {saving ? t("setup.finishing") : t("setup.finish")}
          </Button>
        )}
      </Flex>
    </Flex>
  );
}

/**
 * Pemutar tunggu. `animate-spin` adalah kelas utilitas, dan aturan
 * `prefers-reduced-motion` yang menyertainya tidak bisa ditulis sebagai gaya
 * sebaris — jadi keduanya hidup sebagai satu aturan CSS (`SPIN_RULE`, dipasang
 * sekali di akar wisaya lewat `<style href precedence>`; React 19 meniadakan
 * gandanya) yang menyasar atribut `data-spin`, bukan sebuah kelas.
 */
function Spinner({ size }: { size: number }) {
  return <Loader2 data-spin size={size} style={{ flexShrink: 0 }} aria-hidden="true" />;
}

function Section({
  title,
  hint,
  children,
  onAdd,
  addLabel,
  empty,
  token,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  onAdd: () => void;
  addLabel: string;
  empty?: string;
  token: GlobalToken;
}) {
  return (
    <div>
      <Title level={3} style={{ fontSize: token.fontSize, marginBlock: 0 }}>
        {title}
      </Title>
      <Text
        type="secondary"
        style={{ display: "block", marginBottom: token.marginXS, fontSize: token.fontSizeSM }}
      >
        {hint}
      </Text>
      <Flex vertical gap={token.marginSM}>
        {children}
      </Flex>
      {empty ? (
        <Text
          type="secondary"
          style={{ display: "block", marginTop: token.marginXS, fontSize: token.fontSizeSM }}
        >
          {empty}
        </Text>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          style={{ marginTop: token.marginSM }}
          onClick={onAdd}
        >
          <Plus aria-hidden="true" />
          {addLabel}
        </Button>
      )}
    </div>
  );
}

function PartnerSection({
  title,
  hint,
  rows,
  setRows,
  parties,
  partyLabel,
  addLabel,
  pickLabel,
  emptyLabel,
  currencies,
  t,
  token,
  onUpdate,
}: {
  title: string;
  hint: string;
  rows: PartnerRow[];
  setRows: React.Dispatch<React.SetStateAction<PartnerRow[]>>;
  parties: Party[];
  partyLabel: string;
  addLabel: string;
  pickLabel: string;
  emptyLabel: string;
  currencies: { value: string; label: string }[];
  t: TranslateFn;
  token: GlobalToken;
  onUpdate: (key: number, patch: Partial<PartnerRow>) => void;
}) {
  return (
    <Section
      title={title}
      hint={hint}
      addLabel={addLabel}
      token={token}
      empty={parties.length === 0 ? emptyLabel : undefined}
      onAdd={() =>
        parties.length > 0 &&
        setRows((r) => [
          ...r,
          { key: nextId(), partnerId: "", currency: "IDR", amount: "", rate: "" },
        ])
      }
    >
      {rows.map((row) => {
        const foreign = row.currency !== "IDR";
        return (
          <Row key={row.key} gutter={[token.marginXS, token.marginXS]} align="bottom">
            <Col xs={24} sm={8}>
              <Select
                id={`p-${row.key}`}
                label={partyLabel}
                value={row.partnerId}
                onChange={(e) => onUpdate(row.key, { partnerId: e.target.value })}
                placeholder={pickLabel}
                options={parties.map((p) => ({ value: String(p.id), label: p.name }))}
              />
            </Col>
            <Col xs={24} sm={4}>
              <Select
                id={`c-${row.key}`}
                label={t("common.currencyField")}
                value={row.currency}
                onChange={(e) => onUpdate(row.key, { currency: e.target.value })}
                options={currencies}
              />
            </Col>
            <Col xs={24} sm={foreign ? 6 : 10}>
              <Input
                id={`a-${row.key}`}
                type="number"
                step="0.01"
                min="0"
                style={AMOUNT_INPUT}
                label={t("common.balance")}
                value={row.amount}
                onChange={(e) => onUpdate(row.key, { amount: e.target.value })}
              />
            </Col>
            {foreign && (
              <Col xs={24} sm={4}>
                <Input
                  id={`r-${row.key}`}
                  type="number"
                  step="0.000001"
                  min="0"
                  style={AMOUNT_INPUT}
                  label={t("setup.rateToIdr")}
                  value={row.rate}
                  onChange={(e) => onUpdate(row.key, { rate: e.target.value })}
                />
              </Col>
            )}
            <Col xs={24} sm={2}>
              <Flex justify="flex-end">
                <RemoveButton
                  onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
                  label={t("journal.removeRow")}
                />
              </Flex>
            </Col>
          </Row>
        );
      })}
    </Section>
  );
}

/**
 * Hapus baris.
 *
 * ⚠ Warnanya tetap netral, dan itu BUKAN pilihan gaya. Bentuk lamanya adalah
 * tombol hantu yang memerah saat disentuh — di AntD itu `type="text"` +
 * `danger`, kombinasi yang primitif `Button` belum punya namanya (`ghost` dan
 * `danger` adalah dua varian yang saling meniadakan di petanya). Menambalnya di
 * sini berarti menulis warna hover dengan tangan di satu berkas, jadi yang
 * dilakukan justru sebaliknya: dibiarkan netral, dan kekurangan primitifnya
 * dilaporkan sebagai calon issue (6 pemanggil memakai pola yang sama).
 * Tindakannya tetap terbaca — `aria-label` dan ikon tong sampah.
 */
function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button type="button" variant="ghost" size="icon" onClick={onClick} aria-label={label}>
      <Trash2 aria-hidden="true" />
    </Button>
  );
}

function BalancePanel({
  totals,
  t,
  token,
}: {
  totals: { assets: number; liabilities: number; equity: number; unrated: number; hasAny: boolean };
  t: TranslateFn;
  token: GlobalToken;
}) {
  const money = moneyPalette(token);
  const equityLabel = totals.equity >= 0 ? t("setup.equityCredit") : t("setup.equityDebit");
  return (
    <div
      style={{
        padding: token.padding,
        borderRadius: token.borderRadiusLG,
        border: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorFillQuaternary,
      }}
    >
      <Row gutter={[token.marginSM, token.marginSM]}>
        <Col xs={24} sm={8}>
          <Figure label={t("setup.totalAssets")} value={totals.assets} token={token} />
        </Col>
        <Col xs={24} sm={8}>
          <Figure label={t("setup.totalLiabilities")} value={totals.liabilities} token={token} />
        </Col>
        <Col xs={24} sm={8}>
          <Figure label={equityLabel} value={Math.abs(totals.equity)} token={token} />
        </Col>
      </Row>
      <div
        style={{
          marginTop: token.marginSM,
          paddingTop: token.paddingSM,
          borderTop: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        {/* Ketiga keadaan membawa IKON + KALIMAT; warnanya penanda kedua. */}
        {totals.unrated > 0 ? (
          <Flex align="center" gap={token.marginXS} style={{ color: money.colorMoneyPending }}>
            <Info size={16} style={{ flexShrink: 0 }} aria-hidden="true" />
            <span>{t("setup.unratedWarning", { count: totals.unrated })}</span>
          </Flex>
        ) : totals.hasAny ? (
          <Flex align="center" gap={token.marginXS} style={{ color: money.colorMoneyPositive }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} aria-hidden="true" />
            <span style={TABULAR}>
              {t("setup.balanced", { amount: formatCurrency(totals.assets, "IDR") })}
            </span>
          </Flex>
        ) : (
          <Text type="secondary">{t("setup.noBalancesYet")}</Text>
        )}
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  token,
}: {
  label: string;
  value: number;
  token: GlobalToken;
}) {
  return (
    <div>
      <Text type="secondary" style={{ display: "block", fontSize: token.fontSizeSM }}>
        {label}
      </Text>
      <Text strong style={{ display: "block", marginTop: 2, fontSize: token.fontSizeLG, ...TABULAR }}>
        {formatCurrency(value, "IDR")}
      </Text>
    </div>
  );
}
