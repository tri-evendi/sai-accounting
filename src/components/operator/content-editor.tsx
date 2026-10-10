"use client";

/**
 * EDITOR ISI HALAMAN PENDARATAN — satu bagian halaman, satu bahasa, satu
 * formulir.
 *
 * ══ YANG DISUNTING ADALAH PENIMPA, DAN LAYARNYA MENGATAKANNYA ══════════════
 * Setiap baris memperlihatkan DUA hal: kalimat bawaan (dari kamus) dan isian
 * penimpanya. Isian yang KOSONG bukan kalimat yang hilang — ia berarti "pakai
 * bawaan", dan bawaannya berdiri di `placeholder` isian itu sendiri sehingga
 * yang terbaca di layar adalah persis yang akan terbaca di halaman.
 *
 * Konsekuensinya sengaja dibuat terbalik dari form biasa di repo ini:
 * mengosongkan sebuah isian lalu menyimpan BUKAN kehilangan data, ia
 * pembatalan suntingan. Karena itu tombolnya "Kembalikan ke bawaan" dan bukan
 * "Hapus", dan karena itu pula tidak ada `ConfirmDialog` di sini — tidak ada
 * tindakan destruktif untuk dikonfirmasi (MASTER.md §Form: konfirmasi wajib
 * untuk yang merah/destruktif; tidak ada yang merah di layar ini).
 *
 * ══ KENAPA SATU BAGIAN SEKALI, BUKAN SELURUH HALAMAN ═══════════════════════
 * Pendaratan punya 175 kalimat per bahasa. Satu formulir berisi 175 isian
 * adalah formulir yang (a) menuntut penggulungan panjang untuk menemukan satu
 * kalimat, dan (b) mengirim 175 nilai ke server setiap kali satu di antaranya
 * berubah. Bagiannya dipilih lewat `?section=` — URL, bukan state: hasilnya
 * bisa ditempel ke tiket ("perbaiki kalimat di sini"), dan tombol Kembali
 * peramban mengembalikan bagian sebelumnya.
 *
 * ══ MESIN FORMULIRNYA RHF + ZOD, DENGAN SATU PENYESUAIAN ═══════════════════
 * Nama field = NAMA TELANJANG kunci (`heroHeading`), bukan jalur-titik
 * (`landing.heroHeading`): react-hook-form membaca titik sebagai jalur
 * BERSARANG, jadi bentuk kedua akan tersimpan sebagai objek tiga tingkat dan
 * tidak pernah cocok dengan skemanya. Awalannya ditambahkan kembali di satu
 * tempat — server action — lewat `SITE_CONTENT_PREFIX`.
 *
 * Skemanya SATU, dipakai dua sisi (`siteContentSchema`, aturan 1 Konvensi
 * Form); `FormMessage` yang menerjemahkan kunci pesannya di batas tampilan.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Flex, theme } from "antd";
import { UndoOutlined } from "@ant-design/icons";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { TextInput } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/client";
import { siteContentSchema, type SiteContentFormInput } from "@/lib/validations/operator";
import type { OperatorContentActionResult } from "@/app/(app)/(operator)/operator/content/actions";

/** Satu baris yang bisa disunting — disusun di server, dioper apa adanya. */
export interface ContentEditorRow {
  /** Nama telanjang kunci (`heroHeading`) — juga nama field RHF. */
  name: string;
  /** Kalimat BAWAAN dari kamus. */
  fallback: string;
  /** Penimpa tersimpan, atau `""` bila belum pernah diganti. */
  value: string;
  /** Nama operator yang terakhir menyimpannya — kosong bila masih bawaan. */
  updatedBy: string;
  /** Sudah terformat di server (`Intl`), bukan `Date` yang menyeberang. */
  updatedAt: string;
}

/**
 * Ambang "ini paragraf, bukan label".
 *
 * Diukur dari kalimat BAWAAN dan bukan dari penimpanya: kalau ambangnya
 * mengikuti nilai yang sedang diketik, bentuk isiannya akan berubah di tengah
 * pengetikan (satu baris menjadi kotak) dan kursor pindah tempat.
 */
const AMBANG_PARAGRAF = 90;

interface ContentEditorProps {
  locale: string;
  section: string;
  rows: ContentEditorRow[];
  /** Server action — dioper, tidak diimpor langsung oleh berkas client ini. */
  save: (input: SiteContentFormInput) => Promise<OperatorContentActionResult>;
}

