
CREATE TABLE public.recipes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  title TEXT NOT NULL,
  description TEXT,
  source_url TEXT,
  image_url TEXT,
  servings TEXT,
  prep_time TEXT,
  cook_time TEXT,
  total_time TEXT,
  ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
  instructions JSONB NOT NULL DEFAULT '[]'::jsonb,
  cuisine TEXT,
  complexity TEXT CHECK (complexity IN ('easy', 'medium', 'hard', 'expert')),
  diet TEXT,
  tags TEXT[] DEFAULT '{}',
  rating INTEGER DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  source_domain TEXT
);

-- No RLS needed for single-user app, but enable it with permissive policy
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to recipes" ON public.recipes FOR ALL USING (true) WITH CHECK (true);
