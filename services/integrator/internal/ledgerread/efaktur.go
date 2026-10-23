package ledgerread

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// EfakturSubmission: satu upaya kirim e-Faktur, seperti ditulis Node
// (`efaktur_submissions`, docs/EFAKTUR.md). DIBACA saja — hasil PJAP kembali ke
// buku lewat pekerjaan `efaktur.record` yang diklaim Node.
type EfakturSubmission struct {
	ID             int64
	InvoiceID      int64
	IdempotencyKey string
	Provider       string
	Status         string
	XML            string
	ProviderRef    string
}

// ErrNoSubmission: baris kiriman tidak ada di buku ini.
var ErrNoSubmission = errors.New("kiriman e-Faktur tidak ada di buku ini")

// EfakturSubmission membaca satu kiriman menurut id-nya.
func (r *Reader) EfakturSubmission(ctx context.Context, id int64) (*EfakturSubmission, error) {
	var s EfakturSubmission
	var ref *string
	err := r.readOnly(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT id, invoice_id, idempotency_key, provider, status, xml, provider_ref
			  FROM efaktur_submissions
			 WHERE id = $1`, id).
			Scan(&s.ID, &s.InvoiceID, &s.IdempotencyKey, &s.Provider, &s.Status, &s.XML, &ref)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("%w (#%d di %s)", ErrNoSubmission, id, r.databaseName)
	}
	if err != nil {
		return nil, fmt.Errorf("baca kiriman e-Faktur #%d di %s: %w", id, r.databaseName, err)
	}
	if ref != nil {
		s.ProviderRef = *ref
	}
	return &s, nil
}

// EfakturSettings: konfigurasi PJAP perusahaan — rahasianya MASIH tersegel.
// Membukanya urusan `internal/efaktur.OpenSecret`, tepat sebelum dipakai.
type EfakturSettings struct {
	Provider         string
	ClientID         string
	SecretCiphertext string
	SecretIV         string
	SecretTag        string
	IsProduction     bool
}

// EfakturSettings membaca baris `company_settings` PERTAMA menurut id — urutan
// yang sama dengan `getCompanySettings()` sisi Node. Buku tanpa baris
// pengaturan = tanpa penyedia (nilai nol), bukan galat.
func (r *Reader) EfakturSettings(ctx context.Context) (*EfakturSettings, error) {
	var s EfakturSettings
	var provider, clientID, ct, iv, tag *string
	err := r.readOnly(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT efaktur_provider, efaktur_client_id, efaktur_secret_ciphertext,
			       efaktur_secret_iv, efaktur_secret_tag, efaktur_is_production
			  FROM company_settings ORDER BY id ASC LIMIT 1`).
			Scan(&provider, &clientID, &ct, &iv, &tag, &s.IsProduction)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return &s, nil
	}
	if err != nil {
		return nil, fmt.Errorf("baca pengaturan e-Faktur %s: %w", r.databaseName, err)
	}
	isi := func(p *string) string {
		if p == nil {
			return ""
		}
		return *p
	}
	s.Provider, s.ClientID = isi(provider), isi(clientID)
	s.SecretCiphertext, s.SecretIV, s.SecretTag = isi(ct), isi(iv), isi(tag)
	return &s, nil
}
