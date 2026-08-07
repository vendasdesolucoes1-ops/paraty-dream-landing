CREATE POLICY "Autenticados enviam midia de disparo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'disparos-midia');

CREATE POLICY "Autenticados leem midia de disparo"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'disparos-midia');

CREATE POLICY "Autenticados removem midia de disparo"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'disparos-midia');