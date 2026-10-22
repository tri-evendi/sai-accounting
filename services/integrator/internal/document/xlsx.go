// Package document menghasilkan BERKAS laporan dari pohon Go — tahap 1d (09 §9).
//
// ══ PENULIS XLSX SENDIRI, BUKAN PUSTAKA ════════════════════════════════════
// go.mod menjaga dependensi sesedikit mungkin: yang boleh masuk hanya yang tak
// punya padanan di pustaka baku (lihat kepala go.mod). XLSX adalah ZIP berisi
// beberapa berkas XML, dan pustaka baku sudah punya keduanya (`archive/zip`,
// `encoding/xml`). Yang dibutuhkan lembar laporan hanya sebagian kecil format
// itu — teks, angka, format angka, tebal, isi warna, perataan, lebar kolom —
// jadi pustaka seperti excelize (puluhan ribu baris, beserta dependensinya)
// akan membayar balik sebagian besar alasan Go dipilih (memori diam & image
// kecil, 09 §3.3) untuk fitur yang tidak satu pun dipakai.
//
// Yang ditulis di sini SENGAJA terbatas pada model lembar yang dipakai
// `src/lib/xlsx.ts` (ExcelJS) — bukan penulis XLSX umum. Kesetaraan isinya
// dengan berkas TS dibuktikan `bun run parity:trial-balance-xlsx`, yang
// membaca KEDUA berkas dengan pembaca yang sama (ExcelJS).
//
// ══ BYTE-IDENTIK MUSTAHIL, DAN BUKAN TUJUANNYA ═════════════════════════════
// Dua penulis ZIP/XML tidak pernah menghasilkan byte yang sama (urutan atribut,
// kompresi, tabel gaya). Yang disepakati adalah ISI: nilai & tipe tiap sel,
// format angka, tebal, ukuran & warna huruf, isi warna, perataan, lebar kolom,
// nama lembar, dan pembuat buku kerja — definisinya di
// `src/lib/xlsx-content-parity.ts`.
package document

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Font adalah gaya huruf satu sel. Nilai nol = huruf bawaan buku kerja.
type Font struct {
	Bold      bool
	Size      float64 // 0 = bawaan
	ColorARGB string  // "" = bawaan
}

// Style adalah gaya satu sel.
type Style struct {
	Font     Font
	NumFmt   string // "" = General
	FillARGB string // "" = tanpa isi
	HAlign   string // "", "left", "right"
}

// Cell adalah satu sel. Tepat satu dari Text/Number bermakna, ditentukan Kind.
type Cell struct {
	Kind   CellKind
	Text   string
	Number string // desimal yang sudah diformat, mis. "1234567.89"
	Style  Style
}

// CellKind membedakan sel kosong, teks, dan angka.
type CellKind int

const (
	// CellEmpty: sel tanpa nilai. Ditulis HANYA bila bergaya.
	CellEmpty CellKind = iota
	// CellText: teks (tabel string bersama).
	CellText
	// CellNumber: angka — tetap angka di lembar sebar supaya bisa dijumlah.
	CellNumber
)

// TextCell membuat sel teks.
func TextCell(s string, st Style) Cell { return Cell{Kind: CellText, Text: s, Style: st} }

// NumberCell membuat sel angka dari desimal yang sudah diformat.
func NumberCell(n string, st Style) Cell { return Cell{Kind: CellNumber, Number: n, Style: st} }

// EmptyCell membuat sel kosong.
func EmptyCell() Cell { return Cell{Kind: CellEmpty} }

// Sheet adalah satu lembar kerja.
type Sheet struct {
	Name         string
	ColumnWidths []float64
	// Rows: satu baris per elemen; baris tanpa sel = baris kosong.
	Rows [][]Cell
}

// Workbook adalah satu buku kerja.
type Workbook struct {
	Creator string
	Created time.Time
	Sheets  []Sheet
}