export function ContentEditor({ locale, section, rows, save }: ContentEditorProps) {
  const t = useT();
  const router = useRouter();
  const { token } = theme.useToken();
  const [result, setResult] = useState<OperatorContentActionResult | null>(null);

  const form = useForm<SiteContentFormInput>({
    resolver: zodResolver(siteContentSchema),
    defaultValues: {
      locale: locale as SiteContentFormInput["locale"],
      section,
      entries: Object.fromEntries(rows.map((row) => [row.name, row.value])),
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setResult(null);
    const answer = await save(values);
    setResult(answer);
    if (answer.ok) {
      /* Nilai tersimpan dibaca ULANG dari server, bukan diasumsikan dari apa
         yang baru dikirim: isian yang dikosongkan harus kembali memperlihatkan
         bawaannya sebagai `placeholder`, dan baris "diubah oleh" harus menyebut
         nama & waktu yang BENAR-BENAR tercatat. */
      router.refresh();
    }
  });

  const kembalikan = (name: string) => {
    /* `shouldDirty` supaya tombol simpan tahu ada yang berubah; nilainya string
       kosong, yang di server berarti "hapus barisnya". */
    form.setValue(`entries.${name}`, "", { shouldDirty: true });
  };

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: token.marginLG }}>
        {/* Bahasa & bagian ikut sebagai nilai formulir, bukan sebagai input
            tersembunyi: keduanya sudah ada di `defaultValues`, dan input
            tersembunyi hanya menambah dua nilai yang bisa berbeda dari
            keduanya. */}
        {rows.map((row) => {
          const paragraf = row.fallback.length > AMBANG_PARAGRAF;
          const diubah = row.updatedBy.length > 0;
          return (
            <FormField
              key={row.name}
              control={form.control}
              name={`entries.${row.name}`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {/* LABELNYA nama kunci, dan itu disengaja: operator yang
                        memperbaiki satu kalimat biasanya datang dari sebuah
                        tangkapan layar atau laporan yang menyebut kalimatnya,
                        dan nama kunci adalah satu-satunya penanda yang sama di
                        konsol, di kamus, dan di jejak audit. Kalimat bawaannya
                        berdiri di bawahnya sebagai konteks. */}
                    <span style={{ fontFamily: "var(--ant-font-family-code)" }}>{row.name}</span>
                  </FormLabel>
                  <FormControl>
                    {paragraf ? (
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder={row.fallback}
                        spellCheck
                      />
                    ) : (
                      <TextInput {...field} placeholder={row.fallback} spellCheck />
                    )}
                  </FormControl>
                  <FormDescription>
                    <Flex wrap align="center" gap={token.marginXS}>
                      <span>
                        {diubah
                          ? t("operator.content.changedBy", {
                              who: row.updatedBy,
                              when: row.updatedAt,
                            })
                          : t("operator.content.usingDefault")}
                      </span>
                      {diubah && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => kembalikan(row.name)}
                        >
                          <UndoOutlined aria-hidden="true" />
                          {t("operator.content.reset")}
                        </Button>
                      )}
                    </Flex>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          );
        })}

        {/* ⚠ TANPA `role` yang dioper: `Alert` AntD selalu merender
            `role="alert"` dan MEMBUANG `role` kiriman, jadi `role="status"` di
            sini akan menjadi kode yang terbaca sopan dan berperilaku asertif —
            dijaga `tests/design-system-primitives.test.ts`. Perilaku asertifnya
            memang yang benar di sini: ini hasil dari tindakan yang baru saja
            ditekan orangnya sendiri, dan kegagalan menyimpan harus terdengar.
            Pola yang sama dengan `mail-settings-form.tsx`. */}
        {result && (
          <Alert type={result.ok ? "success" : "error"} message={result.message} showIcon />
        )}

        <Flex wrap align="center" gap={token.marginSM}>
          <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("common.saving") : t("common.save")}
          </Button>
          {/* Jalan ke halaman yang baru saja disunting — pemuatan PENUH
              (`Button href`, bukan `ButtonLink`) dan di tab baru: halaman
              pendaratan hidup di host PELANGGAN, bukan di host konsol ini,
              jadi tidak ada navigasi sisi-klien yang bisa menjangkaunya. */}
          <Button href="/" target="_blank" rel="noreferrer" variant="outline">
            {t("operator.content.preview")}
          </Button>
        </Flex>
      </form>
    </Form>
  );
}
