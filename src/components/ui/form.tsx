"use client";

/**
 * Form (issue #53; ditulis ulang di atas `Form.Item` AntD pada issue #192).
 *
 * ── KEPUTUSAN #192: mesinnya tetap react-hook-form + zod ────────────────────
 * AntD punya lapisan formulir lengkap (`Form.useForm`, `name`, `rules`,
 * `validateMessages`) dan memakainya berarti membuang kontrak yang menancap
 * paling dalam di aplikasi ini — "satu skema zod, dua sisi" (MASTER.md
 * §Konvensi Form aturan 1). Skema yang divalidasi form adalah skema yang SAMA
 * yang diurai route handler; menulis ulang aturannya sebagai `rules` AntD
 * berarti dua salinan yang bisa menyimpang diam-diam, di aplikasi yang setiap
 * penyimpangannya berakhir sebagai jurnal salah. Karena itu `Form` AntD tidak
 * dipakai sama sekali di sini, dan tidak boleh dipakai di halaman mana pun.
 *
 * Yang diambil dari AntD hanyalah KULITNYA: `Form.Item` dipakai TANPA `Form`
 * AntD — tanpa `name`, tanpa `rules` — murni sebagai tata letak label + kendali
 * + pesan, dan sebagai pembawa keadaan `error` ke isian di dalamnya.
 *
 * ── Apa yang benar-benar diberikan `Form.Item` tanpa `Form` ─────────────────
 * Dibaca dari `antd/es/form/FormItem/index.js` dan diuji di
 * `tests/ui-form-antd.test.tsx`. Tanpa `name`, `Form.Item` mengambil jalan
 * pintas `renderLayout(children)`: ia TIDAK menyentuh rc-field-form sama
 * sekali, jadi tidak ada state kedua, tidak ada validasi kedua, dan tidak ada
 * konteks `Form` yang dibutuhkan. Yang tetap bekerja:
 *
 *   • `label` + `htmlFor`  → `<label for>` yang benar, di kolom labelnya;
 *   • `layout="vertical"`  → label DI ATAS isian (aturan MASTER.md: label
 *                            terlihat, bukan placeholder), tanpa `<Form>`;
 *   • `validateStatus`     → kelas `ant-form-item-has-error` DAN — ini yang
 *                            berharga — `StatusProvider` AntD, yang membuat
 *                            `Input`/`Select`/`MoneyInput` di dalamnya bergaya
 *                            error tanpa satu prop pun dari pemanggil;
 *   • `extra`              → dirender apa adanya.
 *
 * ── `help` sengaja TIDAK dipakai, dan ini terukur ──────────────────────────
 * `help` adalah slot yang paling alami untuk pesan galat, tetapi tanpa `name`
 * ia TIDAK PERNAH muncul pada render pertama. Sebabnya ada di `ItemHolder`:
 * daftar galat hanya dirender bila `marginBottom !== null || errors.length ||
 * warnings.length`. `errors` selalu kosong (tidak ada Field), dan `marginBottom`
 * baru terisi di sebuah `useLayoutEffect`. Akibatnya:
 *
 *   • di `renderToStaticMarkup` (dan di setiap render server) pesannya HILANG
 *     sama sekali — diverifikasi: markupnya tidak memuat `ant-form-item-explain`;
 *   • di peramban ia baru muncul satu frame setelahnya.
 *
 * Untuk pesan validasi itu tidak bisa diterima: galat yang hanya kadang-kadang
 * ada di DOM adalah galat yang tidak bisa dijamin diumumkan pembaca layar.
 * Karena itu `FormMessage` tetap merender simpulnya sendiri (`role="alert"`,
 * `text-destructive` yang lolos AA — lihat catatan warna di `input.tsx`), di
 * dalam slot kendali `Form.Item`. Ia hidup persis di tempat yang sama seperti
 * sebelum #192; yang berubah hanya wadah di sekelilingnya.
 *
 * ── ARIA: tetap milik `FormControl`, bukan AntD ────────────────────────────
 * `Form.Item` memang bisa menyuntikkan `aria-describedby`/`aria-invalid`, TAPI
 * hanya di cabang ber-`name` — cabang yang justru tidak kita tempuh. Tanpa
 * `name`, `fieldId` undefined dan AntD tidak memasang satu atribut pun. Jadi
 * pautan label–isian–deskripsi–galat tetap dipasang `FormControl` (Radix
 * `Slot`) seperti sebelumnya, otomatis, tanpa pemanggil menulis `aria-*`.
 * Yang BERTAMBAH di #192: `aria-required`, yang selama ini tidak ada — isian
 * wajib hanya bertanda `*` (lihat #216).
 *
 * ── Kenapa API-nya tidak berubah untuk pemanggil ───────────────────────────
 * Aturan fase B: primitif ditulis ulang di atas AntD dengan API yang sama,
 * supaya pemanggilnya tidak ikut berubah (itu fase C). Karena AntD memegang
 * labelnya sebagai PROP sedangkan pola shadcn menulisnya sebagai ANAK,
 * `FormItem` mengangkat `<FormLabel>` dari daftar anaknya ke prop `label`
 * `Form.Item`. Pengangkatan itu sengaja dibatasi pada anak LANGSUNG dan pada
 * satu jenis elemen saja; `FormDescription` dan `FormMessage` tidak diangkat
 * ke `extra`/`help` justru supaya letaknya sama di semua kasus — termasuk saat
 * keduanya berada di dalam `FormField` (mis. `mail-settings-form.tsx`), yang
 * tidak bisa dijangkau pengangkatan apa pun.
 */

