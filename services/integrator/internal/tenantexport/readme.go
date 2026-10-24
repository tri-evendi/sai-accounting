package tenantexport

import (
	"fmt"
	"strings"
	"time"
	"unicode/utf16"
)

// ══ BERKAS PENGANTAR — PADANAN `buildTenantExport` TS ══════════════════════
//
// `tenant.json` dan `BACA-SAYA.txt` disusun dengan teks yang SAMA PERSIS
// dengan `src/lib/tenant-export.ts`; `tests/tenant-export-job.test.ts`
// memastikan setiap baris tetap `BACA-SAYA.txt` sisi TS juga ada di sini, dan
// `bun run parity:tenant-export` membandingkan byte-nya.

// isoMillis: `Date.prototype.toISOString()` untuk instan berketelitian
// milidetik (dipotong, seperti JS).
func isoMillis(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

// jsonString: `JSON.stringify(s)` — BUKAN `encoding/json`, yang meng-escape
// `<`, `>`, `&`, U+2028 dan U+2029 sementara JS tidak.
func jsonString(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				fmt.Fprintf(&b, `\u%04x`, r)
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return b.String()
}

func jsonBool(v bool) string {
	if v {
		return "true"
	}
	return "false"
}

// tenantJSON: `JSON.stringify({...}, null, 2)` sisi TS, kunci dalam urutan
// yang sama.
func tenantJSON(t Tenant, companies []companyRow, generatedAt time.Time) string {
	var b strings.Builder
	b.WriteString("{\n")
	fmt.Fprintf(&b, "  \"exportedAt\": %s,\n", jsonString(isoMillis(generatedAt)))
	b.WriteString("  \"tenant\": {\n")
	fmt.Fprintf(&b, "    \"slug\": %s,\n", jsonString(t.Slug))
	fmt.Fprintf(&b, "    \"name\": %s,\n", jsonString(t.Name))
	fmt.Fprintf(&b, "    \"status\": %s,\n", jsonString(t.Status))
	fmt.Fprintf(&b, "    \"planKey\": %s,\n", jsonString(t.PlanKey))
	fmt.Fprintf(&b, "    \"createdAt\": %s\n", jsonString(isoMillis(t.CreatedAt)))
	b.WriteString("  },\n")
	if len(companies) == 0 {
		b.WriteString("  \"companies\": []\n")
	} else {
		b.WriteString("  \"companies\": [\n")
		for i, c := range companies {
			b.WriteString("    {\n")
			fmt.Fprintf(&b, "      \"slug\": %s,\n", jsonString(c.Slug))
			fmt.Fprintf(&b, "      \"name\": %s,\n", jsonString(c.Name))
			fmt.Fprintf(&b, "      \"isActive\": %s\n", jsonBool(c.IsActive))
			if i < len(companies)-1 {
				b.WriteString("    },\n")
			} else {
				b.WriteString("    }\n")
			}
		}
		b.WriteString("  ]\n")
	}
	b.WriteString("}")
	return b.String()
}

// readme: `BACA-SAYA.txt` sisi TS, baris demi baris.
func readme(t Tenant, companies []companyRow, generatedAt time.Time) string {
	slugs := make([]string, 0, len(companies))
	for _, c := range companies {
		slugs = append(slugs, c.Slug)
	}
	daftar := strings.Join(slugs, ", ")
	if daftar == "" {
		daftar = "(belum ada)"
	}
	return "EKSPOR DATA SAI ACCOUNTING\r\n" +
		"==========================\r\n\r\n" +
		"Tenant   : " + t.Name + " (" + t.Slug + ")\r\n" +
		"Dibuat   : " + isoMillis(generatedAt) + "\r\n" +
		"Perusahaan: " + daftar + "\r\n\r\n" +
		"Setiap folder adalah satu perusahaan; setiap berkas .csv adalah satu\r\n" +
		"tabel pembukuannya, apa adanya — dibuka dengan Excel, LibreOffice, atau\r\n" +
		"editor teks; encoding UTF-8 (ber-BOM), pemisah koma, tanggal ISO-8601.\r\n" +
		"Nilai uang tercantum sebagai teks desimal, tidak pernah dibulatkan.\r\n\r\n" +
		"Sub-folder `documents/` berisi berkas yang pernah diunggah ke perusahaan\r\n" +
		"itu (kontrak, B/L, faktur pindaian). Namanya diawali id barisnya di tabel\r\n" +
		"`documents.csv`, supaya keduanya bisa dipasangkan kembali.\r\n\r\n" +
		"Simpan arsip ini baik-baik: UU KUP menuntut buku dan catatan pembukuan\r\n" +
		"disimpan 10 (sepuluh) tahun.\r\n"
}

// missingDocuments: `documents/BERKAS-TIDAK-DITEMUKAN.txt` sisi TS.
func missingDocuments(lines []string) string {
	return "Baris `documents` berikut ada di basis data, tetapi berkasnya tidak\r\n" +
		"ditemukan di penyimpanan saat ekspor ini dibuat.\r\n\r\n" +
		"id\tnama berkas\tkunci penyimpanan\r\n" +
		strings.Join(lines, "\r\n") +
		"\r\n"
}

// archiveEntryName: `archiveEntryName` TS — pemisah jalur jadi `_` (zip-slip),
// titik di depan jadi SATU `_`, dipotong 120 UNIT UTF-16 (`String.slice`),
// kosong jadi "dokumen"; id di depan menyelesaikan nama kembar.
func archiveEntryName(id int64, filename string) string {
	safe := strings.NewReplacer(`\`, "_", "/", "_").Replace(filename)
	if trimmed := strings.TrimLeft(safe, "."); len(trimmed) != len(safe) {
		safe = "_" + trimmed
	}
	units := utf16.Encode([]rune(safe))
	if len(units) > 120 {
		safe = string(utf16.Decode(units[:120]))
	}
	if safe == "" {
		safe = "dokumen"
	}
	return fmt.Sprintf("%d-%s", id, safe)
}
