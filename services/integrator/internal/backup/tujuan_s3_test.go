// PENJAGA pemakaian SDK S3 — terhadap server HTTP uji, bukan terhadap AWS.
//
// ══ APA YANG DIUJI, DAN APA YANG SENGAJA TIDAK ═════════════════════════════
// TIDAK diuji: tanda tangan SigV4. Itu milik SDK, dan tes yang memverifikasinya
// hanya menguji ulang pustaka orang lain. Keputusan memakai SDK alih-alih
// menandatangani sendiri sudah tertulis di `tujuan_s3.go` dan di Dockerfile.
//
// DIUJI: pemakaiannya, dan tiga di antaranya punya bentuk kegagalan yang
// tidak menghasilkan galat apa pun —
//
//  1. tata letak kunci (`<prefix>/<putaran>/<objek>`). Kunci yang salah berarti
//     objek yang terkirim ke tempat yang tidak dicari siapa pun saat memulihkan;
//  2. PAGINASI daftar. `ListObjectsV2` memulangkan paling banyak 1000 entri,
//     dan daftar yang terpotong membuat pemangkas melewatkan putaran lama tanpa
//     bunyi — tumbuh selamanya sambil terlihat bekerja;
//  3. `Errors` di dalam jawaban `DeleteObjects`. S3 memulangkan 200 dengan
//     daftar kegagalan DI DALAM badannya; mengabaikannya berarti pemangkas
//     melaporkan sukses atas objek yang masih ada.
package backup

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
)

// serverS3 adalah tiruan S3 yang hanya memahami yang dipakai paket ini.
type serverS3 struct {
	t *testing.T

	disimpan map[string][]byte
	// halaman daftar: tiap panggilan `ListObjectsV2` memulangkan satu halaman.
	halaman    []string // badan XML per halaman
	halamanKe  int
	hapusBadan string
	jejak      []string
}

func (s *serverS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.jejak = append(s.jejak, r.Method+" "+r.URL.Path+"?"+r.URL.RawQuery)

	switch {
	case r.Method == http.MethodPut:
		b, err := io.ReadAll(r.Body)
		if err != nil {
			s.t.Fatalf("baca badan PUT: %v", err)
		}
		// Kunci = jalur tanpa `/bucket` di depan (path-style).
		kunci := strings.TrimPrefix(r.URL.Path, "/cadangan-uji/")
		s.disimpan[kunci] = b
		w.WriteHeader(http.StatusOK)

	case r.Method == http.MethodPost && r.URL.Query().Has("delete"):
		if _, err := io.ReadAll(r.Body); err != nil {
			s.t.Fatalf("baca badan DELETE: %v", err)
		}
		w.Header().Set("Content-Type", "application/xml")
		_, _ = io.WriteString(w, s.hapusBadan)

	case r.Method == http.MethodGet && r.URL.Query().Get("list-type") == "2":
		if s.halamanKe >= len(s.halaman) {
			s.t.Fatalf("halaman daftar ke-%d diminta, hanya ada %d", s.halamanKe+1, len(s.halaman))
		}
		badan := s.halaman[s.halamanKe]
		s.halamanKe++
		w.Header().Set("Content-Type", "application/xml")
		_, _ = io.WriteString(w, badan)

	default:
		s.t.Fatalf("permintaan tak terduga: %s %s?%s", r.Method, r.URL.Path, r.URL.RawQuery)
	}
}

func s3Uji(t *testing.T, s *serverS3) (*S3, *httptest.Server) {
	t.Helper()
	s.t = t
	if s.disimpan == nil {
		s.disimpan = map[string][]byte{}
	}
	srv := httptest.NewServer(s)
	t.Cleanup(srv.Close)

	// Kredensial statis & path-style: yang diuji pemakaian, bukan rantai
	// kredensial maupun resolusi host.
	t.Setenv("AWS_ACCESS_KEY_ID", "uji")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "uji")
	t.Setenv("AWS_REGION", "us-east-1")

	tujuan, err := NewS3(context.Background(), OpsiS3{
		Bucket:    "cadangan-uji",
		Prefix:    "cadangan",
		Endpoint:  srv.URL,
		PathStyle: true,
	})
	if err != nil {
		t.Fatalf("NewS3: %v", err)
	}
	return tujuan, srv
}

