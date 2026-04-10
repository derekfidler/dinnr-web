ALTER TABLE public.recipes
  ALTER COLUMN cuisine TYPE text[]
  USING CASE
    WHEN cuisine IS NULL THEN NULL
    ELSE ARRAY[cuisine]
  END;