// ── tabel gaya ─────────────────────────────────────────────────────────────

type xfKey struct {
	numFmtID, fontID, fillID int
	hAlign                   string
}

type styleTable struct {
	numFmts   []string // id kustom mulai 164
	fonts     []Font   // indeks 0 = bawaan
	fills     []string // indeks 0 none, 1 gray125, 2.. solid ARGB
	xfs       []xfKey  // indeks 0 = bawaan
	xfIndexOf map[xfKey]int
}

func newStyleTable() *styleTable {
	return &styleTable{
		fonts:     []Font{{}},
		fills:     []string{"", ""},
		xfs:       []xfKey{{}},
		xfIndexOf: map[xfKey]int{{}: 0},
	}
}

func (t *styleTable) numFmtID(f string) int {
	if f == "" {
		return 0
	}
	for i, x := range t.numFmts {
		if x == f {
			return 164 + i
		}
	}
	t.numFmts = append(t.numFmts, f)
	return 164 + len(t.numFmts) - 1
}

func (t *styleTable) fontID(f Font) int {
	for i, x := range t.fonts {
		if x == f {
			return i
		}
	}
	t.fonts = append(t.fonts, f)
	return len(t.fonts) - 1
}

func (t *styleTable) fillID(argb string) int {
	if argb == "" {
		return 0
	}
	for i := 2; i < len(t.fills); i++ {
		if t.fills[i] == argb {
			return i
		}
	}
	t.fills = append(t.fills, argb)
	return len(t.fills) - 1
}

func (t *styleTable) index(s Style) int {
	k := xfKey{
		numFmtID: t.numFmtID(s.NumFmt),
		fontID:   t.fontID(s.Font),
		fillID:   t.fillID(s.FillARGB),
		hAlign:   s.HAlign,
	}
	if i, ada := t.xfIndexOf[k]; ada {
		return i
	}
	t.xfs = append(t.xfs, k)
	t.xfIndexOf[k] = len(t.xfs) - 1
	return len(t.xfs) - 1
}

// ── penulisan ──────────────────────────────────────────────────────────────

// esc meloloskan teks untuk isi elemen/atribut XML.
func esc(s string) string {
	var b strings.Builder
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}

// colName: 0 → "A", 25 → "Z", 26 → "AA".
func colName(i int) string {
	n := ""
	for i++; i > 0; i = (i - 1) / 26 {
		n = string(rune('A'+(i-1)%26)) + n
	}
	return n
}

// fmtFloat menulis angka gaya tanpa nol ekor (12, 9.5).
func fmtFloat(f float64) string { return strconv.FormatFloat(f, 'f', -1, 64) }

