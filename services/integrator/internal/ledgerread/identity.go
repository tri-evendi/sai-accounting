package ledgerread

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// CompanySettingName membaca nama perusahaan yang diisi wizard — baris
// `company_settings` PERTAMA menurut id, persis `getCompanyIdentity()`
// (`findFirst({ orderBy: { id: "asc" } })`). "" bila wizard belum dijalankan;
// pemanggil lalu jatuh ke nama registry, urutan yang sama dengan
// `pickIdentity()` di `src/lib/company-identity.ts`.
func (r *Reader) CompanySettingName(ctx context.Context) (string, error) {
	var name string
	err := r.readOnly(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT name FROM company_settings ORDER BY id ASC LIMIT 1`).Scan(&name)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("baca identitas perusahaan %s: %w", r.databaseName, err)
	}
	return name, nil
}
