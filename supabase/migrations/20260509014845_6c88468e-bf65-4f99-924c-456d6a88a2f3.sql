ALTER TABLE public.users REPLICA IDENTITY FULL;
ALTER TABLE public.prizes REPLICA IDENTITY FULL;
ALTER TABLE public.stats REPLICA IDENTITY FULL;
ALTER TABLE public.config REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.prizes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.config;