// Bytes merakit buku kerja menjadi berkas .xlsx.
func (w *Workbook) Bytes() ([]byte, error) {
	if len(w.Sheets) == 0 {
		return nil, fmt.Errorf("buku kerja tanpa lembar")
	}
	st := newStyleTable()
	var shared []string
	sharedIndex := map[string]int{}
	str := func(s string) int {
		if i, ada := sharedIndex[s]; ada {
			return i
		}
		shared = append(shared, s)
		sharedIndex[s] = len(shared) - 1
		return len(shared) - 1
	}

	sheetXML := make([]string, len(w.Sheets))
	for si, sh := range w.Sheets {
		var b strings.Builder
		b.WriteString(xml.Header)
		b.WriteString(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`)
		if len(sh.ColumnWidths) > 0 {
			b.WriteString("<cols>")
			for i, wd := range sh.ColumnWidths {
				fmt.Fprintf(&b, `<col min="%d" max="%d" width="%s" customWidth="1"/>`, i+1, i+1, fmtFloat(wd))
			}
			b.WriteString("</cols>")
		}
		b.WriteString("<sheetData>")
		for ri, row := range sh.Rows {
			r := ri + 1
			var cells strings.Builder
			for ci, c := range row {
				ref := fmt.Sprintf("%s%d", colName(ci), r)
				s := st.index(c.Style)
				sAttr := ""
				if s != 0 {
					sAttr = fmt.Sprintf(` s="%d"`, s)
				}
				switch c.Kind {
				case CellText:
					fmt.Fprintf(&cells, `<c r="%s"%s t="s"><v>%d</v></c>`, ref, sAttr, str(c.Text))
				case CellNumber:
					if _, err := strconv.ParseFloat(c.Number, 64); err != nil {
						return nil, fmt.Errorf("sel %s: %q bukan angka", ref, c.Number)
					}
					fmt.Fprintf(&cells, `<c r="%s"%s><v>%s</v></c>`, ref, sAttr, c.Number)
				case CellEmpty:
					if s != 0 {
						fmt.Fprintf(&cells, `<c r="%s"%s/>`, ref, sAttr)
					}
				}
			}
			if cells.Len() == 0 {
				continue
			}
			fmt.Fprintf(&b, `<row r="%d">%s</row>`, r, cells.String())
		}
		b.WriteString("</sheetData></worksheet>")
		sheetXML[si] = b.String()
	}

	var buf bytes.Buffer
	z := zip.NewWriter(&buf)
	// Waktu entri ZIP dipaku ke `Created`: berkas yang sama dari data yang sama
	// adalah byte yang sama — itulah yang membuat golden test di sisi Go bisa
	// membandingkan byte.
	tulis := func(nama, isi string) error {
		f, err := z.CreateHeader(&zip.FileHeader{Name: nama, Method: zip.Deflate, Modified: w.Created})
		if err != nil {
			return err
		}
		_, err = f.Write([]byte(isi))
		return err
	}

	berkas := []struct{ nama, isi string }{
		{"[Content_Types].xml", contentTypes(len(w.Sheets))},
		{"_rels/.rels", rootRels},
		{"docProps/core.xml", coreXML(w.Creator, w.Created)},
		{"xl/workbook.xml", workbookXML(w.Sheets)},
		{"xl/_rels/workbook.xml.rels", workbookRels(len(w.Sheets))},
		{"xl/styles.xml", st.xml()},
		{"xl/sharedStrings.xml", sharedXML(shared)},
	}
	for i, s := range sheetXML {
		berkas = append(berkas, struct{ nama, isi string }{fmt.Sprintf("xl/worksheets/sheet%d.xml", i+1), s})
	}
	for _, f := range berkas {
		if err := tulis(f.nama, f.isi); err != nil {
			return nil, fmt.Errorf("tulis %s: %w", f.nama, err)
		}
	}
	if err := z.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

const rootRels = xml.Header + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
	`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
	`<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
	`</Relationships>`

func contentTypes(n int) string {
	var b strings.Builder
	b.WriteString(xml.Header)
	b.WriteString(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`)
	b.WriteString(`<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`)
	b.WriteString(`<Default Extension="xml" ContentType="application/xml"/>`)
	b.WriteString(`<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`)
	for i := 1; i <= n; i++ {
		fmt.Fprintf(&b, `<Override PartName="/xl/worksheets/sheet%d.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`, i)
	}
	b.WriteString(`<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`)
	b.WriteString(`<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>`)
	b.WriteString(`<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`)
	b.WriteString(`</Types>`)
	return b.String()
}

func coreXML(creator string, created time.Time) string {
	ts := created.UTC().Format("2006-01-02T15:04:05Z")
	return xml.Header + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
		`<dc:creator>` + esc(creator) + `</dc:creator>` +
		`<dcterms:created xsi:type="dcterms:W3CDTF">` + ts + `</dcterms:created>` +
		`<dcterms:modified xsi:type="dcterms:W3CDTF">` + ts + `</dcterms:modified>` +
		`</cp:coreProperties>`
}

func workbookXML(sheets []Sheet) string {
	var b strings.Builder
	b.WriteString(xml.Header)
	b.WriteString(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>`)
	for i, s := range sheets {
		fmt.Fprintf(&b, `<sheet name="%s" sheetId="%d" r:id="rId%d"/>`, esc(s.Name), i+1, i+1)
	}
	b.WriteString(`</sheets></workbook>`)
	return b.String()
}

func workbookRels(n int) string {
	var b strings.Builder
	b.WriteString(xml.Header)
	b.WriteString(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`)
	for i := 1; i <= n; i++ {
		fmt.Fprintf(&b, `<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"/>`, i, i)
	}
	fmt.Fprintf(&b, `<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`, n+1)
	fmt.Fprintf(&b, `<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`, n+2)
	b.WriteString(`</Relationships>`)
	return b.String()
}

func sharedXML(s []string) string {
	var b strings.Builder
	b.WriteString(xml.Header)
	fmt.Fprintf(&b, `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="%d" uniqueCount="%d">`, len(s), len(s))
	for _, x := range s {
		b.WriteString(`<si><t xml:space="preserve">` + esc(x) + `</t></si>`)
	}
	b.WriteString(`</sst>`)
	return b.String()
}

// xml merakit styles.xml. Huruf bawaan Calibri 11 — sama dengan bawaan ExcelJS.
func (t *styleTable) xml() string {
	var b strings.Builder
	b.WriteString(xml.Header)
	b.WriteString(`<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`)
	if len(t.numFmts) > 0 {
		fmt.Fprintf(&b, `<numFmts count="%d">`, len(t.numFmts))
		for i, f := range t.numFmts {
			fmt.Fprintf(&b, `<numFmt numFmtId="%d" formatCode="%s"/>`, 164+i, esc(f))
		}
		b.WriteString(`</numFmts>`)
	}
	fmt.Fprintf(&b, `<fonts count="%d">`, len(t.fonts))
	for _, f := range t.fonts {
		b.WriteString("<font>")
		if f.Bold {
			b.WriteString("<b/>")
		}
		size := f.Size
		if size == 0 {
			size = 11
		}
		fmt.Fprintf(&b, `<sz val="%s"/>`, fmtFloat(size))
		if f.ColorARGB != "" {
			fmt.Fprintf(&b, `<color rgb="%s"/>`, esc(f.ColorARGB))
		} else {
			b.WriteString(`<color theme="1"/>`)
		}
		b.WriteString(`<name val="Calibri"/><family val="2"/><scheme val="minor"/></font>`)
	}
	b.WriteString(`</fonts>`)
	fmt.Fprintf(&b, `<fills count="%d"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>`, len(t.fills))
	for _, f := range t.fills[2:] {
		fmt.Fprintf(&b, `<fill><patternFill patternType="solid"><fgColor rgb="%s"/></patternFill></fill>`, esc(f))
	}
	b.WriteString(`</fills>`)
	b.WriteString(`<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>`)
	b.WriteString(`<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`)
	fmt.Fprintf(&b, `<cellXfs count="%d">`, len(t.xfs))
	for _, x := range t.xfs {
		fmt.Fprintf(&b, `<xf numFmtId="%d" fontId="%d" fillId="%d" borderId="0" xfId="0"`, x.numFmtID, x.fontID, x.fillID)
		if x.numFmtID != 0 {
			b.WriteString(` applyNumberFormat="1"`)
		}
		if x.fontID != 0 {
			b.WriteString(` applyFont="1"`)
		}
		if x.fillID != 0 {
			b.WriteString(` applyFill="1"`)
		}
		if x.hAlign != "" {
			fmt.Fprintf(&b, ` applyAlignment="1"><alignment horizontal="%s"/></xf>`, esc(x.hAlign))
		} else {
			b.WriteString(`/>`)
		}
	}
	b.WriteString(`</cellXfs>`)
	b.WriteString(`<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`)
	b.WriteString(`</styleSheet>`)
	return b.String()
}
