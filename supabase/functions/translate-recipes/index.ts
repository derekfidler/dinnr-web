import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LANG_NAMES: Record<string, string> = {
  en: "English",
  sv: "Swedish",
  nl: "Dutch",
  fr: "French",
  de: "German",
  it: "Italian",
  es: "Spanish",
  da: "Danish",
  no: "Norwegian",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target_language, user_id } = await req.json();

    if (!target_language || !user_id) {
      return new Response(JSON.stringify({ error: "Missing target_language or user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const langName = LANG_NAMES[target_language] || target_language;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!anthropicApiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all recipes for the user
    const { data: recipes, error: fetchError } = await supabase
      .from("recipes")
      .select("id, title, description, ingredients, instructions")
      .eq("user_id", user_id);

    if (fetchError) throw fetchError;
    if (!recipes || recipes.length === 0) {
      return new Response(JSON.stringify({ translated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let translated = 0;

    // Process in batches of 3 to avoid rate limits
    const batchSize = 3;
    for (let i = 0; i < recipes.length; i += batchSize) {
      const batch = recipes.slice(i, i + batchSize);

      const promises = batch.map(async (recipe) => {
        try {
          const prompt = `Translate this recipe to ${langName}. Return ONLY valid JSON with the exact same structure.

Input:
${JSON.stringify({
  title: recipe.title,
  description: recipe.description,
  ingredients: recipe.ingredients,
  instructions: recipe.instructions,
})}

Rules:
- Translate title, description, ingredient names, ingredient notes, and instruction text
- Keep quantities, units, step numbers, and section names as-is (do not translate units like "cup", "tbsp" etc.)
- Keep the exact same JSON structure
- Return ONLY the JSON object, no markdown or explanation`;

          const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": anthropicApiKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 4096,
              system: "You are a precise recipe translator. Output only valid JSON.",
              messages: [{ role: "user", content: prompt }],
            }),
          });

          if (!response.ok) {
            console.error(`AI error for recipe ${recipe.id}:`, response.status);
            return false;
          }

          const aiData = await response.json();
          const content = aiData.content?.[0]?.text;
          if (!content) return false;

          // Parse JSON from response (handle markdown code blocks)
          let jsonStr = content.trim();
          if (jsonStr.startsWith("```")) {
            jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
          }

          const translatedData = JSON.parse(jsonStr);

          // Update the recipe
          const { error: updateError } = await supabase
            .from("recipes")
            .update({
              title: translatedData.title || recipe.title,
              description: translatedData.description ?? recipe.description,
              ingredients: translatedData.ingredients || recipe.ingredients,
              instructions: translatedData.instructions || recipe.instructions,
            })
            .eq("id", recipe.id);

          if (updateError) {
            console.error(`Update error for recipe ${recipe.id}:`, updateError);
            return false;
          }

          return true;
        } catch (err) {
          console.error(`Translation error for recipe ${recipe.id}:`, err);
          return false;
        }
      });

      const results = await Promise.all(promises);
      translated += results.filter(Boolean).length;

      // Small delay between batches
      if (i + batchSize < recipes.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return new Response(JSON.stringify({ translated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("translate-recipes error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
