ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bank_info text DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS session_token text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_bet numeric DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_won numeric DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_deposited numeric DEFAULT 0;