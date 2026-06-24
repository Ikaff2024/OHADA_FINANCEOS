-- Company identification fields used on the financial dossier.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS sigle TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS nif TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS legal_form TEXT;
