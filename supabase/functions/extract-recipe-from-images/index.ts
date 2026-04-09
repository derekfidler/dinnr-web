import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CANONICAL_TAGS = [
  "Breakfast", "Lunch", "Dinner", "Snack", "Dessert", "Side Dish", "Appetizer", "Drink",
  "Healthy", "Junk Food", "High Protein", "High Carb", "Low Carb", "Gluten Free", "Dairy Free",
  "Holiday", "Date Night", "Fancy", "Party", "BBQ", "Weeknight", "Meal Prep",
  "Quick", "One-Pot", "Comfort Food", "Budget Friendly", "Kid Friendly",
  "Slow Cooker", "Air Fryer", "Instant Pot",
  "Soup", "Salad", "Pasta", "Stew", "Curry", "Stir Fry",
  "Baked", "Grilled", "Fried",
  "Spicy", "Sweet", "Savory", "Fresh", "Fermented",
];

function normalizeTags(tags: string[]): string[] {
  if (!tags || !Array.isArray(tags)) return [];
  const normalized = tags.map((tag) => {
    const trimmed = tag.trim();
    const canonical = CANONICAL_TAGS.find((ct) => ct.toLowerCase() === trimmed.toLowerCase());
    if (canonical) return canonical;
    return trimmed.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  });
  return [...new Set(normalized)];
}

function validateIngredients(
  ingredients: Array<{ quantity?: string; unit?: string; name: string; notes?: string }>
): Array<{ quantity?: string; unit?: string; name: string; notes?: string }> {
  return ingredients.map((ing) => {
    const cleaned = { ...ing };
    if (cleaned.quantity) {
      const num = parseFloat(cleaned.quantity);
      if (isNaN(num) || num <= 0 || num > 10000) cleaned.quantity = undefined;
    }
    if (!cleaned.quantity && cleaned.unit) cleaned.unit = undefined;
    cleaned.name = cleaned.name.replace(/[^\x20-\x7E]/g, "").trim();
    if (cleaned.notes) {
      cleaned.notes = cleaned.notes.replace(/[^\x20-\x7E]/g, "").trim();
      if (!cleaned.notes) cleaned.notes = undefined;
    }
    return cleaned;
  }).filter((ing) => ing.name.length > 0);
}

interface AcceptanceResult {
  passed: boolean;
  failures: string[];
}

function runAcceptanceCheck(recipe: any): AcceptanceResult {
  const failures: string[] = [];
  if (!recipe.title || recipe.title.trim().length === 0) failures.push("Missing title");
  if (!recipe.ingredients || recipe.ingredients.length === 0) failures.push("No ingredients");
  if (!recipe.instructions || recipe.instructions.length === 0) failures.push("No instructions");
  if (!recipe.cuisine || !Array.isArray(recipe.cuisine) || recipe.cuisine.length === 0) failures.push("Missing cuisine");
  if (!recipe.complexity || !["easy", "medium", "hard", "expert"].includes(recipe.complexity)) failures.push("Invalid complexity");
  if (!recipe.diet || !["meat", "seafood", "vegetarian", "vegan"].includes(recipe.diet)) failures.push("Invalid diet");
  if (!recipe.total_time) failures.push("Missing total_time");
  return { passed: failures.length === 0, failures };
}

const AI_SYSTEM_PROMPT = `You are a recipe extraction assistant. Extract structured recipe data from uploaded images of recipes (screenshots, photos of cookbooks, handwritten recipes, etc.).

CRITICAL RULES:
1. ALL text output MUST be in English. If the recipe is in another language, translate everything.
2. Preserve the ORIGINAL measurements exactly as shown in the image. Do NOT convert units.
3. Ingredient quantities must be realistic. If unspecified, omit the quantity field.
4. Provide ONLY total_time (total time from start to finish).
5. Classify cuisine(s) — for fusion dishes list each separately.
6. Classify complexity as: easy, medium, hard, or expert.
7. Classify diet as: meat, seafood, vegetarian, or vegan.
8. For tags, choose from: ${CANONICAL_TAGS.join(", ")}. Always include at least one meal type tag.
9. Do NOT include non-English characters.
10. Description should be 1-2 clear English sentences.
11. If multiple images are provided, they may be different pages/photos of the SAME recipe. Combine all information from all images into a single complete recipe.
12. IMPORTANT: Set hero_image_index to the 0-based index of the image that best shows the FINISHED DISH (a food photo). Images are numbered in the order provided (0, 1, 2, ...). If no image shows the finished food, set hero_image_index to -1.`;

