import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // Lihat tests/stubs/server-only.ts — tanpa ini, modul sisi server tidak
      // bisa diuji sebagai unit sama sekali (impornya gagal diselesaikan).
      "server-only": new URL("./tests/stubs/server-only.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    server: {
      deps: {
        /*
         * `next-auth` mengimpor `next/server` tanpa `.js`; Node ESM menolaknya
         * bila pustakanya dieksternalkan. Diproses Vite supaya
         * `tests/auth-config-error-fails-closed.test.ts` bisa menguji
         * `auth()` yang sungguhan (GHSA-8fpg-xm3f-6cx3).
         */
        inline: ["next-auth"],
      },
    },
    // `.tsx` ikut disertakan sejak issue #50: invarian primitif UI diuji lewat
    // markup hasil render (react-dom/server), jadi berkasnya memuat JSX.
    include: ["tests/**/*.test.{ts,tsx}"],
    // Sejak issue #104 setiap tes berjalan di dalam sebuah perusahaan — kode
    // aplikasi memang menolak menyentuh basis data tanpa konteks itu. Sifat
    // "tanpa konteks harus melempar" tetap diuji eksplisit di
    // tests/company-context.test.ts.
    setupFiles: ["tests/setup-company-context.ts"],
    // Kredensial contoh untuk pembentukan klien; tes tidak pernah membuka
    // koneksi — mesinnya dijalankan lewat fake client di memori.
    env: {
      DATABASE_URL: "postgres://test:test@127.0.0.1:5432/test",
      CONTROL_DATABASE_URL: "postgres://test:test@127.0.0.1:5432/test_control",
      /*
       * Rahasia penandatangan kunci buku (`lib/company-unlock.ts`). Nilainya
       * sembarang; yang penting ADA — modul itu sengaja MELEMPAR tanpa rahasia,
       * sebab tanda tangan yang bisa dikarang siapa pun lebih buruk daripada
       * tidak ada kunci: ia terlihat seperti perlindungan. Tes yang membuktikan
       * lemparan itu menyetel ulang variabelnya sendiri.
       */
      AUTH_SECRET: "rahasia-uji-jangan-dipakai-di-mana-pun-selain-tes",
    },
  },
});
