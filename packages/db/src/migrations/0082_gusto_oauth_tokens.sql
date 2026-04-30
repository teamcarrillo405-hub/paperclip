CREATE TABLE IF NOT EXISTS gusto_oauth_tokens (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'Bearer',
  gusto_company_uuid TEXT NOT NULL,
  gusto_company_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