const AI_TOOL = {
  name: "extract_recipe",
  description: "Extract structured recipe data from images",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Recipe title in English" },
      description: { type: "string", description: "Brief recipe description (1-2 sentences)" },
      servings: { type: "string", description: "Number of servings e.g. '4 servings'" },
      total_time: { type: "string", description: "Total time e.g. '45 min'" },
      cuisine: { type: "array", items: { type: "string" }, description: "Cuisine types" },
      complexity: { type: "string", enum: ["easy", "medium", "hard", "expert"] },
      diet: { type: "string", enum: ["meat", "seafood", "vegetarian", "vegan"] },
      tags: { type: "array", items: { type: "string" } },
      hero_image_index: { type: "number", description: "0-based index of the image that best shows the finished dish (the hero/food photo). If no image shows the finished food, set to -1." },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            quantity: { type: "string" },
            unit: { type: "string" },
            name: { type: "string" },
            notes: { type: "string" },
          },
          required: ["name"],
        },
      },
      instructions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            step: { type: "number" },
            text: { type: "string" },
            section: { type: "string" },
          },
          required: ["step", "text"],
        },
      },
    },
    required: ["title", "ingredients", "instructions", "cuisine", "complexity", "diet", "total_time", "hero_image_index"],
    additionalProperties: false,
  },
};

