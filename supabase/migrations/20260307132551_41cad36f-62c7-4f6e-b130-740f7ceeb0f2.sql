-- Add user_id to recipes
ALTER TABLE public.recipes ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to meal_plans
ALTER TABLE public.meal_plans ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to grocery_items
ALTER TABLE public.grocery_items ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop old permissive policies
DROP POLICY IF EXISTS "Allow all access to recipes" ON public.recipes;
DROP POLICY IF EXISTS "Allow all access to meal_plans" ON public.meal_plans;
DROP POLICY IF EXISTS "Allow all access to grocery_items" ON public.grocery_items;

-- Recipes RLS
CREATE POLICY "Users can view own recipes" ON public.recipes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own recipes" ON public.recipes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own recipes" ON public.recipes FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own recipes" ON public.recipes FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Meal plans RLS
CREATE POLICY "Users can view own meal_plans" ON public.meal_plans FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own meal_plans" ON public.meal_plans FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own meal_plans" ON public.meal_plans FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own meal_plans" ON public.meal_plans FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Grocery items RLS
CREATE POLICY "Users can view own grocery_items" ON public.grocery_items FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own grocery_items" ON public.grocery_items FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own grocery_items" ON public.grocery_items FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own grocery_items" ON public.grocery_items FOR DELETE TO authenticated USING (user_id = auth.uid());