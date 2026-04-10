
-- Create storage bucket for recipe images
INSERT INTO storage.buckets (id, name, public)
VALUES ('recipe-images', 'recipe-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload recipe images
CREATE POLICY "Authenticated users can upload recipe images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'recipe-images');

-- Allow authenticated users to update their own uploads
CREATE POLICY "Users can update own recipe images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'recipe-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to delete their own uploads
CREATE POLICY "Users can delete own recipe images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'recipe-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow public read access to recipe images
CREATE POLICY "Public read access for recipe images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'recipe-images');