/** Parse a data URL into { mediaType, data } for Anthropic's base64 image format */
function parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { images } = await req.json();

    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one image is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the caller's JWT and derive user_id from it — never trust the
    // request body for identity, as the service role key bypasses RLS.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const authClient = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user_id = user.id;

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    console.log(`Extracting recipe from ${images.length} image(s)`);

    // Build multimodal content array (Anthropic format)
    const contentParts: any[] = [
      {
        type: "text",
        text: images.length > 1
          ? `Extract the recipe from these ${images.length} images. They may be different pages or photos of the same recipe — combine all information into one complete recipe.`
          : "Extract the recipe from this image.",
      },
    ];

    for (const img of images) {
      const parsed = parseDataUrl(img);
      if (parsed) {
        contentParts.push({
          type: "image",
          source: {
            type: "base64",
            media_type: parsed.mediaType,
            data: parsed.data,
          },
        });
      }
    }

    // Two-attempt extraction loop
    let recipe: any = null;
    let acceptanceResult: AcceptanceResult = { passed: false, failures: [] };

    for (let attempt = 1; attempt <= 2; attempt++) {
      console.log(`AI extraction attempt ${attempt}`);

      const userContent = attempt === 1
        ? contentParts
        : [
            {
              type: "text",
              text: `PREVIOUS ATTEMPT FAILED. Failures: ${acceptanceResult.failures.join(", ")}.\nPlease try again more carefully. Make sure ALL required fields are populated.\n\nExtract the recipe from these image(s):`,
            },
            ...contentParts.slice(1), // re-include images
          ];

      try {
        const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: AI_SYSTEM_PROMPT,
            messages: [{ role: "user", content: userContent }],
            tools: [AI_TOOL],
            tool_choice: { type: "tool", name: "extract_recipe" },
          }),
        });

        if (!aiResponse.ok) {
          if (aiResponse.status === 429) {
            return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
              status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const errText = await aiResponse.text();
          console.error("AI error:", aiResponse.status, errText);
          if (attempt === 2) throw new Error("AI extraction failed");
          continue;
        }

        const aiData = await aiResponse.json();
        const toolUse = aiData.content?.find((b: any) => b.type === "tool_use");
        if (!toolUse) {
          if (attempt === 2) throw new Error("AI did not return structured recipe data");
          continue;
        }

        recipe = toolUse.input;
      } catch (err: any) {
        if (err.status === 429) throw err;
        if (attempt === 2 && !recipe) throw err;
        console.warn(`Attempt ${attempt} error:`, err.message);
        continue;
      }

      // Post-process
      recipe.ingredients = validateIngredients(recipe.ingredients || []);
      recipe.tags = normalizeTags(recipe.tags || []);
      recipe.prep_time = null;
      recipe.cook_time = null;

      acceptanceResult = runAcceptanceCheck(recipe);
      if (acceptanceResult.passed) {
        console.log(`Attempt ${attempt} passed acceptance check`);
        break;
      }
      console.warn(`Attempt ${attempt} failed:`, acceptanceResult.failures);
    }

    if (!recipe) throw new Error("Failed to extract any recipe data from images");

    console.log("Acceptance:", { passed: acceptanceResult.passed, failures: acceptanceResult.failures });

    // If acceptance failed, return partial data for manual editing.
    // Do NOT upload the hero image here — if the user cancels the editor the file
    // would be orphaned with no recipe row referencing it. image_url is null for
    // partial image-extracted recipes since there is no external URL to return.
    if (!acceptanceResult.passed) {
      return new Response(JSON.stringify({
        success: false,
        partial: true,
        failures: acceptanceResult.failures,
        recipe: {
          title: recipe.title || "",
          description: recipe.description || null,
          source_url: null,
          image_url: null,
          servings: recipe.servings || null,
          total_time: recipe.total_time || null,
          ingredients: recipe.ingredients || [],
          instructions: recipe.instructions || [],
          cuisine: Array.isArray(recipe.cuisine) ? recipe.cuisine : recipe.cuisine ? [recipe.cuisine] : null,
          complexity: recipe.complexity || null,
          diet: recipe.diet || null,
          tags: recipe.tags || [],
          source_domain: null,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Upload hero image to storage only for recipes that will be saved.
    // This avoids orphaned files when the user discards a partial recipe.
    let heroImageUrl: string | null = null;
    const heroIdx = recipe.hero_image_index;
    if (typeof heroIdx === "number" && heroIdx >= 0 && heroIdx < images.length) {
      try {
        console.log(`Uploading hero image (index ${heroIdx}) to storage`);
        const base64Data = images[heroIdx];
        const match = base64Data.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (match) {
          const contentType = match[1];
          const rawBase64 = match[2];
          const binaryStr = atob(rawBase64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

          const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
          const fileName = `${user_id}/${Date.now()}.${ext}`;

          const storageClient = createClient(supabaseUrl, supabaseKey);

          const { error: uploadError } = await storageClient.storage
            .from("recipe-images")
            .upload(fileName, bytes.buffer, { contentType, cacheControl: "31536000", upsert: true });

          if (uploadError) {
            console.warn("Hero image upload error:", uploadError);
          } else {
            const { data: publicUrlData } = storageClient.storage
              .from("recipe-images")
              .getPublicUrl(fileName);
            heroImageUrl = publicUrlData.publicUrl;
            console.log("Hero image saved:", heroImageUrl);
          }
        }
      } catch (imgErr) {
        console.warn("Hero image processing error:", imgErr);
      }
    } else if (heroIdx !== -1) {
      console.log("No hero image identified by AI (index:", heroIdx, ")");
    }

    // Save to database
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: insertedRecipe, error: insertError } = await supabase
      .from("recipes")
      .insert({
        title: recipe.title,
        description: recipe.description || null,
        source_url: null,
        image_url: heroImageUrl,
        servings: recipe.servings || null,
        prep_time: null,
        cook_time: null,
        total_time: recipe.total_time || null,
        ingredients: recipe.ingredients || [],
        instructions: recipe.instructions || [],
        cuisine: Array.isArray(recipe.cuisine) ? recipe.cuisine : recipe.cuisine ? [recipe.cuisine] : null,
        complexity: recipe.complexity || null,
        diet: recipe.diet || null,
        tags: recipe.tags || [],
        rating: 0,
        source_domain: null,
        user_id: user_id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      throw new Error("Failed to save recipe");
    }

    console.log("Recipe saved:", insertedRecipe.id);

    return new Response(JSON.stringify({ success: true, recipe: insertedRecipe }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extract-recipe-from-images error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