func daftarXML(prefix string, putaran []string, lanjut string) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>`)
	b.WriteString(`<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">`)
	b.WriteString(`<Name>cadangan-uji</Name><Prefix>` + prefix + `</Prefix><Delimiter>/</Delimiter>`)
	if lanjut != "" {
		b.WriteString(`<IsTruncated>true</IsTruncated><NextContinuationToken>` + lanjut +
			`</NextContinuationToken>`)
	} else {
		b.WriteString(`<IsTruncated>false</IsTruncated>`)
	}
	for _, p := range putaran {
		b.WriteString(`<CommonPrefixes><Prefix>` + prefix + p + `/</Prefix></CommonPrefixes>`)
	}
	b.WriteString(`</ListBucketResult>`)
	return b.String()
}

func isiXML(prefix string, kunci []string) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>`)
	b.WriteString(`<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">`)
	b.WriteString(`<Name>cadangan-uji</Name><Prefix>` + prefix + `</Prefix>`)
	b.WriteString(`<IsTruncated>false</IsTruncated>`)
	for _, k := range kunci {
		b.WriteString(`<Contents><Key>` + k + `</Key><Size>1</Size></Contents>`)
	}
	b.WriteString(`</ListBucketResult>`)
	return b.String()
}

func TestS3MenyimpanDiBawahPrefixDanPutaran(t *testing.T) {
	s := &serverS3{}
	tujuan, _ := s3Uji(t, s)
	if err := tujuan.Simpan(context.Background(),
		"sai-20261020T000000Z/db-sai_pt_satu.dump.enc",
		strings.NewReader("muatan")); err != nil {
		t.Fatalf("Simpan: %v", err)
	}
	mau := "cadangan/sai-20261020T000000Z/db-sai_pt_satu.dump.enc"
	isi, ada := s.disimpan[mau]
	if !ada {
		kunci := make([]string, 0, len(s.disimpan))
		for k := range s.disimpan {
			kunci = append(kunci, k)
		}
		sort.Strings(kunci)
		t.Fatalf("kunci %q tidak terkirim; yang ada: %v", mau, kunci)
	}
	if string(isi) != "muatan" {
		t.Errorf("isi = %q", isi)
	}
}

func TestS3DaftarPutaranMelaluiSELURUHHalaman(t *testing.T) {
	/* Daftar yang terpotong membuat pemangkas melewatkan putaran lama tanpa
	   bunyi — tumbuh selamanya sambil terlihat bekerja. */
	s := &serverS3{halaman: []string{
		daftarXML("cadangan/", []string{"sai-20260101T000000Z", "sai-20260102T000000Z"}, "tok1"),
		daftarXML("cadangan/", []string{"sai-20260103T000000Z"}, ""),
	}}
	tujuan, _ := s3Uji(t, s)
	nama, err := tujuan.DaftarPutaran(context.Background())
	if err != nil {
		t.Fatalf("DaftarPutaran: %v", err)
	}
	sort.Strings(nama)
	mau := []string{"sai-20260101T000000Z", "sai-20260102T000000Z", "sai-20260103T000000Z"}
	if len(nama) != len(mau) {
		t.Fatalf("memulangkan %v, mau %v", nama, mau)
	}
	for i := range mau {
		if nama[i] != mau[i] {
			t.Errorf("[%d] = %q, mau %q", i, nama[i], mau[i])
		}
	}
	if s.halamanKe != 2 {
		t.Errorf("hanya %d halaman diminta", s.halamanKe)
	}
}

