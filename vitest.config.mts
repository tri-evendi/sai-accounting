import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
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
      DATABASE_URL: "mysql://test:test@127.0.0.1:3306/test",
      CONTROL_DATABASE_URL: "mysql://test:test@127.0.0.1:3306/test_control",
    },
  },
});
