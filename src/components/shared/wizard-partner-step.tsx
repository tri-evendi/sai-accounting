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
import { Card, CardContent } from "@/components/ui/card";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { DisclosureSection } from "@/components/ui/disclosure-section";
import { EmptyState } from "@/components/ui/empty-state";
import type { PartnerDraft } from "@/lib/wizard";
import { cn } from "@/lib/utils";
import { UserPlus, Users } from "lucide-react";

interface Props {
  /** "pelanggan" atau "pemasok" — dipakai di semua label & pesan. */
  noun: string;
  options: SearchableOption[];
  value: PartnerDraft;
  onChange: (patch: Partial<PartnerDraft>) => void;
  /** Pelanggan membawa PIC, NPWP, dan penanda bebas PPN; pemasok tidak. */
  withCustomerFields?: boolean;
  /** Halaman tempat mitra dikelola, untuk empty state. */
  manageHref: string;
}

export function WizardPartnerStep({
  noun,
  options,
  value,
  onChange,
  withCustomerFields = false,
  manageHref,
}: Props) {
  const isNew = value.mode === "new";

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-700">
            {noun.charAt(0).toUpperCase() + noun.slice(1)} ini
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { mode: "existing", label: `Sudah terdaftar`, icon: Users },
                { mode: "new", label: `Baru — isi datanya`, icon: UserPlus },
              ] as const
            ).map(({ mode, label, icon: Icon }) => (
              <label
                key={mode}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm",
                  "transition-colors duration-150 hover:bg-gray-50",
                  value.mode === mode
                    ? "border-blue-700 bg-blue-50 text-gray-900"
                    : "border-gray-200 text-gray-700"
                )}
              >
                <input
                  type="radio"
                  name="partner-mode"
                  className="h-4 w-4 cursor-pointer"
                  checked={value.mode === mode}
                  onChange={() => onChange({ mode })}
                />
                <Icon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {!isNew &&
          (options.length === 0 ? (
            <EmptyState
              icon={<Users className="h-12 w-12" />}
              title={`Belum ada ${noun} terdaftar`}
              description={`Pilih "Baru — isi datanya" di atas untuk mencatat ${noun} pertama Anda sekalian dalam alur ini.`}
              actionLabel={`Kelola ${noun}`}
              actionHref={manageHref}
            />
          ) : (
            <SearchableSelect
              id="partnerId"
              label={`Pilih ${noun}`}
              placeholder={`Pilih ${noun}…`}
              searchPlaceholder={`Cari nama ${noun}…`}
              emptyText={`Tidak ada ${noun} cocok`}
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
                label={`Nama ${noun}`}
                value={value.name}
                onChange={(e) => onChange({ name: e.target.value })}
                maxLength={100}
                required
              />
              <Input
                id="partnerPhone"
                label="Telepon (opsional)"
                value={value.phone}
                onChange={(e) => onChange({ phone: e.target.value })}
                maxLength={30}
              />
            </div>
            <p className="text-xs text-gray-500">
              {noun.charAt(0).toUpperCase() + noun.slice(1)} baru ini <strong>belum</strong>{" "}
              tersimpan. Datanya ikut tercatat sekali saja bersama seluruh isian wizard, di
              langkah terakhir.
            </p>

            <DisclosureSection
              description={`Alamat, email${withCustomerFields ? ", NPWP, dan status PPN" : ""} — boleh diisi belakangan lewat menu ${noun}.`}
              summary={[value.address || "tanpa alamat", value.email || "tanpa email"].join(" · ")}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="partnerAddress"
                  label="Alamat"
                  value={value.address}
                  onChange={(e) => onChange({ address: e.target.value })}
                  maxLength={500}
                />
                <Input
                  id="partnerEmail"
                  type="email"
                  label="Email"
                  value={value.email}
                  onChange={(e) => onChange({ email: e.target.value })}
                  maxLength={100}
                />
                {withCustomerFields && (
                  <>
                    <Input
                      id="partnerPic"
                      label="Narahubung (PIC)"
                      value={value.pic}
                      onChange={(e) => onChange({ pic: e.target.value })}
                      maxLength={100}
                    />
                    <Input
                      id="partnerNpwp"
                      label="NPWP pembeli"
                      value={value.npwp}
                      onChange={(e) => onChange({ npwp: e.target.value })}
                      maxLength={30}
                    />
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700 sm:col-span-2">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 cursor-pointer rounded border-gray-300"
                        checked={value.taxExempt}
                        onChange={(e) => onChange({ taxExempt: e.target.checked })}
                      />
                      <span>
                        Bebas PPN
                        <span className="block text-xs text-gray-500">
                          Centang untuk pembeli ekspor atau non-PKP; tagihannya otomatis
                          tidak dikenai PPN.
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
