
CREATE TABLE public.users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  credit INTEGER NOT NULL DEFAULT 0,
  online BOOLEAN NOT NULL DEFAULT false,
  last_seen BIGINT NOT NULL DEFAULT 0,
  last_deposit BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL DEFAULT 0,
  password TEXT NOT NULL DEFAULT '123456',
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE public.prizes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount INTEGER NOT NULL,
  date BIGINT NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE public.stats (
  id INTEGER PRIMARY KEY,
  total_in BIGINT NOT NULL DEFAULT 0,
  total_out BIGINT NOT NULL DEFAULT 0
);
INSERT INTO public.stats (id, total_in, total_out) VALUES (1, 0, 0);

CREATE TABLE public.config (
  id INTEGER PRIMARY KEY,
  target_rtp NUMERIC NOT NULL DEFAULT 0.1
);
INSERT INTO public.config (id, target_rtp) VALUES (1, 0.1);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public all users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all prizes" ON public.prizes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all stats" ON public.stats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all config" ON public.config FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.increment_stat(field TEXT, val BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF field = 'total_in' THEN
    UPDATE public.stats SET total_in = total_in + val WHERE id = 1;
  ELSIF field = 'total_out' THEN
    UPDATE public.stats SET total_out = total_out + val WHERE id = 1;
  END IF;
END;
$$;
