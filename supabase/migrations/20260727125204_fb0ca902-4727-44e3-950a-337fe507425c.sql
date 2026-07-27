CREATE POLICY "Authenticated read imagery objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'imagery');

CREATE POLICY "Authenticated insert imagery objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'imagery');

CREATE POLICY "Authenticated update imagery objects"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'imagery') WITH CHECK (bucket_id = 'imagery');

CREATE POLICY "Authenticated delete imagery objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'imagery');