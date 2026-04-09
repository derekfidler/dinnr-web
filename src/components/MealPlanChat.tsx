import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Sparkles, Check } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Recipe } from "@/types/recipe";

interface MealPlanChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipes: Recipe[];
  existingPlans: { date: string; meal_type: string; recipe_title: string }[];
}

interface SuggestOption {
  recipe_id: string;
  recipe_title: string;
  reason: string;
}

interface SuggestData {
  date: string;
  meal_type: string;
  options: SuggestOption[];
}

interface BulkPlanData {
  assignments: { date: string; meal_type: string; recipe_id: string }[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  suggest?: SuggestData;
  bulkPlan?: BulkPlanData;
  picked?: boolean; // true once user has picked an option or accepted bulk
}

const WELCOME_MESSAGES = [
  "How can I help you meal plan? 🍳",
  "Let me know how many days you'd like me to plan, which meals, and what you feel like eating.",
  'For example: "Help me plan 3 days, lunch and dinners only, vegetarian, mexican and american, and I want to spend less than 30 minutes on lunches and less than 60 minutes cooking dinners"',
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meal-plan-chat`;

export default function MealPlanChat({ open, onOpenChange, recipes, existingPlans }: MealPlanChatProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMessages([]);
      setInput("");
      setIsLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const insertMealPlans = useCallback(
    async (assignments: { date: string; meal_type: string; recipe_id: string }[]) => {
      if (!user?.id) return false;

      const inserts = assignments.map((a) => ({
        date: a.date,
        meal_type: a.meal_type,
        recipe_id: a.recipe_id,
        user_id: user.id,
      }));

      const { error } = await supabase.from("meal_plans").insert(inserts);
      if (error) {
        toast.error("Failed to save meal plans");
        console.error("Insert error:", error);
        return false;
      }

      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
      return true;
    },
    [user, queryClient]
  );

  const handlePickOption = useCallback(
    async (messageIndex: number, option: SuggestOption, suggest: SuggestData) => {
      const assignment = {
        date: suggest.date,
        meal_type: suggest.meal_type,
        recipe_id: option.recipe_id,
      };

      const ok = await insertMealPlans([assignment]);
      if (!ok) return;

      setMessages((prev) =>
        prev.map((m, i) => (i === messageIndex ? { ...m, picked: true } : m))
      );
      setMessages((prev) => [
        ...prev,
        { role: "user", content: option.recipe_title },
        {
          role: "assistant",
          content: `✅ Added "${option.recipe_title}" for ${suggest.meal_type} on ${suggest.date}!`,
        },
      ]);
    },
    [insertMealPlans]
  );

  const handleAcceptAll = useCallback(
    async (messageIndex: number, bulkPlan: BulkPlanData) => {
      const ok = await insertMealPlans(bulkPlan.assignments);
      if (!ok) return;

      setMessages((prev) =>
        prev.map((m, i) => (i === messageIndex ? { ...m, picked: true } : m))
      );

      const recipeMap = new Map(recipes.map((r) => [r.id, r.title]));
      const summary = bulkPlan.assignments
        .map((a) => `• ${a.date} ${a.meal_type}: ${recipeMap.get(a.recipe_id) || "Recipe"}`)
        .join("\n");
      const count = bulkPlan.assignments.length;

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `✅ Done! I've added ${count} meal${count > 1 ? "s" : ""} to your planner:\n\n${summary}`,
        },
      ]);
    },
    [insertMealPlans, recipes]
  );

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    const recipeSummary = recipes.map((r) => ({
      id: r.id,
      title: r.title,
      cuisine: r.cuisine,
      diet: r.diet,
      tags: r.tags,
      total_time: r.total_time,
    }));

    // Only send role+content to the API
    const apiMessages = updatedMessages.map(({ role, content }) => ({ role, content }));

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: apiMessages,
          recipes: recipeSummary,
          currentDate: format(new Date(), "yyyy-MM-dd"),
          existingPlans,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assistantContent = "";
      let toolCallName = "";
      let toolCallArgs = "";
      let inToolCall = false;
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const choice = parsed.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;

            if (delta?.tool_calls) {
              inToolCall = true;
              for (const tc of delta.tool_calls) {
                if (tc.function?.name) toolCallName = tc.function.name;
                if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
              }
            }

            const content = delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && prev.length > 0) {
                  return prev.map((m, i) =>
                    i === prev.length - 1 ? { ...m, content: assistantContent } : m
                  );
                }
                return [...prev, { role: "assistant", content: assistantContent }];
              });
            }

            if (choice.finish_reason === "tool_calls" || choice.finish_reason === "stop") {
              if (inToolCall && toolCallArgs) {
                processToolCall(toolCallName, toolCallArgs, assistantContent);
                inToolCall = false;
                toolCallName = "";
                toolCallArgs = "";
              }
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Flush remaining
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) =>
                    i === prev.length - 1 ? { ...m, content: assistantContent } : m
                  );
                }
                return [...prev, { role: "assistant", content: assistantContent }];
              });
            }
          } catch {
            /* ignore */
          }
        }
      }

      if (inToolCall && toolCallArgs) {
        processToolCall(toolCallName, toolCallArgs, assistantContent);
      }
    } catch (e) {
      console.error("Chat error:", e);
      toast.error(e instanceof Error ? e.message : "Failed to get AI response");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }

    function processToolCall(name: string, argsStr: string, textContent: string) {
      try {
        const args = JSON.parse(argsStr);

        if (name === "suggest_meals" && args.options) {
          // Show options as buttons
          setMessages((prev) => {
            // If there's already an assistant message being streamed, attach suggest to it
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && textContent) {
              return prev.map((m, i) =>
                i === prev.length - 1
                  ? { ...m, content: textContent, suggest: args as SuggestData }
                  : m
              );
            }
            return [
              ...prev,
              {
                role: "assistant",
                content: textContent || `Here are some options for ${args.meal_type}:`,
                suggest: args as SuggestData,
              },
            ];
          });
        } else if (name === "plan_meals" && args.assignments) {
          // Show accept-all button
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && textContent) {
              return prev.map((m, i) =>
                i === prev.length - 1
                  ? { ...m, content: textContent, bulkPlan: args as BulkPlanData }
                  : m
              );
            }
            const recipeMap = new Map(recipes.map((r) => [r.id, r.title]));
            const summary = args.assignments
              .map((a: any) => `• ${a.date} ${a.meal_type}: ${recipeMap.get(a.recipe_id) || "Recipe"}`)
              .join("\n");
            return [
              ...prev,
              {
                role: "assistant",
                content: `Here's what I've planned:\n\n${summary}`,
                bulkPlan: args as BulkPlanData,
              },
            ];
          });
        }
      } catch (parseErr) {
        console.error("Failed to parse tool call args:", parseErr);
      }
    }
  }, [input, isLoading, messages, recipes, existingPlans]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const allMessages: ChatMessage[] = [
    ...WELCOME_MESSAGES.map((content) => ({ role: "assistant" as const, content })),
    ...messages,
  ];

  const realMessageOffset = WELCOME_MESSAGES.length;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[85vh] max-h-[85vh] flex flex-col">
        <div className="px-4 pt-3 pb-2 border-b border-border">
          <h3 className="text-lg font-semibold">Meal Plan Assistant</h3>
          <p className="text-xs text-muted-foreground">A little AI helper to make meal plans from your recipes</p>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {allMessages.map((msg, i) => (
            <div key={i}>
              <div
                className={cn(
                  "flex gap-2 items-end",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="shrink-0 w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
                      : "bg-secondary text-secondary-foreground rounded-2xl rounded-bl-md"
                  )}
                >
                  {msg.content}
                </div>
              </div>

              {/* Suggest options (single meal - up to 3 buttons) */}
              {msg.suggest && !msg.picked && (
                <div className="ml-9 mt-2 flex flex-col gap-2">
                  {msg.suggest.options.slice(0, 3).map((opt) => (
                    <button
                      key={opt.recipe_id}
                      onClick={() => handlePickOption(i - realMessageOffset, opt, msg.suggest!)}
                      className="text-left rounded-xl border border-border bg-card hover:bg-accent/10 hover:border-primary/40 transition-colors px-4 py-3"
                    >
                      <span className="text-sm font-medium text-foreground">{opt.recipe_title}</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">{opt.reason}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Bulk plan - accept all button */}
              {msg.bulkPlan && !msg.picked && (
                <div className="ml-9 mt-2">
                  <Button
                    onClick={() => handleAcceptAll(i - realMessageOffset, msg.bulkPlan!)}
                    className="rounded-xl gap-2"
                  >
                    <Check className="h-4 w-4" />
                    Accept all ({msg.bulkPlan.assignments.length} meals)
                  </Button>
                </div>
              )}

              {/* Picked indicator */}
              {(msg.suggest || msg.bulkPlan) && msg.picked && (
                <div className="ml-9 mt-2 text-xs text-muted-foreground flex items-center gap-1">
                  <Check className="h-3 w-3" /> Added to planner
                </div>
              )}
            </div>
          ))}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-2 items-end">
              <div className="shrink-0 w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-secondary text-secondary-foreground rounded-2xl rounded-bl-md px-4 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3 flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell me what you'd like to eat..."
            disabled={isLoading}
            className="flex-1 bg-secondary rounded-full px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="rounded-full shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
