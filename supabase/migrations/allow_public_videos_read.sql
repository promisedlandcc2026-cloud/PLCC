-- Allow public read access to the videos table
-- This allows the awc-connect app to fetch the sermon video without authentication

DROP POLICY IF EXISTS "Allow public read access to videos" ON "public"."videos";
CREATE POLICY "Allow public read access to videos"
ON "public"."videos"
FOR SELECT
TO anon
USING (true);
