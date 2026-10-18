/**
 * KEPALA KEAMANAN HTTP — satu sumber untuk KEDUA aplikasi (pelanggan di akar
 * repo, konsol di `apps/operator`). Dua salinan CSP adalah dua kebijakan yang
 * cepat atau lambat berbeda tanpa ada yang memutuskannya (monorepo Fase 3d).
 *
 * Dibaca `next.config.ts` masing-masing aplikasi lewat jalur relatif, bukan
 * lewat `@sai/core/...`: berkas konfigurasi dimuat Node sebelum resolusi
 * workspace dan `transpilePackages` berlaku.
 */
export function securityHeaders(isProduction: boolean): { key: string; value: string }[] {
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        /*
         * ── `script-src`: `'unsafe-eval'` DICABUT DI PRODUKSI ─────────────────
         *
         * Dokumentasi Next sendiri menyatakannya
         * (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`):
         *
         *   "In development, `'unsafe-eval'` is required because React uses
         *    `eval` to provide enhanced debugging information, such as
         *    reconstructing server-side error stacks in the browser.
         *    `unsafe-eval` is not required for production. Neither React nor
         *    Next.js use `eval` in production by default."
         *
         * Diperiksa juga di repo ini, bukan sekadar dipercaya:
         *   • NOL `eval(` / `new Function(` di seluruh `src/` tulisan sendiri;
         *   • dari 204 berkas js di `.next/static`, TEPAT SATU memuat `eval(` —
         *     dan itu shim `vm` milik dependensi Next sendiri (`vm-browserify`),
         *     berisi DEFINISI `Script.prototype.runInThisContext`, tanpa satu
         *     pun tempat pemanggilan di dalam bundel.
         *
         * Tetap diizinkan di pengembangan: tanpa itu, jejak galat sisi-server
         * berhenti bisa direkonstruksi di peramban, dan yang hilang justru
         * perkakas yang dipakai saat memperbaiki galat.
         *
         * ⚠ Kalau suatu saat sebuah pustaka BARU menuntut `eval` di produksi,
         * gejalanya adalah galat CSP di konsol peramban pada fitur yang
         * memakainya — BUKAN layar putih. Jangan mengembalikan `'unsafe-eval'`
         * secara global sebagai jawaban; cari pustakanya.
         */
        `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
        /*
         * ── `style-src 'unsafe-inline'` WAJIB TINGGAL, dan itu STRUKTURAL ─────
         *
         * Ini bukan kelalaian dan bukan sesuatu yang bisa ditutup dengan nonce.
         * Sejak issue #203 seluruh gaya di repo ini ditulis SEBARIS
         * (`style={{...}}`) — terukur 2.618 kemunculan di 305 berkas .tsx.
         *
         * Dan di CSP, `style-src` mengatur DUA hal yang sering tertukar: elemen
         * `<style>` DAN atribut `style="..."`. Sebuah nonce hanya bisa menandai
         * yang pertama; atribut gaya sebaris tidak punya tempat untuk membawa
         * nonce, dan satu-satunya yang mengizinkannya adalah `'unsafe-inline'`
         * (atau `'unsafe-hashes'`, yang menuntut hash setiap nilai gaya — 2.618
         * hash yang berubah setiap kali ada yang menyunting satu angka).
         *
         * Jadi mencabutnya menuntut PEMBATALAN #203, bukan penyetelan CSP. Itu
         * pertukaran yang jauh lebih besar daripada yang dibeli, dan keputusannya
         * sudah diambil di arah sebaliknya dengan sadar.
         */
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "connect-src 'self'",
        "font-src 'self'",
        // PDF pratinjau dokumen (faktur/kontrak/dll) dirender sebagai blob: di
        // dalam <iframe>/<embed> — izinkan blob: sesama-asal untuk frame/object,
        // tanpa membuka sumber luar apa pun (tetap 'self' selain blob:).
        "frame-src 'self' blob:",
        "object-src 'self' blob:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        /*
         * ── KENAPA `script-src` MASIH BER-`'unsafe-inline'` ───────────────────
         *
         * Next menyisipkan skrip bootstrap sebaris, jadi pilihannya hanya dua:
         * `'unsafe-inline'`, atau nonce per permintaan + `'strict-dynamic'`.
         * Yang kedua MUNGKIN, dan inilah yang dituntutnya — ditulis di sini
         * supaya pembaca berikutnya tahu ini sudah ditinjau, bukan terlewat:
         *
         *   1. CSP harus PINDAH dari `headers()` di berkas ini ke `proxy.ts`.
         *      Header di sini statis; nonce harus lahir ulang setiap permintaan.
         *   2. Setiap halaman harus dirender DINAMIS (syarat Next untuk nonce).
         *      Di repo ini hampir semuanya sudah `force-dynamic`, jadi ongkosnya
         *      kecil — tetapi "hampir" perlu dibuktikan satu per satu lebih dulu.
         *   3. CSS-in-JS Ant Design harus diberi nonce yang sama lewat
         *      `StyleProvider`, atau seluruh gaya komponennya diblokir.
         *   4. `'strict-dynamic'` harus diuji terhadap Recharts DAN pratinjau PDF
         *      blob — keduanya memuat/menyuntik di runtime, dan keduanya adalah
         *      permukaan yang kerusakannya HALUS: grafik yang kosong dan
         *      pratinjau yang gagal tidak menjatuhkan halaman.
         *
         * Jadi ia proyek tersendiri dengan permukaan uji yang nyata, bukan satu
         * baris di berkas ini. Yang dikerjakan sekarang adalah bagian yang bisa
         * DIBUKTIKAN tanpa itu: mencabut `'unsafe-eval'` di produksi.
         *
         * Catatan yang memudahkan kelak: begitu nonce + `'strict-dynamic'`
         * dipasang, peramban yang mendukung `strict-dynamic` MENGABAIKAN
         * `'unsafe-inline'` dengan sendirinya — jadi keduanya boleh hidup
         * bersama selama masa peralihan tanpa melemahkan yang baru.
         */
      ].join("; "),
    },
    ...(isProduction
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ]
      : []),
  ];
}
