// PENJAGA pencacahan per instans (tahap 4) — tanpa satu server pun.
//
// `Rakit` murni: bacaan `pg_database` tiap server dan registry kendali masuk,
// pencacahan keluar. Bagian yang membaca server sungguhan diuji di
// `daftar_integration_test.go`.
package backup

import (
	"reflect"
	"testing"
)

func regSatuServer() *Registry {
	return &Registry{Perusahaan: []PerusahaanTerdaftar{
		{ID: 1, Basis: "sai_pt_satu"},
		{ID: 2, Basis: "sai_pt_dua"},
	}}
}

func TestTanpaInstansTambahanPencacahanSAMADenganSebelumTahap4(t *testing.T) {
	/* Pemasangan satu server tidak boleh melihat apa pun berubah: peran,
	   urutan, dan bentuk `Hilang` sama persis. */
	c := Rakit("sai_control", regSatuServer(),
		[]string{"postgres", "sai_control", "sai_platform", "sai_pt_dua", "sai_pt_satu"}, nil, nil)

	mau := []Basis{
		{Nama: "postgres", Peran: PeranLain},
		{Nama: "sai_control", Peran: PeranKendali},
		{Nama: "sai_platform", Peran: PeranPlatform},
		{Nama: "sai_pt_dua", Peran: PeranPerusahaan, CompanyID: idDari(2)},
		{Nama: "sai_pt_satu", Peran: PeranPerusahaan, CompanyID: idDari(1)},
	}
	if !reflect.DeepEqual(c.Basis, mau) {
		t.Errorf("basis =\n%+v\nmau\n%+v", c.Basis, mau)
	}
	if len(c.Hilang) != 0 || len(c.Instans) != 0 || len(c.Gagal) != 0 {
		t.Errorf("cacah = %+v", c)
	}

	c = Rakit("sai_control", regSatuServer(), []string{"sai_control", "sai_pt_satu"}, nil, nil)
	if !reflect.DeepEqual(c.Hilang, []string{"sai_pt_dua"}) {
		t.Errorf("hilang = %v — instans bawaan ditulis TANPA @kunci", c.Hilang)
	}
}

func regDuaInstans() *Registry {
	return &Registry{
		Perusahaan: []PerusahaanTerdaftar{
			{ID: 1, Basis: "sai_pt_satu"},
			{ID: 2, Basis: "sai_pt_dua", Instans: "db2"},
			{ID: 3, Basis: "sai_pt_tiga", Instans: "db2"},
		},
		Instans: []Instans{{Kunci: "db2", EnvVar: "COMPANY_DB2_DATABASE_URL_TEMPLATE"}},
	}
}

func TestPTDiInstansXHanyaDiakuiDariServerX(t *testing.T) {
	/* Selama pemindahan nama yang sama hidup di dua server. Salinan di server
	   bawaan TIDAK membuktikan apa pun tentang db2, jadi ia `other` tanpa
	   companyId — dan `BasisPerusahaan(2)` menunjuk objek dari db2. */
	server := map[string]*ServerInstans{
		"db2": {Basis: []string{"postgres", "sai_pt_dua", "sai_pt_tiga"}, VersiServer: 17},
	}
	c := Rakit("sai_control", regDuaInstans(),
		[]string{"sai_control", "sai_pt_dua", "sai_pt_satu"}, server, nil)

	if len(c.Hilang) != 0 || len(c.Gagal) != 0 {
		t.Fatalf("hilang=%v gagal=%+v", c.Hilang, c.Gagal)
	}
	var salinanBawaan, asliDb2 *Basis
	for i := range c.Basis {
		b := &c.Basis[i]
		if b.Nama == "sai_pt_dua" && b.Instans == "" {
			salinanBawaan = b
		}
		if b.Nama == "sai_pt_dua" && b.Instans == "db2" {
			asliDb2 = b
		}
		if b.Instans == "db2" && b.Nama == "sai_control" {
			t.Error("instans tambahan memuat peran kendali")
		}
	}
	if salinanBawaan == nil || salinanBawaan.Peran != PeranLain || salinanBawaan.CompanyID != nil {
		t.Errorf("salinan di server bawaan = %+v, mau `other` tanpa companyId", salinanBawaan)
	}
	if asliDb2 == nil || asliDb2.Peran != PeranPerusahaan || asliDb2.CompanyID == nil || *asliDb2.CompanyID != 2 {
		t.Errorf("buku di db2 = %+v", asliDb2)
	}
	if len(c.Instans) != 1 || c.Instans[0].Kunci != "db2" || c.Instans[0].VersiServer != 17 {
		t.Errorf("instans = %+v", c.Instans)
	}
}

func TestPTYangHanyaAdaDiServerBAWAANTetapHilangUntukInstansnya(t *testing.T) {
	/* Inilah persis keadaan yang dulu lolos: buku db2 belum ada di db2, tapi
	   nama yang sama ada di server bawaan. Bukti kelengkapan per instans wajib
	   menyebutnya hilang. */
	server := map[string]*ServerInstans{"db2": {Basis: []string{"sai_pt_tiga"}, VersiServer: 17}}
	c := Rakit("sai_control", regDuaInstans(),
		[]string{"sai_control", "sai_pt_dua", "sai_pt_satu"}, server, nil)
	if !reflect.DeepEqual(c.Hilang, []string{"sai_pt_dua@db2"}) {
		t.Errorf("hilang = %v, mau [sai_pt_dua@db2]", c.Hilang)
	}
}

func TestInstansYangGagalDibukaMenyebutPTnya(t *testing.T) {
	c := Rakit("sai_control", regDuaInstans(), []string{"sai_control", "sai_pt_satu"},
		nil, map[string]string{"db2": "COMPANY_DB2_DATABASE_URL_TEMPLATE tidak diset"})
	if len(c.Gagal) != 1 {
		t.Fatalf("gagal = %+v", c.Gagal)
	}
	g := c.Gagal[0]
	if g.Kunci != "db2" || !reflect.DeepEqual(g.Basis, []string{"sai_pt_dua", "sai_pt_tiga"}) {
		t.Errorf("gagal = %+v", g)
	}
	// Bukan `Hilang`: yang hilang servernya, bukan bukunya — dan instans
	// bawaan tetap dicadangkan.
	if len(c.Hilang) != 0 {
		t.Errorf("hilang = %v", c.Hilang)
	}
	for _, b := range c.Basis {
		if b.Instans != "" {
			t.Errorf("basis dari instans yang gagal ikut tercacah: %+v", b)
		}
	}
}

func TestKunciInstansTakTerdaftarGAGALBukanBawaan(t *testing.T) {
	// FK menolak keadaan ini; bila tetap terjadi ia gagal, bukan dicari di
	// server bawaan.
	reg := &Registry{Perusahaan: []PerusahaanTerdaftar{{ID: 9, Basis: "sai_pt_x", Instans: "hantu"}}}
	c := Rakit("sai_control", reg, []string{"sai_control", "sai_pt_x"}, nil, nil)
	if len(c.Gagal) != 1 || c.Gagal[0].Kunci != "hantu" {
		t.Fatalf("gagal = %+v", c.Gagal)
	}
	for _, b := range c.Basis {
		if b.Nama == "sai_pt_x" && b.CompanyID != nil {
			t.Error("buku PT di instans tak dikenal diakui dari server bawaan")
		}
	}
}
