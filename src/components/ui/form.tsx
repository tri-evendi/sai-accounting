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
 * ── `aria-describedby` hanya menyebut simpul yang DIRENDER (issue #262) ─────
 * Sampai #262 `FormControl` menyebut `formDescriptionId` tanpa syarat, padahal
 * simpulnya hanya ada bila pemanggil menulis `<FormDescription>`: 16 dari 83
 * isian. 67 sisanya menunjuk id yang tidak ada di dokumen. Itu tidak terlihat
 * di mana pun — HTML-nya sah, `tsc` diam, ESLint diam, layarnya sama — tetapi
 * sebagian pembaca layar menjatuhkan SELURUH daftar `aria-describedby` begitu
 * satu idref di dalamnya mati, dan yang ikut jatuh adalah pesan galatnya.
 * Penyakit yang sama ada pada `formMessageId`: dua isian tidak menulis
 * `<FormMessage>` sama sekali, dan `FormMessage` sendiri mengembalikan `null`
 * bila galatnya datang tanpa kalimat (`setError` tanpa `message`).
 *
 * Perbaikannya harus benar di HTML PERTAMA — pendaftaran lewat `useEffect`
 * tidak bisa: efek berjalan setelah hidrasi, jadi cat pertama tetap membawa
 * idref menggantung dan berubah sesudahnya. Karena itu daftar id dirakit SAAT
 * RENDER, di `FormItem`, dari simpul yang benar-benar ada di antara anaknya
 * (`findSlot`), lalu diturunkan lewat konteks. `FormItem` merender lebih dulu
 * daripada anaknya, jadi keputusannya sudah jadi sebelum `FormControl` menulis
 * atributnya — dalam render server maupun di peramban.
 *
 * Konsekuensinya untuk pemanggil: `FormDescription`/`FormMessage` harus berada
 * di antara ANAK `FormItem` yang sama (fragment & array ikut ditelusuri, sebab
 * keduanya pasti ikut dirender). Yang tersembunyi di balik prop `render`
 * sebuah `FormField` tidak bisa dilihat siapa pun saat `FormItem` dirender —
 * satu-satunya bentuk seperti itu (panel kata sandi `mail-settings-form.tsx`)
 * dibalik di #262 menjadi `FormField → FormItem`, bentuk baku MASTER.md.
 * Menebak lebih dalam ditolak dengan sengaja: komponen yang MENERIMA anak
 * belum tentu merendernya, dan tebakan yang meleset ke arah itu mengembalikan
 * persis idref menggantung yang sedang ditutup.
 *
 * ── Kenapa API-nya tidak berubah untuk pemanggil ───────────────────────────
 * Aturan fase B: primitif ditulis ulang di atas AntD dengan API yang sama,
 * supaya pemanggilnya tidak ikut berubah (itu fase C). Karena AntD memegang
 * labelnya sebagai PROP sedangkan pola shadcn menulisnya sebagai ANAK,
 * `FormItem` mengangkat `<FormLabel>` dari daftar anaknya ke prop `label`
 * `Form.Item`. Pengangkatan itu sengaja dibatasi pada anak LANGSUNG dan pada
 * satu jenis elemen saja; `FormDescription` dan `FormMessage` tidak diangkat
 * ke `extra`/`help` justru supaya letaknya sama di semua kasus.
 */

import { Children, Fragment, createContext, isValidElement, useContext, useId } from "react";
import { Form as AntdForm } from "antd";
import { Slot } from "radix-ui";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldError,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { describedByWith } from "@/components/ui/input";
import { Label, RequiredMark } from "@/components/ui/label";
import { useDictionary } from "@/lib/i18n/client";
import { translateMessage } from "@/lib/i18n/validation";

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = createContext<FormFieldContextValue>({} as FormFieldContextValue);

/**
 * `TTransformedValues` diteruskan apa adanya ke `Controller` (issue #216).
 *
 * Generik ketiga itu adalah bentuk nilai SESUDAH skema mengubahnya — yang di
 * app ini berbeda dari bentuk isiannya setiap kali sebuah skema memakai
 * `z.coerce`: isian pilihan menyimpan `"7"`, skema menyerahkan `7`, dan
 * `handleSubmit` menerima yang kedua. Tanpa generik ini `control` dari
 * `useForm<Isian, unknown, Muatan>` ditolak `tsc` di setiap `FormField` —
 * bukan karena ada yang salah, melainkan karena bawaannya menganggap keduanya
 * sama.
 */
const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>({
  ...props
}: ControllerProps<TFieldValues, TName, TTransformedValues>) => {
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
  /**
   * Daftar id `aria-describedby` yang simpulnya BENAR-BENAR dirender di
   * `FormItem` ini (issue #262) — dirakit saat render, bukan didaftarkan
   * belakangan lewat efek. `undefined` berarti tidak ada yang menjelaskan
   * isian ini, dan atributnya karena itu tidak ditulis sama sekali.
   */
  describedBy?: string;
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

  const { id, required, describedBy } = itemContext;

  return {
    id,
    name: fieldContext.name,
    required: Boolean(required),
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    /** Lihat `FormItemContextValue.describedBy` — sudah disaring, siap dipakai. */
    describedBy,
    ...fieldState,
  };
};

/*
 * Tanda "wajib" dipakai dari `label.tsx`, bukan ditulis ulang di sini — lihat
 * alasannya di sana.
 *
 * Yang penting untuk berkas INI: ia sengaja BUKAN `required` milik
 * `Form.Item`. Tanda bintang AntD digambar `::before` di DEPAN teks label,
 * sedangkan `Input`/`Select` komposit di repo ini menaruhnya di BELAKANG. Dua
 * konvensi berdampingan di layar yang sama terbaca sebagai cacat, bukan
 * sebagai gaya — dan mematikan tanda AntD memerlukan `requiredMark` yang hanya
 * bisa datang dari `<Form>` AntD (`ItemHolder` membacanya dari konteks, bukan
 * dari prop).
 */

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
 * Cari simpul bertipe `type` di antara anak yang PASTI ikut dirender (#262).
 *
 * "Pasti ikut dirender" adalah seluruh isi aturannya, dan itu yang menentukan
 * sejauh mana penelusuran boleh masuk:
 *
 *   • anak langsung — ada di daftar, jadi ia dirender;
 *   • fragment & array — keduanya merender SELURUH isinya, tanpa syarat, jadi
 *     menelusurinya tidak bisa salah. `Children.toArray` meratakan array tetapi
 *     TIDAK meratakan `<>…</>`, jadi fragment ditelusuri di sini;
 *   • elemen HOST (`<div>`, `<label>`, tipenya sebuah string) — React merender
 *     anaknya apa adanya, jadi jaminannya sama. Ini yang membuat baris centang
 *     (`<label><FormControl>…`) di `cost-center-form` / `customer-form` tetap
 *     terlihat dari sini;
 *   • `{syarat && <FormDescription/>}` dan ternary sudah selesai dinilai oleh
 *     pemanggil sebelum `FormItem` dipanggil — yang sampai ke sini hanya cabang
 *     yang menang (yang kalah menjadi `false`/`null` dan dibuang `toArray`).
 *
 * Yang sengaja TIDAK ditelusuri: anak sebuah KOMPONEN. Sebuah komponen bebas
 * mengabaikan `children`-nya atau merendernya bersyarat, dan tebakan yang
 * meleset ke arah itu menulis kembali idref menggantung yang ditutup #262.
 * Kekeliruan ke arah sebaliknya (deskripsi yang ada tapi tak terlihat dari
 * sini) hanya kehilangan satu pautan — tidak pernah membuat pautan palsu.
 */
function findSlot(
  children: React.ReactNode,
  type: React.ElementType
): React.ReactElement | undefined {
  for (const node of Children.toArray(children)) {
    if (!isValidElement(node)) continue;
    if (node.type === type) return node;
    if (node.type === Fragment || typeof node.type === "string") {
      const inner = (node.props as { children?: React.ReactNode }).children;
      const found = findSlot(inner, type);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Apakah `FormMessage` akan benar-benar merender simpulnya?
 *
 * Satu-satunya sumber untuk dua pembaca: `FormMessage` sendiri (yang memakainya
 * untuk memutuskan `null`) dan `FormItem` (yang memakainya untuk memutuskan
 * apakah `formMessageId` boleh disebut). Keduanya WAJIB sepakat — kalau tidak,
 * galat tanpa kalimat (`form.setError(name, { type: "manual" })`) menghasilkan
 * `aria-describedby` yang menunjuk simpul yang tak pernah dirender.
 *
 * `translateMessage` tidak ikut dipanggil di sini dengan sengaja: ia
 * mengembalikan masukannya apa adanya untuk string kosong, dan tidak pernah
 * mengosongkan pesan yang tidak kosong — jadi kekosongan bisa diputuskan
 * sebelum kamusnya dibutuhkan.
 */
function hasMessageBody(error: FieldError | undefined, fallback: React.ReactNode): boolean {
  return error ? Boolean(String(error.message ?? "")) : Boolean(fallback);
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
  /**
   * Gaya simpul TERLUAR (`.ant-form-item`) — pengganti `className` yang dicabut
   * di #203. Dipakai oleh field yang harus membentang sendiri; di dalam
   * `Row`/`Col` AntD hal itu biasanya cukup dengan `Col span={24}`.
   */
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

function FormItem({ style, children }: FormItemProps) {
  const id = useId();
  const { error } = useFieldState();
  const { label, required, content } = liftLabel(children);

  /*
   * Daftar `aria-describedby` dirakit DI SINI, bukan di `FormControl` (#262).
   * `FormItem` adalah satu-satunya tempat yang memegang seluruh saudara isian
   * sebelum satu pun dari mereka dirender, jadi ia bisa menjawab "apakah
   * simpulnya ada" tanpa menunggu efek — dan jawabannya sudah benar di HTML
   * pertama, termasuk di render server.
   */
  const messageNode = findSlot(content, FormMessage);
  const describedBy = describedByWith(
    findSlot(content, FormDescription) !== undefined && `${id}-form-item-description`,
    // Pesan hanya dirujuk saat ia memang muncul: ada galatnya, ada simpulnya,
    // dan galatnya membawa kalimat.
    Boolean(error) &&
      messageNode !== undefined &&
      hasMessageBody(error, (messageNode.props as { children?: React.ReactNode }).children) &&
      `${id}-form-item-message`
  );

  return (
    <FormItemContext.Provider value={{ id, required, describedBy }}>
      {/* Tanpa `data-slot`: sisa prop `Form.Item` mendarat di baris DALAM
          (`.ant-form-item-row`), bukan di simpul terluar, jadi penanda di sana
          akan menunjuk elemen yang salah. Penanda simpul ini adalah kelas
          AntD sendiri, `.ant-form-item`. */}
      <AntdForm.Item
        style={style}
        /* Label di atas isian. Tanpa ini `Form.Item` memakai tata letak
           horizontal bawaan konteks kosong, dan labelnya duduk di kiri isian —
           bentuk yang tidak dipakai satu pun formulir di aplikasi ini. */
        layout="vertical"
        label={label}
        /* Penyakit yang sama seperti `aria-describedby`, hanya di atribut lain:
           `<label for>` yang menunjuk isian yang tidak dirender. Satu-satunya
           bentuk semacam itu di app ini adalah panel yang berisi keterangan +
           tombol saja (kata sandi surel yang sudah tersimpan). Labelnya tetap
           dibacakan sebagai teks; yang dibuang hanya pautan ke ruang kosong. */
        htmlFor={findSlot(content, FormControl) !== undefined ? `${id}-form-item` : undefined}
        /* Hanya penanda keadaan: pesannya tetap `FormMessage` (lihat kepala
           berkas). Yang dikerjakannya di sini adalah menyalakan gaya error
           pada isian AntD di dalamnya lewat `StatusProvider`. */
        validateStatus={error ? "error" : undefined}
      >
        {/* Jarak 4px antara isian, deskripsi, dan pesan galat — sebelumnya
            milik `FormItem` sendiri. AntD hanya menyediakan jarak antara LABEL
            dan isian, bukan di dalam slot kendali. */}
        <div
          data-slot="form-item-content"
          style={{ display: "grid", gap: "var(--ant-margin-xxs)" }}
        >
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
function FormLabel({ required, children, style, ...props }: FormLabelProps) {
  const { error, formItemId } = useFormField();
  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      /* Label ikut memerah saat fieldnya ditolak — penanda kedua di samping
         pesan di bawahnya, untuk mata yang menyapu formulir panjang. Warnanya
         `colorMoneyNegative`, bukan `colorError`; alasannya di `label.tsx`. */
      style={error ? { color: "var(--ant-color-money-negative)", ...style } : style}
      htmlFor={formItemId}
      {...props}
    >
      {children}
      {required && <RequiredMark />}
    </Label>
  );
}

function FormControl({ ...props }: React.ComponentProps<typeof Slot.Root>) {
  const { error, required, formItemId, describedBy } = useFormField();
  return (
    <Slot.Root
      data-slot="form-control"
      id={formItemId}
      /* Sudah disaring `FormItem`: hanya id yang simpulnya ada di markup yang
         sama (#262). `undefined` berarti atributnya tidak ditulis — sebuah
         `aria-describedby` yang menunjuk ke ruang kosong lebih buruk daripada
         tidak ada, karena sebagian pembaca layar menjatuhkan seluruh daftarnya
         beserta pesan galat yang ikut di dalamnya. */
      aria-describedby={describedBy}
      aria-invalid={!!error}
      // Sejak #192: isian wajib mengumumkan dirinya wajib, bukan hanya
      // bertanda `*` di label. `Select` AntD kehilangan `required` native di
      // #188 (issue #216) — ini bagian yang bisa dikembalikan tanpa menunggu.
      aria-required={required || undefined}
      {...props}
    />
  );
}

function FormDescription({ style, ...props }: React.ComponentProps<"p">) {
  const { formDescriptionId } = useFormField();
  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      style={{
        fontSize: "var(--ant-font-size)",
        color: "var(--ant-color-text-secondary)",
        ...style,
      }}
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
 * Warnanya `colorMoneyNegative` (#186), BUKAN `colorError` AntD: yang terakhir
 * berkontras 3,27:1 sebagai teks 14px (diukur di `lib/theme/antd-tokens.ts`),
 * di bawah ambang 4,5:1. Alasan yang sama sudah tertulis di `input.tsx`.
 */
function FormMessage({ style, ...props }: React.ComponentProps<"p">) {
  const { error, formMessageId } = useFormField();
  const dictionary = useDictionary();

  // Predikat yang sama dipakai `FormItem` untuk memutuskan apakah id ini boleh
  // disebut `aria-describedby` (#262) — dua tempat, satu aturan.
  if (!hasMessageBody(error, props.children)) return null;

  const body = error ? translateMessage(dictionary, String(error.message ?? "")) : props.children;

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      // Diumumkan ke pembaca layar begitu muncul (temuan audit: error dulu
      // hanya teks, tak pernah diumumkan).
      role="alert"
      style={{
        fontSize: "var(--ant-font-size)",
        color: "var(--ant-color-money-negative)",
        ...style,
      }}
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
