"use client";

/**
 * Langkah 1 kedua wizard (issue #5): pilih mitra yang sudah terdaftar, atau isi
 * mitra baru.
 *
 * Satu komponen untuk pelanggan DAN pemasok karena keputusannya identik —
 * "sudah ada / baru" — dan menduplikasinya berarti dua tempat yang bisa berbeda
 * aturan. Mitra baru TIDAK dibuat di sini: isiannya hanya masuk ke draf, dan
 * baris `customers`/`suppliers`-nya baru lahir di dalam transaksi terakhir.
 * Itulah sebabnya membatalkan di langkah 2 tidak meninggalkan mitra yatim.
 */

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import {
  ServerSearchableSelect,
  type PickerOption,
} from "@/components/ui/server-searchable-select";
import { DisclosureSection } from "@/components/ui/disclosure-section";
import { EmptyState } from "@/components/ui/empty-state";
import type { PartnerDraft } from "@/lib/wizard";
import { cn } from "@/lib/utils";
import { UserPlus, Users } from "lucide-react";
import { useT } from "@/lib/i18n/client";

interface Props {
  /**
   * Mitra mana yang sedang diisi. Dulu berupa kata benda Indonesia mentah
   * ("pelanggan"/"pemasok") yang dirangkai ke belasan label ("Pilih pelanggan",
   * "Belum ada pelanggan terdaftar"). Rangkaian seperti itu tidak bisa
   * diterjemahkan — bahasa lain menaruh kata bendanya di tempat lain — jadi
   * yang dikirim kini KUNCI-nya, dan katanya diambil dari kamus di sini.
   */
  kind: "customer" | "supplier";
  /** Mode statis: seluruh opsi dikirim halaman server. Abaikan bila `fetchUrl`
   *  dipakai. */
  options?: SearchableOption[];
  /**
   * Mode cari-ke-server (audit: pemilih mitra terpotong `take: 500`): endpoint
   * `{ options }` untuk `ServerSearchableSelect`, mis.
   * `/api/customers?active=1&picker=1`. Mitra lama ditemukan lewat pencarian,
   * bukan hilang di balik potongan daftar.
   */
  fetchUrl?: string;
  /** Label mitra yang sudah terpilih (mis. dari draf yang dipulihkan) — hanya
   *  berarti pada mode `fetchUrl`. */
  initialOption?: PickerOption | null;
  value: PartnerDraft;
  onChange: (patch: Partial<PartnerDraft>) => void;
  /** Pelanggan membawa PIC, NPWP, dan penanda bebas PPN; pemasok tidak. */
  withCustomerFields?: boolean;
  /** Halaman tempat mitra dikelola, untuk empty state. */
  manageHref: string;
}

