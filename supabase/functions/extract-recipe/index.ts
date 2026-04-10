import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CANONICAL_TAGS = [
  // Meal type
  "Breakfast", "Lunch", "Dinner", "Snack", "Dessert", "Side Dish", "Appetizer", "Drink",
  // Health
  "Healthy", "Junk Food", "High Protein", "High Carb", "Low Carb", "Gluten Free", "Dairy Free",
  // Occasion
  "Holiday", "Date Night", "Fancy", "Party", "BBQ", "Weeknight", "Meal Prep",
  // Method & style
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

async function downloadImageToStorage(
  imageUrl: string,
  userId: string | null,
  supabaseUrl: string,
  supabaseKey: string
): Promise<string | null> {
  if (!imageUrl) return null;
  try {
    const resp = await fetch(imageUrl, { redirect: "follow" });
    if (!resp.ok) {
      console.warn("Image download failed:", imageUrl, resp.status);
      return null;
    }
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      console.warn("Not an image content-type:", contentType);
      return null;
    }
    const imageData = await resp.arrayBuffer();
    if (imageData.byteLength < 1000) {
      console.warn("Image too small, likely an error page:", imageData.byteLength);
      return null;
    }

    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const fileName = `${userId || "anonymous"}/${Date.now()}.${ext}`;

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: uploadError } = await supabase.storage
      .from("recipe-images")
      .upload(fileName, imageData, {
        contentType,
        cacheControl: "31536000",
        upsert: true,
      });

    if (uploadError) {
      console.warn("Image upload error:", uploadError);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from("recipe-images")
      .getPublicUrl(fileName);

    console.log("Image saved to storage:", publicUrlData.publicUrl);
    return publicUrlData.publicUrl;
  } catch (e) {
    console.warn("Image download/upload error:", e);
    return null;
  }
}

async function validateImageUrl(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const resp = await fetch(url, { method: "HEAD", redirect: "follow" });
    const contentType = resp.headers.get("content-type") || "";
    if (resp.ok && contentType.startsWith("image/")) return url;
    const getResp = await fetch(url, { method: "GET", redirect: "follow" });
    const getContentType = getResp.headers.get("content-type") || "";
    await getResp.arrayBuffer();
    if (getResp.ok && getContentType.startsWith("image/")) return url;
    console.warn("Image URL failed validation:", url, resp.status, contentType);
    return null;
  } catch (e) {
    console.warn("Image URL validation error:", e);
    return null;
  }
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

  if (!recipe.title || recipe.title.trim().length === 0) {
    failures.push("Missing title");
  }

  const ingredients = recipe.ingredients || [];
  if (ingredients.length === 0) {
    failures.push("No ingredients");
  }

  const instructions = recipe.instructions || [];
  if (instructions.length === 0) {
    failures.push("No instructions");
  }

  if (!recipe.cuisine || !Array.isArray(recipe.cuisine) || recipe.cuisine.length === 0) {
    failures.push("Missing cuisine");
  }

  if (!recipe.complexity || !["easy", "medium", "hard", "expert"].includes(recipe.complexity)) {
    failures.push("Invalid complexity: " + recipe.complexity);
  }

  if (!recipe.diet || !["meat", "seafood", "vegetarian", "vegan"].includes(recipe.diet)) {
    failures.push("Invalid diet: " + recipe.diet);
  }

  if (!recipe.total_time) {
    failures.push("Missing total_time");
  }

  return { passed: failures.length === 0, failures };
}