import { Children, createContext, isValidElement, useContext, useId } from "react";
import { Form as AntdForm } from "antd";
import { Slot } from "radix-ui";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Label } from "@/components/ui/label";
import { useDictionary } from "@/lib/i18n/client";
import { translateMessage } from "@/lib/i18n/validation";
import { cn } from "@/lib/utils";

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = createContext<FormFieldContextValue>({} as FormFieldContextValue);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

type FormItemContextValue = {
  id: string;
  /** Diangkat dari `<FormLabel required>` — dipakai `FormControl` untuk `aria-required`. */
  required: boolean;
};

const FormItemContext = createContext<FormItemContextValue>({} as FormItemContextValue);

/** Keadaan field yang sedang dirender; `name` kosong saat `FormItem` dipakai
 *  sebagai wadah tata letak di luar `FormField` (pola yang dipakai panel kata
 *  sandi di `mail-settings-form.tsx`). */
function useFieldState() {
  const fieldContext = useContext(FormFieldContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  return getFieldState(fieldContext.name, formState);
}

const useFormField = () => {
  const fieldContext = useContext(FormFieldContext);
  const itemContext = useContext(FormItemContext);
  const fieldState = useFieldState();

  if (!fieldContext) {
    throw new Error("useFormField harus dipakai di dalam <FormField>");
  }

  const { id, required } = itemContext;

  return {
    id,
    name: fieldContext.name,
    required: Boolean(required),
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

/**
 * Tanda "wajib" — SATU implementasi untuk kedua jalur render label.
 *
 * Sengaja BUKAN `required` milik `Form.Item`: tanda bintang AntD digambar
 * `::before` di DEPAN teks label, sedangkan `Input`/`Select` komposit di repo
 * ini menaruhnya di BELAKANG. Dua konvensi berdampingan di layar yang sama
 * terbaca sebagai cacat, bukan sebagai gaya — dan mematikan tanda AntD
 * memerlukan `requiredMark` yang hanya bisa datang dari `<Form>` AntD
 * (`ItemHolder` membacanya dari konteks, bukan dari prop).
 */
function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-destructive">
        *
      </span>
      <span className="sr-only"> (wajib)</span>
    </>
  );
}

type FormLabelProps = React.ComponentProps<typeof Label> & { required?: boolean };

/**
 * Label yang ditulis pemanggil sebagai ANAK, diubah menjadi PROP `label`
 * `Form.Item`.
 *
 * Hanya anak LANGSUNG yang diangkat, dan hanya elemen `FormLabel`. Bentuk lain
 * (label di dalam `FormField`, atau `<label>` buatan sendiri seperti pada baris
 * checkbox) sengaja dibiarkan turun sebagai anak biasa: menebak-nebak lebih
 * dalam akan membuat letak label berpindah-pindah tergantung cara pemanggil
 * menulis JSX-nya.
 */
function liftLabel(children: React.ReactNode) {
  const nodes = Children.toArray(children);
  const labelNode = nodes.find(
    (node): node is React.ReactElement<FormLabelProps> =>
      isValidElement(node) && node.type === FormLabel
  );

  if (!labelNode) {
    return { label: undefined, required: false, content: children };
  }

  const required = Boolean(labelNode.props.required);
  return {
    label: (
      <>
        {labelNode.props.children}
        {required && <RequiredMark />}
      </>
    ),
    required,
    content: nodes.filter((node) => node !== labelNode),
  };
}

/**
 * Props `FormItem` dipersempit dari `React.ComponentProps<"div">` menjadi dua
 * yang benar-benar dipakai. Itu disengaja: sisa atribut `<div>` dulu mendarat
 * di simpul yang kita kendalikan sendiri, sedangkan sekarang ia akan mendarat
 * di baris dalam milik AntD (`ItemHolder` menyebarkan sisa prop ke `Row`) —
 * tempat yang berbeda dari yang diharapkan penulisnya. Lebih baik ditolak
 * `tsc` daripada mendarat diam-diam di simpul yang salah.
 */
interface FormItemProps {
  className?: string;
  children?: React.ReactNode;
}

function FormItem({ className, children }: FormItemProps) {
  const id = useId();
  const { error } = useFieldState();
  const { label, required, content } = liftLabel(children);

  return (
    <FormItemContext.Provider value={{ id, required }}>
      {/* Tanpa `data-slot`: sisa prop `Form.Item` mendarat di baris DALAM
          (`.ant-form-item-row`), bukan di simpul terluar, jadi penanda di sana
          akan menunjuk elemen yang salah. Penanda simpul ini adalah kelas
          AntD sendiri, `.ant-form-item`. */}
      <AntdForm.Item
        className={className}
        /* Label di atas isian. Tanpa ini `Form.Item` memakai tata letak
           horizontal bawaan konteks kosong, dan labelnya duduk di kiri isian —
           bentuk yang tidak dipakai satu pun formulir di aplikasi ini. */
        layout="vertical"
        label={label}
        htmlFor={`${id}-form-item`}
        /* Hanya penanda keadaan: pesannya tetap `FormMessage` (lihat kepala
           berkas). Yang dikerjakannya di sini adalah menyalakan gaya error
           pada isian AntD di dalamnya lewat `StatusProvider`. */
        validateStatus={error ? "error" : undefined}
      >
        {/* Jarak 4px antara isian, deskripsi, dan pesan galat — sebelumnya
            milik `FormItem` sendiri (`grid gap-1`). AntD hanya menyediakan
            jarak antara LABEL dan isian, bukan di dalam slot kendali. */}
        <div data-slot="form-item-content" className="grid gap-1">
          {content}
        </div>
      </AntdForm.Item>
    </FormItemContext.Provider>
  );
}

/**
 * Label saat ia TIDAK diangkat ke `Form.Item` — mis. ditulis di dalam
 * `FormField`. Tetap `<label htmlFor>` yang benar, jadi mengkliknya tetap
 * memfokuskan isian.
 */
function FormLabel({ className, required, children, ...props }: FormLabelProps) {
  const { error, formItemId } = useFormField();
  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      className={cn("data-[error=true]:text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    >
      {children}
      {required && <RequiredMark />}
    </Label>
  );
}

function FormControl({ ...props }: React.ComponentProps<typeof Slot.Root>) {
  const { error, required, formItemId, formDescriptionId, formMessageId } = useFormField();
  return (
    <Slot.Root
      data-slot="form-control"
      id={formItemId}
      aria-describedby={
        !error ? `${formDescriptionId}` : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      // Sejak #192: isian wajib mengumumkan dirinya wajib, bukan hanya
      // bertanda `*` di label. `Select` AntD kehilangan `required` native di
      // #188 (issue #216) — ini bagian yang bisa dikembalikan tanpa menunggu.
      aria-required={required || undefined}
      {...props}
    />
  );
}

function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
  const { formDescriptionId } = useFormField();
  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

/**
 * Pesan galat satu field — dan BATAS TAMPILAN sisi client untuk pesan validasi.
 *
 * Skema zod membawa KUNCI kamus (`vmsg("validation.dateRequired")`), bukan
 * kalimat jadi, karena pesan zod dipanggang saat modul dimuat dan tidak bisa
 * ikut berganti bahasa — lihat `lib/i18n/validation.ts`. Di sinilah kunci itu
 * kembali menjadi kalimat, dalam bahasa yang sedang aktif.
 *
 * `translateMessage` sengaja menerima string apa pun: pesan yang BUKAN kunci
 * (prosa dari server lewat `form.setError`, atau pesan bawaan zod) tetap
 * ditampilkan apa adanya, dan kunci `validation.*` yang kamusnya belum termuat
 * jatuh ke kalimat bahasa Indonesia — tidak pernah ke kunci mentah di layar.
 *
 * Warnanya tetap `text-destructive`, BUKAN `colorError` AntD: yang terakhir
 * berkontras 3,27:1 sebagai teks 14px (diukur di `lib/theme/antd-tokens.ts`),
 * di bawah ambang 4,5:1. Alasan yang sama sudah tertulis di `input.tsx`.
 */
function FormMessage({ className, ...props }: React.ComponentProps<"p">) {
  const { error, formMessageId } = useFormField();
  const dictionary = useDictionary();
  const body = error ? translateMessage(dictionary, String(error?.message ?? "")) : props.children;

  if (!body) return null;

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      // Diumumkan ke pembaca layar begitu muncul (temuan audit: error dulu
      // hanya teks, tak pernah diumumkan).
      role="alert"
      className={cn("text-sm text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  );
}

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
};
