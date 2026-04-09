import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, recipes, currentDate, existingPlans } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const recipeSummary = (recipes || [])
      .map(
        (r: any) =>
          `- ID: ${r.id} | "${r.title}" | cuisine: ${(r.cuisine || []).join(", ") || "none"} | diet: ${r.diet || "none"} | tags: ${(r.tags || []).join(", ") || "none"} | total_time: ${r.total_time || "unknown"}`
      )
      .join("\n");

    const existingPlansSummary = (existingPlans || [])
      .map(
        (p: any) =>
          `- ${p.date} ${p.meal_type}: "${p.recipe_title}"`
      )
      .join("\n");

    const systemPrompt = `You are a friendly meal planning assistant. You help users plan their meals by selecting recipes from their personal recipe library.

TODAY'S DATE: ${currentDate}

THE USER'S RECIPE LIBRARY:
${recipeSummary || "No recipes found."}

EXISTING MEAL PLANS THIS WEEK:
${existingPlansSummary || "None yet."}

INSTRUCTIONS:
- Help the user decide what to eat by asking about preferences (cuisine, diet, cooking time, etc.)
- ONLY suggest recipes that exist in their library above. Never invent recipes.
- When suggesting recipes, use the suggest_meals or plan_meals tools depending on the situation:

SINGLE MEAL PLANNING (1 meal at a time):
- When the user asks to plan a single meal (e.g. "what should I have for dinner tonight?"), use the suggest_meals tool to present up to 3 recipe options.
- Include a brief reason for each suggestion.
- The user will pick one by clicking a button.

BULK MEAL PLANNING (more than 3 meals):
- When planning multiple meals at once (e.g. "plan 3 days of lunch and dinner"), use the plan_meals tool directly with your best selections.
- Before calling plan_meals, briefly describe what you're planning in your message.

CRITICAL - SKIP EXISTING MEALS:
- NEVER plan a meal for a date + meal_type combination that already exists in EXISTING MEAL PLANS above.
- When generating a bulk plan, check the existing plans list and skip any slot that is already filled.
- For example, if Monday lunch already has a recipe planned, do NOT include Monday lunch in your assignments.
- Only fill empty/unplanned meal slots.

GENERAL:
- Each meal assignment needs a date (YYYY-MM-DD), meal_type (breakfast, lunch, dinner, or snack), and the recipe_id from the library.
- Plan from today (${currentDate}) onwards unless the user specifies different dates.
- Be concise and friendly. Use emoji sparingly.
- If the library has few recipes, let the user know and work with what's available.
- When referring to recipes, use their titles, not IDs.`;

    const tools = [
      {
        name: "suggest_meals",
        description:
          "Present up to 3 recipe options for a single meal slot so the user can pick one. Use this when planning one meal at a time.",
        input_schema: {
          type: "object",
          properties: {
            date: { type: "string", description: "Date in YYYY-MM-DD format" },
            meal_type: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
            options: {
              type: "array",
              maxItems: 3,
              items: {
                type: "object",
                properties: {
                  recipe_id: { type: "string", description: "UUID of the recipe from the library" },
                  recipe_title: { type: "string", description: "Title of the recipe" },
                  reason: { type: "string", description: "Brief reason for suggesting this recipe" },
                },
                required: ["recipe_id", "recipe_title", "reason"],
                additionalProperties: false,
              },
            },
          },
          required: ["date", "meal_type", "options"],
          additionalProperties: false,
        },
      },
      {
        name: "plan_meals",
        description:
          "Assign recipes to specific dates and meal types in the user's meal planner. Use this when planning more than 3 meals at once, after briefly describing the plan.",
        input_schema: {
          type: "object",
          properties: {
            assignments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  date: { type: "string", description: "Date in YYYY-MM-DD format" },
                  meal_type: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
                  recipe_id: { type: "string", description: "UUID of the recipe from the library" },
                },
                required: ["date", "meal_type", "recipe_id"],
                additionalProperties: false,
              },
            },
          },
          required: ["assignments"],
          additionalProperties: false,
        },
      },
    ];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
        tools,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("Anthropic error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Transform Anthropic SSE stream → OpenAI SSE format (for frontend compatibility)
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let currentEvent = "";
          // Track tool call block index → OpenAI tool_calls array index
          let toolCallOIIndex = -1;
          const toolCallBlocks = new Map<number, number>(); // anthropic block index → OI index
          let stopReason = "stop";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const rawLine of lines) {
              const line = rawLine.trimEnd();

              if (line.startsWith("event: ")) {
                currentEvent = line.slice(7).trim();
                continue;
              }

              if (!line.startsWith("data: ")) continue;
              const dataStr = line.slice(6).trim();

              let data: any;
              try {
                data = JSON.parse(dataStr);
              } catch {
                continue;
              }

              if (currentEvent === "content_block_start") {
                const blockIndex: number = data.index;
                const blockType: string = data.content_block?.type;

                if (blockType === "tool_use") {
                  toolCallOIIndex++;
                  toolCallBlocks.set(blockIndex, toolCallOIIndex);
                  const chunk = JSON.stringify({
                    choices: [{
                      delta: {
                        tool_calls: [{
                          index: toolCallOIIndex,
                          id: data.content_block.id,
                          type: "function",
                          function: { name: data.content_block.name, arguments: "" },
                        }],
                      },
                    }],
                  });
                  controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
                }
              } else if (currentEvent === "content_block_delta") {
                const blockIndex: number = data.index;
                const delta = data.delta;

                if (delta?.type === "text_delta" && delta.text) {
                  const chunk = JSON.stringify({
                    choices: [{ delta: { content: delta.text } }],
                  });
                  controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
                } else if (delta?.type === "input_json_delta" && delta.partial_json) {
                  const oiIndex = toolCallBlocks.get(blockIndex) ?? 0;
                  const chunk = JSON.stringify({
                    choices: [{
                      delta: {
                        tool_calls: [{ index: oiIndex, function: { arguments: delta.partial_json } }],
                      },
                    }],
                  });
                  controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
                }
              } else if (currentEvent === "message_delta") {
                if (data.delta?.stop_reason === "tool_use") {
                  stopReason = "tool_calls";
                }
              } else if (currentEvent === "message_stop") {
                // Emit finish_reason chunk
                const finishChunk = JSON.stringify({
                  choices: [{ delta: {}, finish_reason: stopReason }],
                });
                controller.enqueue(encoder.encode(`data: ${finishChunk}\n\n`));
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              }
            }
          }

          // Ensure stream is terminated
          if (!buffer.includes("[DONE]")) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          }
        } catch (e) {
          console.error("Stream transform error:", e);
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("meal-plan-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
