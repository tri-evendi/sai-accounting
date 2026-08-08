"use client";

/**
 * Recording an advance (issue #26).
 *
 * The direction is picked first and everything downstream follows from it —
 * which party list to show, and the plain-language explanation of where the
 * money will land. Accounting terms ("kewajiban", "Uang Muka Penjualan") appear
 * as supporting text next to a task-language label, per the MASTER.md rule about
 * not putting raw jargon on the surface.
 *
 * Issue #41 embeds this same form in the supplier screen, where the direction
 * and the party are already known. `locked` is what makes that possible: the two
 * questions the context has already answered are stated as fact instead of asked
 * again, and everything else — the currency/rate discipline, the ledger preview,
 * the error handling, the endpoint — is the one implementation. A second inline
 * "quick advance" form would be a second place for the FX rules to drift.
 */
import { Alert, Flex, Spin, theme, Typography } from "antd";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { NativeSelect } from "@/components/ui/select";
import { ServerSearchableSelect } from "@/components/ui/server-searchable-select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { BASE_CURRENCY, CURRENCY_OPTIONS } from "@/components/shared/currency-rate-fields";
import { useToast } from "@/components/ui/toast";
import { InfoCircleOutlined } from "@ant-design/icons";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";
import { applyServerFieldErrors } from "@/lib/form-server-errors";
import { advancePaymentSchema, type AdvancePaymentInput } from "@/lib/validations/advance";

/**
 * Kisi DUA kolom yang runtuh jadi satu di layar sempit — pengganti
 * `sm:grid-cols-2`. Tetap CSS grid: mata uang & kurs dijatuhkan sebagai DUA
 * isian langsung ke dalam kisi ini, jadi kisi itulah yang mengatur keduanya.
 */
const FIELD_MIN = 280;
const twoColumnGrid = (gap: number): React.CSSProperties => ({
  display: "grid",
  gap,
  gridTemplateColumns: `repeat(auto-fit, minmax(max(${FIELD_MIN}px, calc((100% - ${gap}px) / 2)), 1fr))`,
});
const FULL_ROW: React.CSSProperties = { gridColumn: "1 / -1" };

export interface PartyOption {
  id: number;
  name: string;
}

/**
 * Bentuk lama daftar kontrak preload. Pemilih kontraknya kini mencari ke server
 * (audit: daftar `take: 200` memotong kontrak lama), jadi prop `contracts`
 * tidak dipakai lagi — tipenya dipertahankan hanya agar pemanggil tersemat
 * (`suppliers/[id]/advance-panel.tsx`) tetap terkompilasi tanpa disentuh.
 */
export interface ContractOption {
  id: number;
  contractNo: string;
  buyer: string;
}

const PlainShell = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      padding: "var(--ant-padding)",
      borderRadius: "var(--ant-border-radius)",
      border: "1px solid var(--ant-color-border-secondary)",
    }}
  >
    {children}
  </div>
);

