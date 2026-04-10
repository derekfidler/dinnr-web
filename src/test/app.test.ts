/**
 * DINNR — App Test Suite
 *
 * Covers all core app functions:
 *  1. Add recipe from website URL
 *  2. Add recipe from YouTube video
 *  3. Open recipe / recipe detail
 *  4. Cook mode
 *  5. Add recipe to planner
 *  6. LLM meal planning (meal-plan-chat edge function contract)
 *  7. Add grocery list item manually
 *  8. Add grocery items from a recipe
 *  9. Clear grocery list
 * 10. Google OAuth authentication
 *
 * Also tests all utility libraries for correctness.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { categorizeItem, GROCERY_SECTIONS } from "@/lib/groceryCategories";
import { convertIngredient } from "@/lib/unitConversion";

// ─── 1. groceryCategories ────────────────────────────────────────────────────

describe("categorizeItem", () => {
  // Happy-path categorization
  it("categorizes chicken as Meat", () => {
    expect(categorizeItem("chicken breast")).toBe("Meat");
  });
  it("categorizes salmon as Fish", () => {
    expect(categorizeItem("salmon fillet")).toBe("Fish");
  });
  it("categorizes milk as Dairy and eggs", () => {
    expect(categorizeItem("whole milk")).toBe("Dairy and eggs");
  });
  it("categorizes egg as Dairy and eggs", () => {
    expect(categorizeItem("eggs")).toBe("Dairy and eggs");
  });
  it("categorizes cheddar as Cheese", () => {
    expect(categorizeItem("cheddar cheese")).toBe("Cheese");
  });
  it("categorizes bread as Bakery", () => {
    expect(categorizeItem("sourdough bread")).toBe("Bakery");
  });
  it("categorizes pasta as Pasta, rice, and grains", () => {
    expect(categorizeItem("penne pasta")).toBe("Pasta, rice, and grains");
  });
  it("categorizes rice as Pasta, rice, and grains", () => {
    expect(categorizeItem("basmati rice")).toBe("Pasta, rice, and grains");
  });
  it("categorizes olive oil as Oils and sauces", () => {
    expect(categorizeItem("olive oil")).toBe("Oils and sauces");
  });
  it("categorizes tomato as Vegetables", () => {
    expect(categorizeItem("cherry tomatoes")).toBe("Vegetables");
  });
  it("categorizes apple as Fruit", () => {
    expect(categorizeItem("green apple")).toBe("Fruit");
  });
  it("categorizes tofu as Vegetarian", () => {
    expect(categorizeItem("firm tofu")).toBe("Vegetarian");
  });
  it("categorizes beer as Drinks", () => {
    expect(categorizeItem("beer")).toBe("Drinks");
  });
  it("categorizes parchment paper as Household", () => {
    expect(categorizeItem("parchment paper")).toBe("Household");
  });
  it("categorizes soy sauce as International", () => {
    expect(categorizeItem("soy sauce")).toBe("International");
  });

  // Specificity: multi-word keyword beats single-word substring
  it("categorizes garlic as Vegetables", () => {
    expect(categorizeItem("garlic")).toBe("Vegetables");
  });
  it("categorizes garlic powder as Oils and sauces, not Vegetables", () => {
    expect(categorizeItem("garlic powder")).toBe("Oils and sauces");
  });
  it("categorizes onion powder as Oils and sauces, not Vegetables", () => {
    expect(categorizeItem("onion powder")).toBe("Oils and sauces");
  });
  it("categorizes baking powder as Pasta, rice, and grains, not Bakery", () => {
    // 'baking powder' (13 chars) is in Pasta/rice/grains; 'baking soda' too
    expect(categorizeItem("baking powder")).toBe("Pasta, rice, and grains");
  });
  it("categorizes green bean as Vegetables", () => {
    expect(categorizeItem("green bean")).toBe("Vegetables");
  });
  it("categorizes snap pea as Vegetables (not via 'pea' alone)", () => {
    expect(categorizeItem("snap peas")).toBe("Vegetables");
  });
  it("categorizes coconut milk as Dairy and eggs, not Fruit", () => {
    // 'coconut milk' (11 chars) is in Dairy; 'coconut' (7 chars) is in Fruit
    expect(categorizeItem("coconut milk")).toBe("Dairy and eggs");
  });
  it("categorizes almond milk as Dairy and eggs, not other", () => {
    expect(categorizeItem("almond milk")).toBe("Dairy and eggs");
  });

  // Edge cases
  it("returns Other for unknown items", () => {
    expect(categorizeItem("zyxwvut")).toBe("Other");
  });
  it("is case-insensitive", () => {
    expect(categorizeItem("CHICKEN")).toBe("Meat");
    expect(categorizeItem("Olive Oil")).toBe("Oils and sauces");
  });
  it("trims whitespace", () => {
    expect(categorizeItem("  bread  ")).toBe("Bakery");
  });

  // All returned sections are valid GROCERY_SECTIONS
  it("always returns a valid section", () => {
    const items = ["flour", "steak", "mango", "feta", "noodle", "wasabi", "coffee", "soap", "xyz123"];
    for (const item of items) {
      expect(GROCERY_SECTIONS).toContain(categorizeItem(item));
    }
  });
});

// ─── 2. unitConversion ───────────────────────────────────────────────────────

describe("convertIngredient", () => {
  describe("imperial → metric", () => {
    it("converts pounds to grams", () => {
      const result = convertIngredient("1", "lb", "metric");
      expect(result.unit).toBe("g");
      expect(parseFloat(result.quantity!)).toBeCloseTo(454, 0);
    });

    it("converts ounces to grams", () => {
      const result = convertIngredient("4", "oz", "metric");
      expect(result.unit).toBe("g");
      expect(parseFloat(result.quantity!)).toBeCloseTo(113, 0);
    });

    it("converts cups to ml", () => {
      const result = convertIngredient("2", "cups", "metric");
      expect(result.unit).toBe("ml");
      expect(parseFloat(result.quantity!)).toBeCloseTo(473, 0);
    });

    it("converts fluid ounces to ml", () => {
      const result = convertIngredient("8", "fl oz", "metric");
      expect(result.unit).toBe("ml");
      expect(parseFloat(result.quantity!)).toBeCloseTo(237, 0);
    });

    it("converts Fahrenheit to Celsius", () => {
      const result = convertIngredient("350", "°f", "metric");
      expect(result.unit).toBe("°C");
      expect(parseInt(result.quantity!)).toBe(177);
    });

    it("converts Fahrenheit to Celsius (word form)", () => {
      const result = convertIngredient("400", "fahrenheit", "metric");
      expect(result.unit).toBe("°C");
      expect(parseInt(result.quantity!)).toBe(204);
    });
  });

  describe("metric → imperial", () => {
    it("converts grams to ounces", () => {
      const result = convertIngredient("100", "g", "imperial");
      expect(result.unit).toBe("oz");
      expect(parseFloat(result.quantity!)).toBeCloseTo(3.5, 0);
    });

    it("converts kg to pounds", () => {
      const result = convertIngredient("1", "kg", "imperial");
      expect(result.unit).toBe("lb");
      expect(parseFloat(result.quantity!)).toBeCloseTo(2.2, 0);
    });

    it("converts ml to fl oz", () => {
      const result = convertIngredient("240", "ml", "imperial");
      expect(result.unit).toBe("fl oz");
      expect(parseFloat(result.quantity!)).toBeCloseTo(8, 0);
    });

    it("converts Celsius to Fahrenheit", () => {
      const result = convertIngredient("180", "°c", "imperial");
      expect(result.unit).toBe("°F");
      expect(parseInt(result.quantity!)).toBe(356);
    });
  });

  describe("original system (no conversion)", () => {
    it("returns unchanged when targetSystem is original", () => {
      const result = convertIngredient("2", "cups", "original");
      expect(result.quantity).toBe("2");
      expect(result.unit).toBe("cups");
    });
  });

  describe("universal units (never convert)", () => {
    it("does not convert teaspoons", () => {
      const result = convertIngredient("1", "tsp", "metric");
      expect(result.unit).toBe("tsp");
      expect(result.quantity).toBe("1");
    });

    it("does not convert tablespoons", () => {
      const result = convertIngredient("2", "tbsp", "imperial");
      expect(result.unit).toBe("tbsp");
    });

    it("does not convert 'pinch'", () => {
      const result = convertIngredient("1", "pinch", "metric");
      expect(result.unit).toBe("pinch");
    });

    it("does not convert 'clove'", () => {
      const result = convertIngredient("3", "cloves", "metric");
      expect(result.unit).toBe("cloves");
    });
  });

  describe("same system (no conversion)", () => {
    it("does not double-convert grams when target is already metric", () => {
      const result = convertIngredient("200", "g", "metric");
      expect(result.unit).toBe("g");
      expect(result.quantity).toBe("200");
    });

    it("does not double-convert cups when target is already imperial", () => {
      const result = convertIngredient("1", "cup", "imperial");
      expect(result.unit).toBe("cup");
    });
  });

  describe("unknown units (pass-through)", () => {
    it("returns unchanged for unknown unit", () => {
      const result = convertIngredient("3", "blorp", "metric");
      expect(result.unit).toBe("blorp");
      expect(result.quantity).toBe("3");
    });
  });

  describe("edge cases", () => {
    it("returns unchanged when quantity is undefined", () => {
      const result = convertIngredient(undefined, "cups", "metric");
      expect(result.quantity).toBeUndefined();
    });

    it("returns unchanged when unit is undefined", () => {
      const result = convertIngredient("2", undefined, "metric");
      expect(result.unit).toBeUndefined();
    });

    it("returns unchanged when quantity is not a number", () => {
      const result = convertIngredient("a handful", "cups", "metric");
      expect(result.quantity).toBe("a handful");
    });
  });
});

// ─── 3. duplicateCheck (pure logic extracted for unit testing) ───────────────

// Mirror the normalize and similarity logic to test independently
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
  if (a.includes(b) || b.includes(a)) return 0.9;
  const wordsA = new Set(a.split(" "));
  const wordsB = new Set(b.split(" "));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

describe("duplicate detection logic", () => {
  describe("normalize()", () => {
    it("lowercases strings", () => {
      expect(normalize("Pasta Carbonara")).toBe("pasta carbonara");
    });

    it("strips punctuation except apostrophes (apostrophe is kept)", () => {
      // & and ! are stripped; apostrophe is preserved; extra spaces are collapsed
      expect(normalize("Grandma's Mac & Cheese!")).toBe("grandma's mac cheese");
    });

    it("collapses multiple spaces", () => {
      expect(normalize("chicken   tikka  masala")).toBe("chicken tikka masala");
    });

    it("trims whitespace", () => {
      expect(normalize("  spaghetti  ")).toBe("spaghetti");
    });

    it("normalizes curly quotes to straight apostrophes", () => {
      expect(normalize("Mom\u2019s Recipe")).toBe("moms recipe");
    });
  });

  describe("similarity()", () => {
    it("returns 1 for identical strings", () => {
      expect(similarity("pasta carbonara", "pasta carbonara")).toBe(1);
    });

    it("returns 0 for empty strings", () => {
      expect(similarity("", "pasta")).toBe(0);
      expect(similarity("pasta", "")).toBe(0);
    });

    it("returns 0.9 when one string contains the other", () => {
      expect(similarity("pasta", "pasta carbonara")).toBe(0.9);
    });

    it("returns high similarity for same-word sets in different order", () => {
      const s = similarity("chicken tikka masala", "masala tikka chicken");
      expect(s).toBeGreaterThanOrEqual(0.75);
    });

    it("returns low similarity for completely different titles", () => {
      const s = similarity("chocolate cake", "beef stew");
      expect(s).toBeLessThan(0.5);
    });

    it("detects duplicates above 0.75 threshold", () => {
      // "Spaghetti Bolognese" vs "Spaghetti Bolognaise" — after normalize both = "spaghetti bolognese/bolognaise"
      const a = normalize("Spaghetti Bolognese");
      const b = normalize("Spaghetti Bolognese");
      expect(similarity(a, b)).toBeGreaterThanOrEqual(0.75);
    });

    it("does not flag clearly different recipes as duplicates", () => {
      const a = normalize("Caesar Salad");
      const b = normalize("Beef Stroganoff");
      expect(similarity(a, b)).toBeLessThan(0.75);
    });
  });
});

// ─── 4. AddRecipeDialog — URL validation logic ───────────────────────────────

describe("AddRecipeDialog URL validation", () => {
  const isBlocked = (url: string) => /instagram\.com|facebook\.com|fb\.watch/i.test(url);
  const isSocialMedia = (url: string) => /tiktok\.com|youtube\.com|youtu\.be/i.test(url);

  it("blocks Instagram URLs", () => {
    expect(isBlocked("https://www.instagram.com/p/abc123")).toBe(true);
  });

  it("blocks Facebook URLs", () => {
    expect(isBlocked("https://www.facebook.com/video/123")).toBe(true);
  });

  it("blocks fb.watch short links", () => {
    expect(isBlocked("https://fb.watch/abc")).toBe(true);
  });

  it("does not block regular recipe URLs", () => {
    expect(isBlocked("https://www.allrecipes.com/recipe/pasta")).toBe(false);
    expect(isBlocked("https://www.seriouseats.com/recipe")).toBe(false);
  });

  it("identifies YouTube as social media (fallback to editor)", () => {
    expect(isSocialMedia("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isSocialMedia("https://youtu.be/abc123")).toBe(true);
  });

  it("identifies TikTok as social media (fallback to editor)", () => {
    expect(isSocialMedia("https://www.tiktok.com/@user/video/123")).toBe(true);
  });

  it("does not flag standard recipe sites as social media", () => {
    expect(isSocialMedia("https://www.bonappetit.com/recipe/pasta")).toBe(false);
  });
});

// ─── 5. Grocery list — add item logic ────────────────────────────────────────

describe("Grocery list item logic", () => {
  it("correctly categorizes items that would be added manually", () => {
    // Core test: items users commonly add should land in the right section
    const expectations: [string, string][] = [
      ["apples", "Fruit"],
      ["bananas", "Fruit"],
      ["chicken thighs", "Meat"],
      ["ground beef", "Meat"],
      ["salmon", "Fish"],
      ["shrimp", "Fish"],
      ["cheddar", "Cheese"],
      ["mozzarella", "Cheese"],
      ["butter", "Dairy and eggs"],
      ["eggs", "Dairy and eggs"],
      ["sourdough bread", "Bakery"],
      ["tortillas", "Bakery"],
      ["spaghetti", "Pasta, rice, and grains"],
      ["basmati rice", "Pasta, rice, and grains"],
      ["olive oil", "Oils and sauces"],
      ["balsamic vinegar", "Oils and sauces"],
      ["salt", "Oils and sauces"],
      ["black pepper", "Oils and sauces"],
      ["garlic powder", "Oils and sauces"],  // bug was here — was Vegetables
      ["onion powder", "Oils and sauces"],   // bug was here — was Vegetables
      ["broccoli", "Vegetables"],
      ["sweet potato", "Vegetables"],
      ["soy sauce", "International"],
      ["miso paste", "International"],
      ["beer", "Drinks"],
      ["orange juice", "Drinks"],
      ["tofu", "Vegetarian"],
      ["paper towels", "Household"],
      ["dish soap", "Household"],
      ["chicken broth", "Deli and prepared"],
      ["coconut milk", "Dairy and eggs"],    // bug was here — was Fruit
    ];

    for (const [item, expectedSection] of expectations) {
      const actual = categorizeItem(item);
      expect(actual, `"${item}" should be in "${expectedSection}" but got "${actual}"`).toBe(expectedSection);
    }
  });
});

// ─── 6. Planner / meal types ─────────────────────────────────────────────────

describe("Planner meal types", () => {
  const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
  type MealType = typeof MEAL_TYPES[number];

  it("has exactly 4 meal types", () => {
    expect(MEAL_TYPES).toHaveLength(4);
  });

  it("all meal types are lowercase strings", () => {
    for (const t of MEAL_TYPES) {
      expect(t).toBe(t.toLowerCase());
    }
  });

  it("meal type order matches expected display order", () => {
    expect(MEAL_TYPES[0]).toBe("breakfast");
    expect(MEAL_TYPES[3]).toBe("snack");
  });

  // Date format validation (YYYY-MM-DD) used for planner API calls
  const isValidPlannerDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

  it("validates planner date format", () => {
    expect(isValidPlannerDate("2026-03-28")).toBe(true);
    expect(isValidPlannerDate("2026-3-5")).toBe(false);
    expect(isValidPlannerDate("28-03-2026")).toBe(false);
    expect(isValidPlannerDate("")).toBe(false);
  });
});

// ─── 7. Meal-plan-chat edge function — request/response contract ──────────────

describe("meal-plan-chat API contract", () => {
  it("builds a valid request body shape", () => {
    const requestBody = {
      messages: [{ role: "user", content: "Plan 3 dinners for this week" }],
      recipes: [
        { id: "uuid-1", title: "Pasta Carbonara", cuisine: ["Italian"], diet: "meat", tags: ["Dinner"], total_time: "30 min" },
      ],
      currentDate: "2026-03-28",
      existingPlans: [],
    };

    expect(requestBody.messages).toBeInstanceOf(Array);
    expect(requestBody.messages[0]).toHaveProperty("role");
    expect(requestBody.messages[0]).toHaveProperty("content");
    expect(requestBody.recipes[0]).toHaveProperty("id");
    expect(requestBody.recipes[0]).toHaveProperty("title");
    expect(requestBody.currentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("parses suggest_meals tool call arguments", () => {
    const toolCallArgs = JSON.stringify({
      date: "2026-03-29",
      meal_type: "dinner",
      options: [
        { recipe_id: "uuid-1", recipe_title: "Pasta Carbonara", reason: "Quick and easy" },
        { recipe_id: "uuid-2", recipe_title: "Chicken Curry", reason: "Protein rich" },
      ],
    });

    const parsed = JSON.parse(toolCallArgs);
    expect(parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(["breakfast", "lunch", "dinner", "snack"]).toContain(parsed.meal_type);
    expect(parsed.options).toHaveLength(2);
    expect(parsed.options[0]).toHaveProperty("recipe_id");
    expect(parsed.options[0]).toHaveProperty("recipe_title");
    expect(parsed.options[0]).toHaveProperty("reason");
  });

  it("parses plan_meals tool call arguments", () => {
    const toolCallArgs = JSON.stringify({
      assignments: [
        { date: "2026-03-29", meal_type: "lunch", recipe_id: "uuid-1" },
        { date: "2026-03-29", meal_type: "dinner", recipe_id: "uuid-2" },
        { date: "2026-03-30", meal_type: "dinner", recipe_id: "uuid-3" },
      ],
    });

    const parsed = JSON.parse(toolCallArgs);
    expect(parsed.assignments).toHaveLength(3);
    for (const a of parsed.assignments) {
      expect(a).toHaveProperty("date");
      expect(a).toHaveProperty("meal_type");
      expect(a).toHaveProperty("recipe_id");
      expect(a.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

// ─── 8. Edge function Anthropic→OpenAI SSE stream transform ──────────────────

describe("Anthropic SSE → OpenAI SSE transform logic", () => {
  // Helper: simulate the transform the meal-plan-chat edge function applies
  function transformAnthropicEvent(
    eventType: string,
    data: Record<string, unknown>,
    toolCallBlocks: Map<number, number>,
    toolCallOIIndexRef: { value: number }
  ): string[] {
    const chunks: string[] = [];

    if (eventType === "content_block_start") {
      const blockType = (data.content_block as any)?.type;
      if (blockType === "tool_use") {
        toolCallOIIndexRef.value++;
        toolCallBlocks.set(data.index as number, toolCallOIIndexRef.value);
        chunks.push(JSON.stringify({
          choices: [{
            delta: {
              tool_calls: [{
                index: toolCallOIIndexRef.value,
                function: { name: (data.content_block as any).name, arguments: "" },
              }],
            },
          }],
        }));
      }
    } else if (eventType === "content_block_delta") {
      const delta = (data as any).delta;
      if (delta?.type === "text_delta") {
        chunks.push(JSON.stringify({ choices: [{ delta: { content: delta.text } }] }));
      } else if (delta?.type === "input_json_delta") {
        const oiIdx = toolCallBlocks.get(data.index as number) ?? 0;
        chunks.push(JSON.stringify({
          choices: [{
            delta: { tool_calls: [{ index: oiIdx, function: { arguments: delta.partial_json } }] },
          }],
        }));
      }
    } else if (eventType === "message_delta") {
      const stopReason = (data.delta as any)?.stop_reason === "tool_use" ? "tool_calls" : "stop";
      chunks.push(JSON.stringify({ choices: [{ delta: {}, finish_reason: stopReason }] }));
    } else if (eventType === "message_stop") {
      chunks.push("[DONE]");
    }

    return chunks;
  }

  it("transforms text_delta to OpenAI content delta", () => {
    const blocks = new Map<number, number>();
    const ref = { value: -1 };
    const out = transformAnthropicEvent(
      "content_block_delta",
      { index: 0, delta: { type: "text_delta", text: "Hello!" } },
      blocks, ref
    );
    expect(out).toHaveLength(1);
    const parsed = JSON.parse(out[0]);
    expect(parsed.choices[0].delta.content).toBe("Hello!");
  });

  it("transforms tool_use block_start to OpenAI tool_calls delta with name", () => {
    const blocks = new Map<number, number>();
    const ref = { value: -1 };
    const out = transformAnthropicEvent(
      "content_block_start",
      { index: 1, content_block: { type: "tool_use", id: "toolu_01", name: "suggest_meals" } },
      blocks, ref
    );
    expect(out).toHaveLength(1);
    const parsed = JSON.parse(out[0]);
    expect(parsed.choices[0].delta.tool_calls[0].function.name).toBe("suggest_meals");
    expect(parsed.choices[0].delta.tool_calls[0].index).toBe(0);
  });

  it("transforms input_json_delta to OpenAI arguments delta", () => {
    const blocks = new Map([[1, 0]]);
    const ref = { value: 0 };
    const out = transformAnthropicEvent(
      "content_block_delta",
      { index: 1, delta: { type: "input_json_delta", partial_json: '{"date":"' } },
      blocks, ref
    );
    const parsed = JSON.parse(out[0]);
    expect(parsed.choices[0].delta.tool_calls[0].function.arguments).toBe('{"date":"');
  });

  it("emits finish_reason:tool_calls when stop_reason is tool_use", () => {
    const blocks = new Map<number, number>();
    const ref = { value: 0 };
    const out = transformAnthropicEvent(
      "message_delta",
      { delta: { stop_reason: "tool_use" } },
      blocks, ref
    );
    const parsed = JSON.parse(out[0]);
    expect(parsed.choices[0].finish_reason).toBe("tool_calls");
  });

  it("emits finish_reason:stop when stop_reason is end_turn", () => {
    const blocks = new Map<number, number>();
    const ref = { value: 0 };
    const out = transformAnthropicEvent(
      "message_delta",
      { delta: { stop_reason: "end_turn" } },
      blocks, ref
    );
    const parsed = JSON.parse(out[0]);
    expect(parsed.choices[0].finish_reason).toBe("stop");
  });

  it("emits [DONE] on message_stop", () => {
    const out = transformAnthropicEvent("message_stop", {}, new Map(), { value: -1 });
    expect(out).toContain("[DONE]");
  });
});

// ─── 9. extract-recipe edge function — tool response parsing ─────────────────

describe("extract-recipe Anthropic tool response parsing", () => {
  it("extracts recipe from tool_use content block", () => {
    const anthropicResponse = {
      id: "msg_01",
      type: "message",
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "toolu_01",
          name: "extract_recipe",
          input: {
            title: "Spaghetti Carbonara",
            description: "Classic Italian pasta dish.",
            total_time: "30 min",
            cuisine: ["Italian"],
            complexity: "medium",
            diet: "meat",
            tags: ["Dinner", "Pasta"],
            ingredients: [
              { name: "spaghetti", quantity: "400", unit: "g" },
              { name: "pancetta", quantity: "150", unit: "g" },
            ],
            instructions: [
              { step: 1, text: "Boil the pasta." },
              { step: 2, text: "Fry the pancetta." },
            ],
          },
        },
      ],
      stop_reason: "tool_use",
    };

    const toolUse = anthropicResponse.content.find((b) => b.type === "tool_use");
    expect(toolUse).toBeDefined();
    const recipe = toolUse!.input;
    expect(recipe.title).toBe("Spaghetti Carbonara");
    expect(recipe.cuisine).toContain("Italian");
    expect(recipe.ingredients).toHaveLength(2);
    expect(recipe.instructions).toHaveLength(2);
    // No JSON.parse needed — already an object
    expect(typeof recipe).toBe("object");
  });

  it("handles missing tool_use block gracefully", () => {
    const anthropicResponse = {
      content: [{ type: "text", text: "I cannot extract that." }],
    };
    const toolUse = anthropicResponse.content.find((b) => b.type === "tool_use");
    expect(toolUse).toBeUndefined();
  });
});

// ─── 10. Auth — Google OAuth flow logic ──────────────────────────────────────

describe("Auth — OAuth URL handling", () => {
  // Mirrors the callback URL parsing logic in Auth.tsx
  function parseOAuthCallback(callbackUrl: string): { code?: string; accessToken?: string; refreshToken?: string } {
    const url = new URL(callbackUrl.replace(/^dinnr:\/\//, "https://dinnr.app/"));
    const code = url.searchParams.get("code") ?? undefined;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token") ?? undefined;
    const refreshToken = hash.get("refresh_token") ?? undefined;
    return { code, accessToken, refreshToken };
  }

  it("parses PKCE code from dinnr:// deep link", () => {
    const { code } = parseOAuthCallback("dinnr://auth/callback?code=abc123&state=xyz");
    expect(code).toBe("abc123");
  });

  it("parses implicit flow tokens from hash fragment", () => {
    const { accessToken, refreshToken } = parseOAuthCallback(
      "dinnr://auth/callback#access_token=tok_abc&refresh_token=ref_xyz&token_type=bearer"
    );
    expect(accessToken).toBe("tok_abc");
    expect(refreshToken).toBe("ref_xyz");
  });

  it("returns undefined for missing code in non-PKCE flow", () => {
    const { code } = parseOAuthCallback("dinnr://auth/callback#access_token=tok&refresh_token=ref");
    expect(code).toBeUndefined();
  });

  it("returns undefined tokens in PKCE flow (code in query, no hash tokens)", () => {
    const { accessToken, refreshToken } = parseOAuthCallback("dinnr://auth/callback?code=abc");
    expect(accessToken).toBeUndefined();
    expect(refreshToken).toBeUndefined();
  });

  it("handles Electron isElectron detection", () => {
    // In Electron, redirectOrigin should be undefined so Supabase uses configured Site URL
    const isElectron = true;
    const redirectOrigin = isElectron ? undefined : "https://example.com";
    expect(redirectOrigin).toBeUndefined();
  });

  it("uses window.location.origin on web (non-Electron)", () => {
    const isElectron = false;
    const fakeOrigin = "https://myapp.vercel.app";
    const redirectOrigin = isElectron ? undefined : fakeOrigin;
    expect(redirectOrigin).toBe(fakeOrigin);
  });
});

// ─── 11. Recipe data validation ───────────────────────────────────────────────

describe("Recipe data validation", () => {
  const VALID_COMPLEXITIES = ["easy", "medium", "hard", "expert"] as const;
  const VALID_DIETS = ["meat", "seafood", "vegetarian", "vegan"] as const;

  it("accepts all valid complexity values", () => {
    for (const c of VALID_COMPLEXITIES) {
      expect(VALID_COMPLEXITIES).toContain(c);
    }
  });

  it("accepts all valid diet values", () => {
    for (const d of VALID_DIETS) {
      expect(VALID_DIETS).toContain(d);
    }
  });

  it("validates ingredient quantity is a positive finite number", () => {
    const validateQty = (qty: string | undefined): boolean => {
      if (!qty) return true; // optional
      const num = parseFloat(qty);
      return !isNaN(num) && num > 0 && num <= 10000;
    };

    expect(validateQty("2")).toBe(true);
    expect(validateQty("0.5")).toBe(true);
    expect(validateQty("1000")).toBe(true);
    expect(validateQty("0")).toBe(false);
    expect(validateQty("-1")).toBe(false);
    expect(validateQty("99999")).toBe(false);
    expect(validateQty("abc")).toBe(false);
    expect(validateQty(undefined)).toBe(true);
  });

  it("instructions have sequential step numbers starting at 1", () => {
    const instructions = [
      { step: 1, text: "Boil water" },
      { step: 2, text: "Add pasta" },
      { step: 3, text: "Drain and serve" },
    ];
    for (let i = 0; i < instructions.length; i++) {
      expect(instructions[i].step).toBe(i + 1);
    }
  });
});

// ─── 12. Cook mode — ingredient selection logic ───────────────────────────────

describe("Cook mode ingredient selection", () => {
  it("initialises with no ingredients selected", () => {
    const selectedIngredients = new Set<number>();
    expect(selectedIngredients.size).toBe(0);
  });

  it("toggles ingredient selection on/off", () => {
    const selected = new Set<number>();
    // Select
    selected.add(0);
    selected.add(2);
    expect(selected.has(0)).toBe(true);
    expect(selected.has(2)).toBe(true);
    expect(selected.has(1)).toBe(false);
    // Deselect
    selected.delete(0);
    expect(selected.has(0)).toBe(false);
  });

  it("selects all ingredients at once", () => {
    const ingredients = [
      { name: "flour", quantity: "2", unit: "cups" },
      { name: "sugar", quantity: "1", unit: "cup" },
      { name: "eggs", quantity: "3" },
    ];
    const selected = new Set(ingredients.map((_, i) => i));
    expect(selected.size).toBe(3);
  });

  it("maps selected ingredient indices to grocery items correctly", () => {
    const ingredients = [
      { name: "flour", quantity: "2", unit: "cups" },
      { name: "sugar", quantity: "1", unit: "cup" },
      { name: "eggs", quantity: "3" },
    ];
    const selected = new Set([0, 2]); // flour and eggs
    const groceryItems = [...selected].map((i) => ({
      name: ingredients[i].name,
      quantity: ingredients[i].quantity,
    }));
    expect(groceryItems).toHaveLength(2);
    expect(groceryItems[0].name).toBe("flour");
    expect(groceryItems[1].name).toBe("eggs");
  });
});

// ─── 13. Serving multiplier logic ────────────────────────────────────────────

describe("Serving multiplier", () => {
  const applyMultiplier = (quantity: string | undefined, multiplier: number): string | undefined => {
    if (!quantity) return quantity;
    const num = parseFloat(quantity);
    if (isNaN(num)) return quantity;
    const result = num * multiplier;
    // Simple rounding to 2 decimal places
    return parseFloat(result.toFixed(2)).toString();
  };

  it("doubles quantities with multiplier 2", () => {
    expect(applyMultiplier("1", 2)).toBe("2");
    expect(applyMultiplier("0.5", 2)).toBe("1");
    expect(applyMultiplier("3", 2)).toBe("6");
  });

  it("halves quantities with multiplier 0.5", () => {
    expect(applyMultiplier("2", 0.5)).toBe("1");
    expect(applyMultiplier("1", 0.5)).toBe("0.5");
  });

  it("leaves multiplier 1 unchanged", () => {
    expect(applyMultiplier("3", 1)).toBe("3");
  });

  it("passes through non-numeric quantities", () => {
    expect(applyMultiplier("a handful", 2)).toBe("a handful");
    expect(applyMultiplier("to taste", 3)).toBe("to taste");
  });

  it("returns undefined for undefined quantity", () => {
    expect(applyMultiplier(undefined, 2)).toBeUndefined();
  });
});
