import { supabase } from "@/integrations/supabase/client";

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[^\w\s']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // Check if one contains the other
  if (a.includes(b) || b.includes(a)) return 0.9;

  // Simple word overlap (Jaccard similarity)
  const wordsA = new Set(a.split(" "));
  const wordsB = new Set(b.split(" "));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

/**
 * Check if a recipe with a similar title already exists.
 * Returns the matching recipe title, or null if no duplicate found.
 * Optionally excludes a recipe by ID (for edits).
 */
export async function findDuplicateRecipe(
  title: string,
  userId: string,
  excludeId?: string
): Promise<string | null> {
  if (!title.trim()) return null;

  const normalizedTitle = normalize(title);

  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, title")
    .eq("user_id", userId);

  if (!recipes || recipes.length === 0) return null;

  for (const recipe of recipes) {
    if (excludeId && recipe.id === excludeId) continue;
    const normalizedExisting = normalize(recipe.title);
    if (similarity(normalizedTitle, normalizedExisting) >= 0.75) {
      return recipe.title;
    }
  }

  return null;
}