const CardShell = ({ children }: { children: React.ReactNode }) => (
  <Card>
    <div style={{ padding: "var(--ant-padding-lg)" }}>{children}</div>
  </Card>
);

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Direction and party already settled by the surrounding screen (issue #41).
 * Both or neither — a locked direction with a free party list would let a
 * supplier page record an advance against a customer.
 */
export interface LockedParty {
  type: "sales" | "purchase";
  party: PartyOption;
}

/**
 * Isian sebagaimana DIKETIK/DIPILIH — string, seperti nilai kontrol HTML. Bukan
 * skema kedua: aturannya seluruhnya milik `advancePaymentSchema`, termasuk dua
 * aturan yang tidak bisa dilihat satu isian saja — "uang muka penjualan wajib
 * punya pelanggan" dan "valas wajib punya kurs".
 */
interface AdvanceFormValues {
  type: "sales" | "purchase";
  date: string;
  customerId: string;
  supplierId: string;
  contractId: string;
  amount: string;
  currency: string;
  /** `undefined` saat kosong: kurs yang tak diisi BUKAN kurs nol (#216). */
  rate?: string;
  note: string;
}

/** Isian yang benar-benar ada di layar — sisanya naik jadi galat formulir. */
const FIELDS = [
  "type",
  "date",
  "customerId",
  "supplierId",
  "contractId",
  "amount",
  "currency",
  "rate",
  "note",
] as const;

export function AdvanceForm({
  customers = [],
  suppliers = [],
  locked,
  onSaved,
  onCancel,
}: {
  customers?: PartyOption[];
  suppliers?: PartyOption[];
  /** Tidak dipakai lagi — lihat catatan pada `ContractOption`. */
  contracts?: ContractOption[];
  locked?: LockedParty;
  /** Called instead of navigating to /advances. Embedded callers close and refresh. */
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useAppRouter();
  const { toast } = useToast();
  const t = useT();
  const { token } = theme.useToken();

  const form = useForm<AdvanceFormValues, unknown, AdvancePaymentInput>({
    // Cast HANYA menyelaraskan tipe statis; validasi runtime tetap milik skema.
    resolver: zodResolver(advancePaymentSchema) as unknown as Resolver<
      AdvanceFormValues,
      unknown,
      AdvancePaymentInput
    >,
    defaultValues: {
      type: locked?.type ?? "sales",
      date: todayISO(),
      // Tersemat (#41): mitranya sudah diketahui layar pemanggil, jadi ia
      // dinyatakan sebagai fakta di muatan, bukan ditanyakan lagi.
      customerId: locked?.type === "sales" ? String(locked.party.id) : "",
      supplierId: locked?.type === "purchase" ? String(locked.party.id) : "",
      contractId: "",
      amount: "",
      currency: BASE_CURRENCY,
      rate: undefined,
      note: "",
    },
  });

  /* `useWatch` (bukan `form.watch()`) supaya React Compiler tetap bisa
     memoisasi komponen ini. */
  const [type, currency, amount, rate] = useWatch({
    control: form.control,
    name: ["type", "currency", "amount", "rate"],
  });

  const isSales = type === "sales";
  const isForeign = currency !== BASE_CURRENCY;
  const parties = isSales ? customers : suppliers;
  /** Isian mitra menulis ke field yang sesuai arahnya — skema menuntut yang itu. */
  const partyField = isSales ? "customerId" : "supplierId";
  const amountNum = Number(amount) || 0;
  const rateNum = Number(rate) || 0;
  // Shown live so the user sees the ledger value before saving, not after.
  const baseValue = !isForeign ? amountNum : rateNum > 0 ? amountNum * rateNum : null;

  async function onSubmit(values: AdvancePaymentInput) {
    try {
      const response = await apiFetch("/api/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          // Arah menentukan mitra mana yang ikut: isian yang tidak ditanyakan
          // tidak boleh menyelinap sebagai id sisa dari arah sebelumnya.
          customerId: values.type === "sales" ? values.customerId : undefined,
          supplierId: values.type === "sales" ? undefined : values.supplierId,
          // IDR tidak membawa kurs — server memperlakukannya 1:1.
          rate: values.currency === BASE_CURRENCY ? undefined : values.rate,
          note: values.note || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        // Galat per field mendarat di isiannya; sisanya (mis. pesan mesin
        // posting) naik menjadi galat formulir yang menjelaskan tak ada yang
        // tersimpan.
        applyServerFieldErrors(form.setError, data, FIELDS, t("advances.saveFailed"));
        return;
      }

      toast(t("advances.saved"), "success");
      if (onSaved) {
        // Embedded: the user is mid-task on another screen, so stay put and let
        // the server component re-read the balances that just changed.
        form.resetField("amount");
        form.resetField("rate");
        form.resetField("note");
        onSaved();
      } else {
        router.push("/advances");
      }
      router.refresh();
    } catch {
      form.setError("root", { message: t("advances.networkFailed") });
    }
  }

  // Embedded, the form already sits inside the host page's Card — nesting a
  // second one just draws a box in a box. Both shells are module-level so their
  // identity is stable across renders: a component defined inside the body is a
  // NEW type every keystroke, which remounts the whole subtree and takes the
  // focus out of the field being typed in.
  const Shell = locked ? PlainShell : CardShell;

  return (
    <Form {...form}>
    {/* `noValidate`: validasinya milik zod sekarang. */}
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <Shell>
        <div style={twoColumnGrid(token.margin)}>
          {locked ? (
            /* Stated, not asked — but stated in full, so the user can see what
               they are about to record without leaving the page. */
            <div
              style={{
                ...FULL_ROW,
                padding: token.paddingXS,
                borderRadius: token.borderRadius,
                border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                background: token.colorFillQuaternary,
              }}
            >
              <strong>{isSales ? t("advances.lockedSales") : t("advances.lockedPurchase")}</strong>{" "}
              · {locked.party.name}
            </div>
          ) : (
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("advances.typeField")}</FormLabel>
                  <FormControl>
                    <NativeSelect
                      options={[
                        { value: "sales", label: t("advances.lockedSales") },
                        { value: "purchase", label: t("advances.lockedPurchase") },
                      ]}
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        /* Arah berganti = mitra & kontrak sebelumnya tidak lagi
                           berlaku. Membiarkannya berarti uang muka pembelian yang
                           masih menunjuk pelanggan — persis yang ditolak
                           `superRefine` skema, tetapi dengan pesan yang menunjuk
                           isian yang sudah tidak ada di layar. */
                        form.setValue("customerId", "");
                        form.setValue("supplierId", "");
                        form.setValue("contractId", "");
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t("common.date")}</FormLabel>
                <FormControl>
                  <TextInput type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {!locked && (
            <FormField
              control={form.control}
              name={partyField}
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>
                    {isSales ? t("common.customer") : t("advances.partySupplier")}
                  </FormLabel>
                  <FormControl>
                    <NativeSelect
                      placeholder={
                        isSales ? t("advances.pickCustomer") : t("advances.pickSupplier")
                      }
                      options={parties.map((p) => ({ value: String(p.id), label: p.name }))}
                      {...field}
                    />
                  </FormControl>
                  {/* "Pelanggan wajib dipilih untuk uang muka penjualan"
                      (`superRefine` skema) mendarat di sini. */}
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Pemilih kontrak memakai `ServerSearchableSelect`, yang membawa
              labelnya sendiri — jadi ia TIDAK dibungkus `FormControl` (aturan 4
              Konvensi Form: isian di dalamnya harus telanjang). Nilainya tetap
              milik react-hook-form lewat `FormField`. */}
          <FormField
            control={form.control}
            name="contractId"
            render={({ field }) => (
              <div>
                {/* Mencari ke server (audit: daftar statis `take: 200` memotong
                    kontrak lama). Kosong = tidak ditautkan ke kontrak. */}
                <ServerSearchableSelect
                  id="contractId"
                  label={t("advances.contractField")}
                  placeholder={t("advances.noContract")}
                  fetchUrl="/api/contracts?picker=1"
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? "")}
                />
                <Typography.Paragraph
                  type="secondary"
                  style={{ margin: 0, marginTop: token.marginXXS, fontSize: token.fontSizeSM }}
                >
                  {t("advances.contractHintBefore")}{" "}
                  {isSales ? t("advances.contractHintSales") : t("advances.contractHintPurchase")}
                  {t("common.fullStop")}
                </Typography.Paragraph>
              </div>
            )}
          />

          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t("common.amount")}</FormLabel>
                <FormControl>
                  <TextInput
                    type="number"
                    step="0.01"
                    min="0"
                    style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div />

          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("common.currency")}</FormLabel>
                <FormControl>
                  <NativeSelect options={CURRENCY_OPTIONS} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Progressive disclosure: kurs hanya muncul untuk mata uang asing,
              dan skema hanya menuntutnya di kondisi itu
              (`requireRateForForeign`). Sel kosong menahan kisinya tetap dua
              kolom saat isian ini tidak ada. */}
          {isForeign ? (
            <FormField
              control={form.control}
              name="rate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("fx.rateToIdr", { currency })}</FormLabel>
                  <FormControl>
                    <TextInput
                      type="number"
                      step="0.000001"
                      min="0"
                      style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                      {...field}
                      value={field.value ?? ""}
                      /* Kosong = kurs TIDAK DIKETAHUI, bukan kurs nol: `""`
                         akan ter-coerce menjadi 0 dan mengeluh "kurs harus > 0"
                         bahkan sebelum disentuh. */
                      onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                    />
                  </FormControl>
                  <FormDescription>{t("advances.rateHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <div />
          )}

          <div style={FULL_ROW}>
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common.notesOptional")}</FormLabel>
                  <FormControl>
                    <TextInput maxLength={500} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Valas tanpa kurs TIDAK punya nilai buku besar: `baseValue` null dan
            barisnya tidak dirender sama sekali — tidak pernah "Rp 0". */}
        {baseValue != null && isForeign && (
          <Typography.Paragraph style={{ marginTop: token.margin, marginBottom: 0 }}>
            <Typography.Text type="secondary">{t("advances.ledgerValue")} </Typography.Text>
            <Money
              value={baseValue}
              currency="IDR"
              style={{ fontWeight: token.fontWeightStrong }}
            />
          </Typography.Paragraph>
        )}

        {/* Catatan akun: ikon + kata; warnanya tidak pernah jadi penanda. */}
        <Flex
          align="flex-start"
          gap={token.marginXS}
          style={{
            marginTop: token.margin,
            padding: token.paddingXS,
            borderRadius: token.borderRadius,
            border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
            background: token.colorFillQuaternary,
          }}
        >
          <InfoCircleOutlined aria-hidden="true" style={{ fontSize: token.fontSize, flexShrink: 0, marginTop: 2 }} />
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {isSales ? (
              <>
                {t("advances.hintSalesBefore")}{" "}
                <strong>{t("advances.hintSalesAccount")}</strong>{" "}
                {t("advances.hintSalesMiddle")} <em>{t("advances.hintSalesTerm")}</em>
                {t("advances.hintSalesAfter")} <strong>{t("advances.hintNot")}</strong>{" "}
                {t("advances.hintSalesTail")}
              </>
            ) : (
              <>
                {t("advances.hintPurchaseBefore")}{" "}
                <strong>{t("advances.hintPurchaseAccount")}</strong>{" "}
                {t("advances.hintSalesMiddle")} <em>{t("advances.hintPurchaseTerm")}</em>
                {t("advances.hintPurchaseAfter")} <strong>{t("advances.hintNot")}</strong>{" "}
                {t("advances.hintPurchaseTail")}
              </>
            )}
          </Typography.Text>
        </Flex>

        {form.formState.errors.root && (
          <div role="alert" style={{ marginTop: token.margin }}>
            <Alert type="error" showIcon message={form.formState.errors.root.message} />
          </div>
        )}
      </Shell>

      <Flex wrap gap={token.marginXS} style={{ marginTop: locked ? token.margin : token.marginLG }}>
        <Button variant="primary" type="submit" size={locked ? "sm" : undefined} disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Spin size="small" />}
          {t("advances.submit")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size={locked ? "sm" : undefined}
          onClick={() => (onCancel ? onCancel() : router.push("/advances"))}
        >
          {t("common.cancel")}
        </Button>
      </Flex>
    </form>
    </Form>
  );
}