export function WizardPartnerStep({
  kind,
  options = [],
  fetchUrl,
  initialOption,
  value,
  onChange,
  withCustomerFields = false,
  manageHref,
}: Props) {
  const t = useT();
  const isNew = value.mode === "new";
  const noun =
    kind === "customer" ? t("wizard.partner.nounCustomer") : t("wizard.partner.nounSupplier");
  const per = <T,>(customer: T, supplier: T): T => (kind === "customer" ? customer : supplier);

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-foreground">
            {t(per("wizard.partner.thisCustomer", "wizard.partner.thisSupplier"))}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { mode: "existing", label: t("wizard.partner.modeExisting"), icon: Users },
                { mode: "new", label: t("wizard.partner.modeNew"), icon: UserPlus },
              ] as const
            ).map(({ mode, label, icon: Icon }) => (
              <label
                key={mode}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm",
                  "transition-colors duration-150 hover:bg-muted",
                  value.mode === mode
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-foreground"
                )}
              >
                <input
                  type="radio"
                  name="partner-mode"
                  className="h-4 w-4 cursor-pointer"
                  checked={value.mode === mode}
                  onChange={() => onChange({ mode })}
                />
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {!isNew &&
          (fetchUrl ? (
            <ServerSearchableSelect
              id="partnerId"
              label={t("wizard.partner.pickLabel", { noun })}
              placeholder={t("wizard.partner.pickPlaceholder", { noun })}
              searchPlaceholder={t("wizard.partner.searchPlaceholder", { noun })}
              emptyText={t("wizard.partner.emptyText", { noun })}
              fetchUrl={fetchUrl}
              initialOption={initialOption}
              value={value.id != null ? String(value.id) : null}
              onChange={(v) => onChange({ id: v == null ? null : Number(v) })}
            />
          ) : options.length === 0 ? (
            <EmptyState
              icon={<Users className="h-12 w-12" />}
              title={t("wizard.partner.emptyTitle", { noun })}
              description={t("wizard.partner.emptyDescription", { noun })}
              actionLabel={t("wizard.partner.manageAction", { noun })}
              actionHref={manageHref}
            />
          ) : (
            <SearchableSelect
              id="partnerId"
              label={t("wizard.partner.pickLabel", { noun })}
              placeholder={t("wizard.partner.pickPlaceholder", { noun })}
              searchPlaceholder={t("wizard.partner.searchPlaceholder", { noun })}
              emptyText={t("wizard.partner.emptyText", { noun })}
              options={options}
              value={value.id != null ? String(value.id) : null}
              onChange={(v) => onChange({ id: v == null ? null : Number(v) })}
            />
          ))}

        {isNew && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="partnerName"
                label={t(per("wizard.partner.nameCustomer", "wizard.partner.nameSupplier"))}
                value={value.name}
                onChange={(e) => onChange({ name: e.target.value })}
                maxLength={100}
                required
              />
              <Input
                id="partnerPhone"
                label={t("wizard.partner.phoneField")}
                value={value.phone}
                onChange={(e) => onChange({ phone: e.target.value })}
                maxLength={30}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t(per("wizard.partner.notSavedCustomer", "wizard.partner.notSavedSupplier"))}{" "}
              <strong>{t("wizard.partner.notSavedStrong")}</strong>{" "}
              {t("wizard.partner.notSavedAfter")}
            </p>

            <DisclosureSection
              description={
                withCustomerFields
                  ? t("wizard.partner.disclosureCustomer", { noun })
                  : t("wizard.partner.disclosureSupplier", { noun })
              }
              summary={[
                value.address || t("wizard.partner.summaryNoAddress"),
                value.email || t("wizard.partner.summaryNoEmail"),
              ].join(" · ")}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="partnerAddress"
                  label={t("common.address")}
                  value={value.address}
                  onChange={(e) => onChange({ address: e.target.value })}
                  maxLength={500}
                />
                <Input
                  id="partnerEmail"
                  type="email"
                  label={t("wizard.partner.emailField")}
                  value={value.email}
                  onChange={(e) => onChange({ email: e.target.value })}
                  maxLength={100}
                />
                {withCustomerFields && (
                  <>
                    <Input
                      id="partnerPic"
                      label={t("wizard.partner.picField")}
                      value={value.pic}
                      onChange={(e) => onChange({ pic: e.target.value })}
                      maxLength={100}
                    />
                    <Input
                      id="partnerNpwp"
                      label={t("wizard.partner.npwpField")}
                      value={value.npwp}
                      onChange={(e) => onChange({ npwp: e.target.value })}
                      maxLength={30}
                    />
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground sm:col-span-2">
                      <Checkbox
                        className="mt-1"
                        checked={value.taxExempt}
                        onCheckedChange={(v) => onChange({ taxExempt: v === true })}
                      />
                      <span>
                        {t("wizard.partner.taxExemptLabel")}
                        <span className="block text-xs text-muted-foreground">
                          {t("wizard.partner.taxExemptHint")}
                        </span>
                      </span>
                    </label>
                  </>
                )}
              </div>
            </DisclosureSection>
          </>
        )}
      </CardContent>
    </Card>
  );
}