const AI_SYSTEM_PROMPT = `You are a recipe extraction assistant. Extract structured recipe data from webpage content.

CRITICAL RULES:
1. ALL text output MUST be in English. If the recipe is in another language, translate everything (title, description, ingredients, instructions) to natural English.
2. Preserve the ORIGINAL measurements exactly as written in the recipe (whether metric or imperial). Do NOT convert units. Use realistic quantities — e.g. 2 cups flour, 1 tbsp olive oil, 200g butter. Keep the original unit system.
3. Ingredient quantities must be realistic numbers. Do not output 0, negative numbers, or absurdly large values. If a quantity is "to taste" or unspecified, omit the quantity field.
4. For time, provide ONLY total_time (the total time from start to finish). Do NOT provide separate prep_time or cook_time.
5. Classify cuisine(s) — for fusion dishes, list EACH cuisine separately as an array. For single-cuisine dishes, use a single-element array.
6. Classify complexity as: easy (under 30 min, few ingredients, simple techniques), medium (30-60 min, moderate skill), hard (60+ min, advanced techniques), expert (multi-day or professional techniques).
7. Classify diet as: meat, seafood, vegetarian, or vegan.
8. For tags, choose from this list when applicable: ${CANONICAL_TAGS.join(", ")}. You may add new tags if none fit, but always capitalize the first letter of each word. Avoid duplicates. IMPORTANT: Always include at least one meal type tag (Breakfast, Lunch, Dinner, Snack, Dessert), and consider adding health tags (Healthy, Junk Food, High Protein, High Carb) and occasion tags (Holiday, Date Night, Fancy, Party, Weeknight) when relevant.
9. Do NOT include non-English characters or words in any field.
10. Description should be 1-2 clear English sentences.`;

const AI_TOOL = {
  name: "extract_recipe",
  description: "Extract structured recipe data from webpage content",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Recipe title in English" },
      description: { type: "string", description: "Brief recipe description in English (1-2 sentences)" },
      image_url: { type: "string", description: "URL of the main recipe image if found" },
      servings: { type: "string", description: "Number of servings e.g. '4 servings'" },
      total_time: { type: "string", description: "Total time from start to finish e.g. '45 min'" },
      cuisine: { type: "array", items: { type: "string" }, description: "Array of cuisine types in English" },
      complexity: { type: "string", enum: ["easy", "medium", "hard", "expert"] },
      diet: { type: "string", enum: ["meat", "seafood", "vegetarian", "vegan"] },
      tags: { type: "array", items: { type: "string" }, description: "Recipe tags, capitalize first letter of each word" },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            quantity: { type: "string", description: "Numeric quantity as written in the original recipe" },
            unit: { type: "string", description: "Unit as written in the original recipe (cups, tbsp, g, ml, oz, etc)" },
            name: { type: "string", description: "Ingredient name in English" },
            notes: { type: "string", description: "Optional notes like 'finely chopped'" },
          },
          required: ["name"],
        },
      },
      instructions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            step: { type: "number", description: "Step number" },
            text: { type: "string", description: "Instruction text in English" },
            section: { type: "string", description: "Optional section heading" },
          },
          required: ["step", "text"],
        },
      },
    },
    required: ["title", "ingredients", "instructions", "cuisine", "complexity", "diet", "total_time"],
    additionalProperties: false,
  },
};

async function callAIExtraction(
  ANTHROPIC_API_KEY: string,
  pageTitle: string,
  markdown: string,
  attempt: number,
  previousFailures?: string[]
): Promise<any> {
  const userContent = attempt === 1
    ? `Extract the recipe from this webpage content:\n\nPage title: ${pageTitle}\n\n${markdown.substring(0, 15000)}`
    : `PREVIOUS ATTEMPT FAILED. Failures: ${previousFailures?.join(", ")}.\n\nPlease try again more carefully. Make sure ALL required fields are populated.\n\nExtract the recipe from this webpage content:\n\nPage title: ${pageTitle}\n\n${markdown.substring(0, 15000)}`;

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
      throw { status: 429, message: "Rate limit exceeded. Please try again later." };
    }
    const errText = await aiResponse.text();
    console.error("AI error:", aiResponse.status, errText);
    throw { status: 500, message: "AI extraction failed" };
  }

  const aiData = await aiResponse.json();
  const toolUse = aiData.content?.find((b: any) => b.type === "tool_use");
  if (!toolUse) {
    throw { status: 500, message: "AI did not return structured recipe data" };
  }

  return toolUse.input;
}

