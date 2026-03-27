-- Add welcome_email_sent flag to profiles for duplicate-send guard
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welcome_email_sent boolean NOT NULL DEFAULT false;
