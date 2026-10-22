// PENJAGA: perkakas paritas menyelesaikan INSTANS buku seperti pelari, dan
// tidak pernah membandingkan salinan di server bawaan untuk PT yang bukunya
// hidup di instans lain. Tanpa basis data.
package main

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/registry"
)

const envInstans = "COMPANY_DB2_DATABASE_URL_TEMPLATE"

func registryTiruan(daftar ...registry.Company) companyLookup {
	return func(_ context.Context, nama string) (*registry.Company, error) {
		for _, c := range daftar {
			if c.DatabaseName == nama {
				return &c, nil
			}
		}
		return nil, errors.New("basis data " + nama + " tidak terdaftar di registry kendali")
	}
}

// pembukaPencatat mencatat instans yang diminta tanpa membuka apa pun.
func pembukaPencatat(dicatat *[]string) bookOpener {
	return func(_ context.Context, nama, env string) (*ledgerread.Reader, error) {
		*dicatat = append(*dicatat, nama+"@"+env)
		return nil, nil
	}
}

func TestBukuDiInstansLainDibukaDiInstansnya(t *testing.T) {
	var dibuka []string
	lookup := registryTiruan(
		registry.Company{ID: 1, DatabaseName: "sai_pt_a"},
		registry.Company{ID: 2, DatabaseName: "sai_pt_b", InstanceURLEnvVar: envInstans},
	)
	for _, nama := range []string{"sai_pt_a", "sai_pt_b"} {
		if _, _, err := openBook(context.Background(), nama, lookup, pembukaPencatat(&dibuka)); err != nil {
			t.Fatalf("%s: %v", nama, err)
		}
	}
	ingin := []string{"sai_pt_a@", "sai_pt_b@" + envInstans}
	if strings.Join(dibuka, ",") != strings.Join(ingin, ",") {
		t.Fatalf("dibuka %v, ingin %v", dibuka, ingin)
	}
}

func TestBukuTakTerdaftarMelemparTanpaMembuka(t *testing.T) {
	var dibuka []string
	_, _, err := openBook(context.Background(), "sai_pt_hantu",
		registryTiruan(registry.Company{ID: 1, DatabaseName: "sai_pt_a"}), pembukaPencatat(&dibuka))
	if err == nil {
		t.Fatal("buku yang tidak terdaftar tidak melempar")
	}
	if len(dibuka) != 0 {
		t.Fatalf("buku dibuka padahal registry tidak mengenalnya: %v", dibuka)
	}
}

func TestNamaKosongMelempar(t *testing.T) {
	var dibuka []string
	if _, _, err := openBook(context.Background(), "", registryTiruan(), pembukaPencatat(&dibuka)); err == nil {
		t.Fatal("-database kosong tidak melempar")
	}
}

func TestInstansTanpaEnvVarTidakJatuhKeBawaan(t *testing.T) {
	// Server bawaan TERSEDIA — justru itu yang berbahaya: ia mungkin masih
	// memegang salinan lama buku yang sama namanya.
	t.Setenv("COMPANY_DATABASE_URL_TEMPLATE", "postgresql://u:p@pg:5432/x")
	t.Setenv(envInstans, "")
	lookup := registryTiruan(registry.Company{ID: 2, DatabaseName: "sai_pt_b", InstanceURLEnvVar: envInstans})

	r, _, err := openBook(context.Background(), "sai_pt_b", lookup, ledgerread.OpenAt)
	if r != nil {
		r.Close()
	}
	if err == nil {
		t.Fatal("instans tanpa env var dibuka — mestinya MELEMPAR")
	}
	if !strings.Contains(err.Error(), envInstans) {
		t.Fatalf("galat tidak menyebut env var instansnya: %v", err)
	}
}

func TestRegistryYangMemulangkanBukuLainDitolak(t *testing.T) {
	var dibuka []string
	salah := func(context.Context, string) (*registry.Company, error) {
		return &registry.Company{ID: 9, DatabaseName: "sai_pt_lain"}, nil
	}
	if _, _, err := openBook(context.Background(), "sai_pt_a", salah, pembukaPencatat(&dibuka)); err == nil {
		t.Fatal("baris registry untuk buku lain diterima")
	}
	if len(dibuka) != 0 {
		t.Fatalf("buku dibuka: %v", dibuka)
	}
}