async function findFallbackImage(title: string, FIRECRAWL_API_KEY: string): Promise<string | null> {
  // Attempt 1: Firecrawl search for recipe pages — check og:image metadata
  try {
    console.log("Searching for fallback image via Firecrawl:", title);
    const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `${title} recipe`,
        limit: 5,
        scrapeOptions: { formats: ["markdown"] },
      }),
    });

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      const results = searchData.data || [];
      console.log(`Firecrawl search returned ${results.length} results`);

      for (const result of results) {
        const ogImage = result.metadata?.ogImage || result.metadata?.["og:image"];
        console.log(`Result: ${result.url}, ogImage: ${ogImage}`);
        if (ogImage && ogImage.startsWith("http")) {
          const validated = await validateImageUrl(ogImage);
          if (validated) return validated;
        }
      }

      // Try extracting images from markdown content
      for (const result of results) {
        const md = result.markdown || "";
        const imgMatch = md.match(/!\[.*?\]\((https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|webp)[^\s)]*)\)/i);
        if (imgMatch) {
          const validated = await validateImageUrl(imgMatch[1]);
          if (validated) return validated;
        }
      }
    } else {
      const errText = await searchResponse.text();
      console.warn("Firecrawl search failed:", searchResponse.status, errText);
    }
  } catch (imgError) {
    console.warn("Firecrawl fallback image search failed:", imgError);
  }

  // Attempt 2: Scrape the top search result page directly for og:image
  try {
    console.log("Trying to scrape top search result for og:image");
    const searchResponse2 = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `${title} recipe food photo`,
        limit: 3,
        scrapeOptions: { formats: ["markdown"] },
      }),
    });

    if (searchResponse2.ok) {
      const searchData2 = await searchResponse2.json();
      const results2 = searchData2.data || [];
      for (const result of results2) {
        const ogImage = result.metadata?.ogImage || result.metadata?.["og:image"];
        if (ogImage && ogImage.startsWith("http")) {
          const validated = await validateImageUrl(ogImage);
          if (validated) {
            console.log("Found og:image from scrape result:", validated);
            return validated;
          }
        }
        const md = result.markdown || "";
        const imgMatches = [...md.matchAll(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi)];
        for (const m of imgMatches.slice(0, 3)) {
          const imgUrl = m[1];
          if (imgUrl.length < 30) continue;
          const validated = await validateImageUrl(imgUrl);
          if (validated) {
            console.log("Found image from scraped markdown:", validated);
            return validated;
          }
        }
      }
    }
  } catch (scrapeErr) {
    console.warn("Scrape fallback failed:", scrapeErr);
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY is not configured");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    // Step 1: Scrape URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log("Scraping URL:", formattedUrl);

    let markdown = "";
    let pageTitle = "";

    // Try Firecrawl scrape first
    const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: formattedUrl, formats: ["markdown", "links"], onlyMainContent: false }),
    });

    const scrapeData = await scrapeResponse.json();

    if (scrapeResponse.ok) {
      markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
      pageTitle = scrapeData.data?.metadata?.title || scrapeData.metadata?.title || "";
    } else {
      console.warn("Firecrawl scrape failed, trying fallback methods:", scrapeData.error);

      // Fallback 0: Try oEmbed API for social media platforms (TikTok, Instagram, etc.)
      const isSocialMedia = /tiktok\.com|instagram\.com|youtube\.com|youtu\.be/.test(formattedUrl);
      if (isSocialMedia) {
        try {
          // TikTok oEmbed API returns video title and author without JS rendering
          let oembedUrl = "";
          if (formattedUrl.includes("tiktok.com")) {
            oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(formattedUrl)}`;
          } else if (formattedUrl.includes("instagram.com")) {
            oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(formattedUrl)}`;
          }
          
          if (oembedUrl) {
            console.log("Trying oEmbed API...");
            const oembedResp = await fetch(oembedUrl, {
              headers: { "User-Agent": "Mozilla/5.0" },
            });
            if (oembedResp.ok) {
              try {
                const oembedText = await oembedResp.text();
                const oembed = JSON.parse(oembedText);
                const oembedTitle = oembed.title || "";
                const oembedAuthor = oembed.author_name || "";
                if (oembedTitle) {
                  console.log("oEmbed title:", oembedTitle.substring(0, 100), "by", oembedAuthor);
                  if (oembedTitle.length > 200) {
                    markdown = oembedTitle;
                    const firstLine = oembedTitle.split(/[.\n!]/)[0].trim();
                    pageTitle = firstLine.length > 5 && firstLine.length < 150 ? firstLine : oembedTitle.substring(0, 100);
                    console.log("Using oEmbed as full recipe, title:", pageTitle);
                  } else {
                    pageTitle = oembedTitle;
                    console.log("Set pageTitle from oEmbed:", pageTitle);
                  }
                }
              } catch (parseErr) {
                console.warn("oEmbed response not valid JSON");
              }
            } else {
              await oembedResp.text();
              console.warn("oEmbed API returned:", oembedResp.status);
            }
          }
        } catch (oembedErr) {
          console.warn("oEmbed failed:", oembedErr);
        }
      }

      // Fallback 1: Direct fetch with basic HTML-to-text
      // For Instagram, try the graphql/web API first
      if (formattedUrl.includes("instagram.com")) {
        try {
          const reelCodeMatch = formattedUrl.match(/\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/);
          if (reelCodeMatch) {
            const shortcode = reelCodeMatch[1];
            // Try fetching via Instagram's public web API
            const igApiUrl = `https://www.instagram.com/api/v1/media/${shortcode}/info/`;
            console.log("Trying Instagram API for shortcode:", shortcode);
            const igResp = await fetch(igApiUrl, {
              headers: {
                "User-Agent": "Instagram 275.0.0.27.98 Android",
                "Accept": "*/*",
                "X-IG-App-ID": "936619743392459",
              },
            });
            if (igResp.ok) {
              const igContentType = igResp.headers.get("content-type") || "";
              if (igContentType.includes("json")) {
                const igData = await igResp.json();
                const caption = igData.items?.[0]?.caption?.text || "";
                const igUser = igData.items?.[0]?.user?.username || "";
                if (caption && caption.length > 20) {
                  console.log("Got Instagram caption via API:", caption.substring(0, 100));
                  if (caption.length > 200) {
                    markdown = `Recipe by @${igUser}\n\n${caption}`;
                    pageTitle = caption.split(/[.\n!]/)[0].trim().substring(0, 100);
                  } else {
                    pageTitle = caption.split(/[.\n!]/)[0].trim().substring(0, 100);
                  }
                }
              } else {
                await igResp.text();
                console.log("Instagram API returned non-JSON response");
              }
            } else {
              await igResp.text();
              console.log("Instagram API returned:", igResp.status);
            }
          }
        } catch (igApiErr) {
          console.warn("Instagram API failed:", igApiErr);
        }
      }
      
      try {
        console.log("Trying direct fetch...");
        const directResp = await fetch(formattedUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
          },
          redirect: "follow",
        });
        if (directResp.ok) {
          const html = await directResp.text();
          // Extract title
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          pageTitle = titleMatch ? titleMatch[1].trim() : "";
          
          // Extract OG metadata (critical for social media sites like TikTok)
          const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
          const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
          const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
          
          const ogTitle = ogTitleMatch?.[1]?.trim() || "";
          const ogDesc = ogDescMatch?.[1]?.trim() || descMatch?.[1]?.trim() || "";
          
          if (ogTitle) {
            pageTitle = ogTitle;
            console.log("Found OG title:", ogTitle);
          }
          if (ogDesc) {
            console.log("Found OG description:", ogDesc.substring(0, 100));
          }
          
          // Extract JSON-LD recipe data if available
          const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
          if (jsonLdMatch) {
            for (const match of jsonLdMatch) {
              const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, "");
              try {
                const ld = JSON.parse(jsonContent);
                const recipes = Array.isArray(ld) ? ld : [ld];
                for (const item of recipes) {
                  if (item["@type"] === "Recipe" || item["@type"]?.includes?.("Recipe")) {
                    markdown = `# ${item.name || pageTitle}\n\n${item.description || ""}\n\n## Ingredients\n${(item.recipeIngredient || []).map((i: string) => `- ${i}`).join("\n")}\n\n## Instructions\n${(item.recipeInstructions || []).map((i: any, idx: number) => `${idx + 1}. ${typeof i === "string" ? i : i.text || ""}`).join("\n")}\n\nServings: ${item.recipeYield || ""}\nTotal Time: ${item.totalTime || item.cookTime || ""}\n`;
                    pageTitle = item.name || pageTitle;
                    console.log("Extracted recipe from JSON-LD");
                    break;
                  }
                }
              } catch { /* ignore parse errors */ }
            }
          }
          // If no JSON-LD, use OG metadata + stripped text
          if (!markdown) {
            const strippedText = html
              .replace(/<script[\s\S]*?<\/script>/gi, "")
              .replace(/<style[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            // Combine OG metadata with stripped text for better context
            if (ogTitle || ogDesc) {
              markdown = `# ${ogTitle}\n\n${ogDesc}\n\n${strippedText}`;
            } else {
              markdown = strippedText;
            }
            console.log("Extracted text from HTML directly");
          }
        }
      } catch (directErr) {
        console.warn("Direct fetch failed:", directErr);
      }

      // Fallback 2: For social media / blocked sites — identify recipe via URL context then search
      if (!markdown || markdown.length < 100) {
        try {
          console.log("Content too short, trying URL-context identification...");
          
          // Extract hints from URL (e.g. TikTok username, video description)
          const urlObj = new URL(formattedUrl);
          const pathParts = urlObj.pathname.split("/").filter(Boolean);
          const username = pathParts.find(p => p.startsWith("@")) || "";
          const hostname = urlObj.hostname.replace("www.", "");
          
          // If we got an OG title from the page, use it directly as the recipe identifier
          // Social media sites often put the content description in og:title
          let identifiedTitle = "";
          
          if (pageTitle && pageTitle.length > 5 && 
              !pageTitle.toLowerCase().includes("tiktok") && 
              !pageTitle.toLowerCase().includes("instagram") &&
              !pageTitle.toLowerCase().includes("facebook") &&
              pageTitle.toLowerCase() !== "reels") {
            // Page title looks like real content, not just the site name
            identifiedTitle = pageTitle;
            console.log("Using page/OG title as recipe identifier:", identifiedTitle);
          }
          
          // For Instagram/social: use AI with the URL to try to identify the recipe directly
          if (!identifiedTitle && /instagram\.com|tiktok\.com/.test(formattedUrl)) {
            try {
              console.log("Trying AI-based recipe identification from URL...");
              const identifyFromUrlResp = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                  "x-api-key": ANTHROPIC_API_KEY,
                  "anthropic-version": "2023-06-01",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "claude-haiku-4-5-20251001",
                  max_tokens: 100,
                  system: "You are a recipe identifier. Given a social media URL, use your training knowledge to identify what recipe is shown in this post. Reply with ONLY the exact recipe name, nothing else. If you cannot identify it, reply with UNKNOWN.",
                  messages: [{ role: "user", content: `What recipe is shown at this URL: ${formattedUrl}` }],
                }),
              });
              if (identifyFromUrlResp.ok) {
                const identifyFromUrlAI = await identifyFromUrlResp.json();
                const name = identifyFromUrlAI.content?.[0]?.text?.trim();
                if (name && name !== "UNKNOWN" && name.length > 2 && name.length < 100) {
                  identifiedTitle = name;
                  console.log("AI identified recipe from URL knowledge:", identifiedTitle);
                }
              } else {
                await identifyFromUrlResp.text();
              }
            } catch (aiUrlErr) {
              console.warn("AI URL identification failed:", aiUrlErr);
            }
          }
          
          // If page title is generic, try searching for the specific URL
          if (!identifiedTitle) {
            // Extract reel/video code for targeted searches
            const reelCodeMatch = formattedUrl.match(/\/(?:reel|reels|video|p)\/([A-Za-z0-9_-]+)/);
            const reelCode = reelCodeMatch?.[1] || "";
            
            const urlSearchQueries = [
              // Search for the specific post on recipe aggregator sites
              reelCode ? `"${reelCode}" recipe` : "",
              username ? `${username} recipe ${hostname}` : `recipe ${formattedUrl}`,
              `"${formattedUrl}"`,
            ].filter(Boolean);
          
            for (const query of urlSearchQueries) {
              console.log("Searching for recipe identity:", query);
              const identifyResp = await fetch("https://api.firecrawl.dev/v1/search", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ query, limit: 5, scrapeOptions: { formats: ["markdown"] } }),
              });
              
              if (identifyResp.ok) {
                const identifyData = await identifyResp.json();
                const results = identifyData.data || [];
                
                for (const result of results) {
                  const resultText = (result.markdown || "") + " " + (result.metadata?.title || "") + " " + (result.metadata?.description || "");
                  if (resultText.length > 200) {
                    const identifyResponse = await fetch("https://api.anthropic.com/v1/messages", {
                      method: "POST",
                      headers: {
                        "x-api-key": ANTHROPIC_API_KEY,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        model: "claude-haiku-4-5-20251001",
                        max_tokens: 100,
                        system: "You identify recipe names. Given search results about a social media post, identify the exact recipe name. Reply with ONLY the recipe name, nothing else. If you cannot identify it, reply with UNKNOWN.",
                        messages: [{ role: "user", content: `URL: ${formattedUrl}\nCreator: ${username}\n\nSearch result title: ${result.metadata?.title || ""}\nSearch result: ${resultText.substring(0, 3000)}` }],
                      }),
                    });

                    if (identifyResponse.ok) {
                      const identifyAI = await identifyResponse.json();
                      const name = identifyAI.content?.[0]?.text?.trim();
                      if (name && name !== "UNKNOWN" && name.length > 2 && name.length < 100) {
                        identifiedTitle = name;
                        console.log("AI identified recipe as:", identifiedTitle);
                        break;
                      }
                    } else {
                      await identifyResponse.text();
                    }
                  }
                }
              } else {
                await identifyResp.text();
              }
              
              if (identifiedTitle) break;
            }
          } // end if (!identifiedTitle)
          
          // Step B: Now search for the actual recipe content using the identified title
          if (identifiedTitle) {
            console.log("Searching for full recipe:", identifiedTitle);
            const recipeSearchResp = await fetch("https://api.firecrawl.dev/v1/search", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                query: `${identifiedTitle} recipe ingredients instructions`,
                limit: 5,
                scrapeOptions: { formats: ["markdown"] },
              }),
            });
            
            if (recipeSearchResp.ok) {
              const recipeSearchData = await recipeSearchResp.json();
              const results = recipeSearchData.data || [];
              for (const result of results) {
                if (result.markdown && result.markdown.length > 500) {
                  markdown = result.markdown;
                  pageTitle = identifiedTitle;
                  console.log("Found full recipe content via identified search:", result.url);
                  break;
                }
              }
            } else {
              await recipeSearchResp.text();
            }
          }
          
          // Step C: If we still don't have content but have a title, try a simpler search
          if ((!markdown || markdown.length < 100) && !identifiedTitle) {
            // Last resort: extract any readable text from URL path
            const recipeSlug = pathParts
              .filter(p => !p.startsWith("@") && !/^\d+$/.test(p) && p !== "video" && p !== "reel" && p !== "p")
              .pop()?.replace(/[-_]/g, " ").trim() || "";
            
            if (recipeSlug) {
              const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  query: recipeSlug + " recipe",
                  limit: 3,
                  scrapeOptions: { formats: ["markdown"] },
                }),
              });

              if (searchResponse.ok) {
                const searchData = await searchResponse.json();
                const results = searchData.data || [];
                for (const result of results) {
                  if (result.markdown && result.markdown.length > 500) {
                    markdown = result.markdown;
                    pageTitle = result.metadata?.title || recipeSlug;
                    console.log("Found recipe content via slug search:", result.url);
                    break;
                  }
                }
              } else {
                await searchResponse.text();
              }
            }
          }
        } catch (searchErr) {
          console.warn("Smart search fallback failed:", searchErr);
        }
      }
    }

    if (!markdown) throw new Error("Could not access this recipe. The website may block automated access. Try creating the recipe manually.");

    console.log("Scraped content length:", markdown.length);

    // Step 2: Extract with retry (max 2 attempts)
    let recipe: any = null;
    let acceptanceResult: AcceptanceResult = { passed: false, failures: [] };

    for (let attempt = 1; attempt <= 2; attempt++) {
      console.log(`AI extraction attempt ${attempt}`);

      try {
        recipe = await callAIExtraction(
          ANTHROPIC_API_KEY,
          pageTitle,
          markdown,
          attempt,
          attempt > 1 ? acceptanceResult.failures : undefined
        );
      } catch (err: any) {
        if (err.status === 429 || err.status === 402) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: err.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (attempt === 2) break;
        console.warn(`Attempt ${attempt} extraction error:`, err.message);
        continue;
      }

      console.log(`Attempt ${attempt} extracted:`, recipe?.title);

      // Post-process
      recipe.ingredients = validateIngredients(recipe.ingredients || []);
      recipe.tags = normalizeTags(recipe.tags || []);
      recipe.prep_time = null;
      recipe.cook_time = null;

      // Run acceptance check
      acceptanceResult = runAcceptanceCheck(recipe);

      if (acceptanceResult.passed) {
        console.log(`Attempt ${attempt} passed acceptance check`);
        break;
      }

      console.warn(`Attempt ${attempt} failed acceptance:`, acceptanceResult.failures);
    }

    // If we have no recipe at all, error out
    if (!recipe) {
      throw new Error("Failed to extract any recipe data");
    }

    // Validate/find image
    const validatedImageUrl = await validateImageUrl(recipe.image_url);
    recipe.image_url = validatedImageUrl;

    if (!recipe.image_url && recipe.title) {
      console.log("No valid image, searching for one...");
      recipe.image_url = await findFallbackImage(recipe.title, FIRECRAWL_API_KEY);
      if (recipe.image_url) console.log("Found fallback image:", recipe.image_url);
    }

    // Extract source domain
    let sourceDomain = "";
    try { sourceDomain = new URL(formattedUrl).hostname.replace("www.", ""); } catch {}

    console.log("Acceptance check:", {
      passed: acceptanceResult.passed,
      failures: acceptanceResult.failures,
      hasTitle: !!recipe.title,
      ingredientCount: (recipe.ingredients || []).length,
      instructionCount: (recipe.instructions || []).length,
      hasImage: !!recipe.image_url,
    });

    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // If acceptance failed after 2 attempts, return partial data for manual editing.
    // Do NOT upload the image here — if the user cancels the editor the file would
    // be orphaned with no recipe row referencing it. The client uploads on save.
    if (!acceptanceResult.passed) {
      console.log("Returning partial data for manual editing");
      return new Response(JSON.stringify({
        success: false,
        partial: true,
        failures: acceptanceResult.failures,
        recipe: {
          title: recipe.title || pageTitle || "",
          description: recipe.description || null,
          source_url: formattedUrl,
          image_url: recipe.image_url || null,
          servings: recipe.servings || null,
          total_time: recipe.total_time || null,
          ingredients: recipe.ingredients || [],
          instructions: recipe.instructions || [],
          cuisine: Array.isArray(recipe.cuisine) ? recipe.cuisine : recipe.cuisine ? [recipe.cuisine] : null,
          complexity: recipe.complexity || null,
          diet: recipe.diet || null,
          tags: recipe.tags || [],
          source_domain: sourceDomain,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload image for successful recipes to avoid hotlinking issues
    if (recipe.image_url) {
      const storedImageUrl = await downloadImageToStorage(recipe.image_url, user_id, supabaseUrl, supabaseKey);
      if (storedImageUrl) recipe.image_url = storedImageUrl;
      // If download failed, keep the original URL as fallback
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: insertedRecipe, error: insertError } = await supabase
      .from("recipes")
      .insert({
        title: recipe.title,
        description: recipe.description || null,
        source_url: formattedUrl,
        image_url: recipe.image_url || null,
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
        source_domain: sourceDomain,
        user_id: user_id || null,
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
    console.error("extract-recipe error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