func TestS3BuangPutaranMenghapusSeluruhObjeknya(t *testing.T) {
	putaran := "sai-20260101T000000Z"
	s := &serverS3{
		halaman: []string{isiXML("cadangan/"+putaran+"/", []string{
			"cadangan/" + putaran + "/db-a.dump.enc",
			"cadangan/" + putaran + "/db-a.dump.enc.sha256",
			"cadangan/" + putaran + "/manifest.json",
		})},
		hapusBadan: `<?xml version="1.0" encoding="UTF-8"?><DeleteResult ` +
			`xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
			`<Deleted><Key>cadangan/` + putaran + `/db-a.dump.enc</Key></Deleted>` +
			`</DeleteResult>`,
	}
	tujuan, _ := s3Uji(t, s)
	if err := tujuan.BuangPutaran(context.Background(), putaran); err != nil {
		t.Fatalf("BuangPutaran: %v", err)
	}
	var adaHapus bool
	for _, j := range s.jejak {
		if strings.HasPrefix(j, "POST ") && strings.Contains(j, "delete") {
			adaHapus = true
		}
	}
	if !adaHapus {
		t.Errorf("tidak ada permintaan penghapusan; jejak: %v", s.jejak)
	}
}

func TestS3KegagalanPerObjekDiDalamJawaban200MenJADIGalat(t *testing.T) {
	/* S3 memulangkan 200 dengan daftar `Errors` di dalam badannya.
	   Mengabaikannya berarti pemangkas melaporkan sukses atas objek yang masih
	   ada — dan ruangnya tumbuh selamanya sambil setiap putaran berkata bersih. */
	putaran := "sai-20260101T000000Z"
	s := &serverS3{
		halaman: []string{isiXML("cadangan/"+putaran+"/",
			[]string{"cadangan/" + putaran + "/db-a.dump.enc"})},
		hapusBadan: `<?xml version="1.0" encoding="UTF-8"?><DeleteResult ` +
			`xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
			`<Error><Key>cadangan/` + putaran + `/db-a.dump.enc</Key>` +
			`<Code>AccessDenied</Code><Message>tidak boleh</Message></Error>` +
			`</DeleteResult>`,
	}
	tujuan, _ := s3Uji(t, s)
	err := tujuan.BuangPutaran(context.Background(), putaran)
	if err == nil {
		t.Fatal("kegagalan per objek di dalam jawaban 200 dilaporkan sukses")
	}
	if !strings.Contains(err.Error(), "tidak boleh") {
		t.Errorf("pesan galat tidak membawa sebabnya: %v", err)
	}
}

func TestS3MenolakMembuangYangBukanPutaran(t *testing.T) {
	s := &serverS3{}
	tujuan, _ := s3Uji(t, s)
	for _, jahat := range []string{"", "..", "cadangan", "semua"} {
		if err := tujuan.BuangPutaran(context.Background(), jahat); err == nil {
			t.Errorf("menerima permintaan membuang %q", jahat)
		}
	}
	if len(s.jejak) != 0 {
		t.Errorf("permintaan terkirim ke S3: %v", s.jejak)
	}
}

func TestS3MelaporkanDirinyaDiLuarMesin(t *testing.T) {
	s := &serverS3{}
	tujuan, _ := s3Uji(t, s)
	if !tujuan.LuarMesin() {
		t.Error("S3 melaporkan dirinya di dalam mesin — putaran akan tercatat `local`")
	}
	if !strings.HasPrefix(tujuan.Nama(), "s3://") {
		t.Errorf("Nama() = %q", tujuan.Nama())
	}
}

func TestS3TanpaBucketDitolak(t *testing.T) {
	if _, err := NewS3(context.Background(), OpsiS3{}); err == nil {
		t.Fatal("bucket kosong diterima")
	}
}

func TestPutaranPenuhKeS3(t *testing.T) {
	// Satu putaran lengkap ke tujuan S3: yang dibuktikan di sini bahwa
	// statusnya `ok` (ada salinan di LUAR mesin) dan setiap objek mendarat di
	// bawah prefix yang benar.
	s := &serverS3{halaman: []string{daftarXML("cadangan/", nil, "")}}
	tujuan, _ := s3Uji(t, s)
	h, err := Jalankan(context.Background(), opsiContoh(t, tujuan, &pendumpPalsu{}))
	if err != nil {
		t.Fatalf("Jalankan: %v", err)
	}
	if h.Status != "ok" {
		t.Errorf("status = %q, mau \"ok\"", h.Status)
	}
	for _, o := range h.Manifest.Objek {
		kunci := fmt.Sprintf("cadangan/%s/%s", h.Manifest.Putaran, o.Kunci)
		if _, ada := s.disimpan[kunci]; !ada {
			t.Errorf("objek %q tidak terkirim", kunci)
		}
		if _, ada := s.disimpan[kunci+".sha256"]; !ada {
			t.Errorf("sidik jari %q tidak terkirim", kunci+".sha256")
		}
	}
	if _, ada := s.disimpan[fmt.Sprintf("cadangan/%s/%s", h.Manifest.Putaran, NamaManifest)]; !ada {
		t.Error("manifest tidak terkirim")
	}
}
