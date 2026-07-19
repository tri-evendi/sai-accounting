<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI/UX & Design System (WAJIB untuk pekerjaan tampilan)

Setiap kali membuat/mengubah/mereview UI (halaman, komponen, warna, tipografi, layout, chart), **ikuti proses ini**:

1. **Baca sumber kebenaran desain dulu:** `design-system/sai-accounting/MASTER.md`. Jika ada `design-system/sai-accounting/pages/<page>.md`, aturannya **meng-override** MASTER.
2. **Gunakan skill `ui-ux-pro-max`** untuk rekomendasi berbasis data (style/palet/tipografi/aksesibilitas/chart) & panduan stack:
   ```bash
   python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <ux|color|typography|chart> --stack nextjs
   ```
   Skill terkait juga tersedia: `design-system` (token), `ui-styling` (shadcn/Tailwind).
3. **Patuhi prinsip app ini:** *simple surface, standard engine* — ramah pengguna awam, tapi proses akuntansi tetap baku. Light-first; semantik warna uang (hijau masuk / merah keluar) tak boleh warna-saja; angka `tabular-nums` rata-kanan format `id-ID`.
4. **Reuse** komponen `src/components/ui` (CVA) & ikon `lucide-react`. Warna/spacing dari token, bukan hex mentah.
5. Sebelum menyerahkan UI, lewati **Pre-Delivery Checklist** di MASTER.md.
