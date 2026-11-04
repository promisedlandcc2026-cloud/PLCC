-- Short church news on the Vault home page.
-- Pastor, Ministry Leader, and Super Admin post through the Vault API.

CREATE TABLE IF NOT EXISTS public.vault_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  kind text NOT NULL DEFAULT 'church' CHECK (kind IN ('church', 'database', 'celebration', 'sympathy')),
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  author_name text,
  author_role text
);

ALTER TABLE public.vault_news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in members can read vault news" ON public.vault_news;
CREATE POLICY "Signed-in members can read vault news"
  ON public.vault_news
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.vault_news IS
  'Home-page Vault News. Writes go through the Vault API for Pastor, Ministry Leader, and Super Admin.';
