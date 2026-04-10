import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

// Check for non-Latin scripts (CJK, Arabic, Cyrillic, etc.) — allows common punctuation like °, –, ', "
const NON_ENGLISH_REGEX = /[\u0400-\u04FF\u0600-\u06FF\u3000-\u9FFF\uAC00-\uD7AF]/;

async function invokeExtractRecipe(url: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-recipe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ url }),
  });
  const data = await response.json();
  return { status: response.status, data };
}

function assertEnglishText(text: string, fieldName: string) {
  assert(
    !NON_ENGLISH_REGEX.test(text),
    `${fieldName} contains non-English characters: "${text}"`
  );
}

function assertCapitalizedTag(tag: string) {
  const words = tag.split(" ");
  for (const word of words) {
    assert(
      word.charAt(0) === word.charAt(0).toUpperCase(),
      `Tag word "${word}" in "${tag}" should start with a capital letter`
    );
  }
}

Deno.test("extract-recipe: English recipe imports with all required data", async () => {
  const { status, data } = await invokeExtractRecipe(
    "https://www.seriouseats.com/all-american-beef-stew-recipe"
  );

  assertEquals(status, 200, `Expected 200 but got ${status}: ${JSON.stringify(data)}`);
  assert(data.success, "Response should indicate success");
  assertExists(data.recipe, "Recipe should exist in response");

  const recipe = data.recipe;

  // Title
  assertExists(recipe.title, "Recipe must have a title");
  assert(recipe.title.length > 0, "Title must not be empty");
  assertEnglishText(recipe.title, "title");

  // Description
  if (recipe.description) {
    assertEnglishText(recipe.description, "description");
  }

  // Image URL is present and well-formed
  assertExists(recipe.image_url, "Recipe must have an image_url");
  assert(recipe.image_url.startsWith("http"), "Image URL must be a valid HTTP URL");
  assert(
    /\.(jpg|jpeg|png|webp|gif)/i.test(recipe.image_url) || recipe.image_url.includes("image"),
    "Image URL should point to an image resource"
  );

  // Total time only
  assertExists(recipe.total_time, "Recipe must have total_time");
  assert(recipe.total_time.length > 0, "total_time must not be empty");
  assertEquals(recipe.prep_time, null, "prep_time should be null (only total_time allowed)");
  assertEquals(recipe.cook_time, null, "cook_time should be null (only total_time allowed)");

  // Ingredients validation
  assert(Array.isArray(recipe.ingredients), "Ingredients must be an array");
  assert(recipe.ingredients.length >= 2, "Recipe should have at least 2 ingredients");

  for (const ing of recipe.ingredients) {
    assertExists(ing.name, "Each ingredient must have a name");
    assert(ing.name.length > 0, "Ingredient name must not be empty");
    assertEnglishText(ing.name, `ingredient name "${ing.name}"`);

    if (ing.quantity) {
      const num = parseFloat(ing.quantity);
      assert(!isNaN(num), `Ingredient quantity "${ing.quantity}" for "${ing.name}" must be numeric`);
      assert(num > 0, `Ingredient quantity for "${ing.name}" must be positive, got ${num}`);
      assert(num <= 10000, `Ingredient quantity for "${ing.name}" seems unrealistic: ${num}`);
    }

    if (ing.notes) {
      assertEnglishText(ing.notes, `ingredient notes for "${ing.name}"`);
    }
  }

  // Instructions validation
  assert(Array.isArray(recipe.instructions), "Instructions must be an array");
  assert(recipe.instructions.length >= 1, "Recipe should have at least 1 instruction");

  for (const inst of recipe.instructions) {
    assertExists(inst.text, "Each instruction must have text");
    assert(inst.text.length > 5, "Instruction text should be meaningful");
    assertEnglishText(inst.text, `instruction step ${inst.step}`);
  }

  // Cuisine
  assert(Array.isArray(recipe.cuisine), "Cuisine must be an array");
  assert(recipe.cuisine.length >= 1, "Recipe must have at least one cuisine");
  for (const c of recipe.cuisine) {
    assertEnglishText(c, "cuisine");
  }

  // Complexity
  assertExists(recipe.complexity, "Recipe must have complexity");
  assert(
    ["easy", "medium", "hard", "expert"].includes(recipe.complexity),
    `Complexity must be one of easy/medium/hard/expert, got "${recipe.complexity}"`
  );

  // Diet
  assertExists(recipe.diet, "Recipe must have diet classification");
  assert(
    ["meat", "seafood", "vegetarian", "vegan"].includes(recipe.diet),
    `Diet must be one of meat/seafood/vegetarian/vegan, got "${recipe.diet}"`
  );

  // Tags validation
  assert(Array.isArray(recipe.tags), "Tags must be an array");
  for (const tag of recipe.tags) {
    assertCapitalizedTag(tag);
    assertEnglishText(tag, `tag "${tag}"`);
  }
  // No duplicates
  const uniqueTags = new Set(recipe.tags.map((t: string) => t.toLowerCase()));
  assertEquals(uniqueTags.size, recipe.tags.length, "Tags should not have duplicates");

  console.log("✅ All acceptance checks passed for:", recipe.title);
});
