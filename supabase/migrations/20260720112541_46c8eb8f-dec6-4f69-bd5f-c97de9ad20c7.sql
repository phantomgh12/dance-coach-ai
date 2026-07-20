
-- Lock down SECURITY DEFINER functions from public/anon execution
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
-- authenticated may keep calling has_role (used by RLS via SECURITY DEFINER anyway; safe either way)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- STORAGE POLICIES: dance-videos bucket
CREATE POLICY "Users read own dance videos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dance-videos' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Users upload own dance videos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dance-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own dance videos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dance-videos' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));

-- STORAGE POLICIES: payment-screenshots bucket
CREATE POLICY "Users read own payment screenshots"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-screenshots' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Users upload own payment screenshots"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
