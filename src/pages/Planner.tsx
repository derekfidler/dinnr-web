import { useState, useRef, useCallback, useEffect } from "react";
import { trackPageView, trackMealPlanCreated } from "@/lib/analytics";
import { useNavigate } from "react-router-dom";
import { Plus, X, ChevronLeft, ChevronRight, Trash2, Sparkles, ExternalLink, ArrowRight, RefreshCw, Copy } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfWeek, addDays, addWeeks, isSameDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import MealPlanChat from "@/components/MealPlanChat";
import type { Recipe } from "@/types/recipe";
import { useTranslation } from "@/lib/i18n";

interface MealPlan {
  id: string;
  date: string;
  meal_type: string;
  recipe_id: string;
  recipes: { id: string; title: string; image_url: string | null };
}

const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"] as const;
const MEAL_EMOJI: Record<string, string> = {
  breakfast: "☀️",
  lunch: "🍽️",
  dinner: "🌙",
  snack: "🍿",
};

function SwipeToDelete({
  onDelete,
  children,
}: {
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const swiping = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    swiping.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swiping.current || !containerRef.current) return;
    const diff = e.touches[0].clientX - startX.current;
    currentX.current = Math.min(0, diff);
    containerRef.current.style.transform = `translateX(${currentX.current}px)`;
  };

  const handleTouchEnd = () => {
    if (!containerRef.current) return;
    swiping.current = false;
    if (currentX.current < -80) {
      containerRef.current.style.transition = "transform 0.2s ease-out";
      containerRef.current.style.transform = "translateX(-100%)";
      setTimeout(onDelete, 200);
    } else {
      containerRef.current.style.transition = "transform 0.2s ease-out";
      containerRef.current.style.transform = "translateX(0)";
    }
    setTimeout(() => {
      if (containerRef.current) containerRef.current.style.transition = "";
    }, 200);
    currentX.current = 0;
  };

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-end bg-destructive px-4">
        <X className="h-5 w-5 text-destructive-foreground" />
      </div>
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative bg-background"
      >
        {children}
      </div>
    </div>
  );
}

const EDGE_ZONE_WIDTH = 48; // px from screen edge
const EDGE_HOLD_DELAY = 1200; // ms to hold before switching

export default function Planner() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t } = useTranslation();

  useEffect(() => { trackPageView("planner"); }, []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState<string>("");
  const [pickerMealType, setPickerMealType] = useState<string>("");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [weekOffset, setWeekOffset] = useState(() => {
    const saved = sessionStorage.getItem("planner-week-offset");
    return saved ? parseInt(saved, 10) : 0;
  });
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const draggedMealRef = useRef<MealPlan | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [edgeZone, setEdgeZone] = useState<"left" | "right" | null>(null);
  const edgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [edgeProgress, setEdgeProgress] = useState(false);

  useEffect(() => {
    sessionStorage.setItem("planner-week-offset", String(weekOffset));
  }, [weekOffset]);

  // Clear edge timer on unmount
  useEffect(() => {
    return () => {
      if (edgeTimerRef.current) clearTimeout(edgeTimerRef.current);
    };
  }, []);

  const clearEdgeTimer = useCallback(() => {
    if (edgeTimerRef.current) {
      clearTimeout(edgeTimerRef.current);
      edgeTimerRef.current = null;
    }
    setEdgeProgress(false);
  }, []);

  const handleEdgeDetection = useCallback((clientX: number) => {
    if (!isDragging) return;
    const windowWidth = window.innerWidth;
    let zone: "left" | "right" | null = null;

    if (clientX <= EDGE_ZONE_WIDTH) {
      zone = "left";
    } else if (clientX >= windowWidth - EDGE_ZONE_WIDTH) {
      zone = "right";
    }

    if (zone !== edgeZone) {
      clearEdgeTimer();
      setEdgeZone(zone);

      if (zone) {
        setEdgeProgress(true);
        edgeTimerRef.current = setTimeout(() => {
          setWeekOffset((w) => zone === "left" ? w - 1 : w + 1);
          setEdgeProgress(false);
          edgeTimerRef.current = null;
          // Keep dragging state but reset edge so user can trigger again
          setEdgeZone(null);
        }, EDGE_HOLD_DELAY);
      }
    }
  }, [isDragging, edgeZone, clearEdgeTimer]);

  // Global dragover listener for edge detection
  useEffect(() => {
    if (!isDragging) return;
    const onDragOver = (e: DragEvent) => {
      handleEdgeDetection(e.clientX);
    };
    window.addEventListener("dragover", onDragOver);
    return () => window.removeEventListener("dragover", onDragOver);
  }, [isDragging, handleEdgeDetection]);

  const today = new Date();
  const weekStart = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), weekOffset);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const dateRange = {
    start: format(days[0], "yyyy-MM-dd"),
    end: format(days[6], "yyyy-MM-dd"),
  };

  const { data: mealPlans = [] } = useQuery({
    queryKey: ["meal-plans", dateRange.start],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_plans")
        .select("id, date, meal_type, recipe_id, recipes(id, title, image_url)")
        .gte("date", dateRange.start)
        .lte("date", dateRange.end)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as MealPlan[];
    },
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .order("title", { ascending: true });
      if (error) throw error;
      return data as unknown as Recipe[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async ({
      date,
      meal_type,
      recipe_id,
    }: {
      date: string;
      meal_type: string;
      recipe_id: string;
    }) => {
      const { error } = await supabase
        .from("meal_plans")
        .insert({ date, meal_type, recipe_id, user_id: user?.id });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      trackMealPlanCreated(variables.meal_type);
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
      setPickerOpen(false);
      setRecipeSearch("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("meal_plans")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meal-plans"] }),
  });

  const moveMutation = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase
        .from("meal_plans")
        .update({ date })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meal-plans"] }),
  });

  const reassignMutation = useMutation({
    mutationFn: async ({ id, meal_type }: { id: string; meal_type: string }) => {
      const { error } = await supabase
        .from("meal_plans")
        .update({ meal_type })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meal-plans"] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async ({ recipe_id, meal_type, date }: { recipe_id: string; meal_type: string; date: string }) => {
      const { error } = await supabase
        .from("meal_plans")
        .insert({ date, meal_type, recipe_id, user_id: user?.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meal-plans"] }),
  });


  const handleDragStart = useCallback((e: React.DragEvent, meal: MealPlan) => {
    draggedMealRef.current = meal;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", meal.id);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.4";
    }
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
    draggedMealRef.current = null;
    setDragOverDate(null);
    setIsDragging(false);
    setEdgeZone(null);
    clearEdgeTimer();
  }, [clearEdgeTimer]);

  const handleDragOver = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(dateStr);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverDate(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    setDragOverDate(null);
    const meal = draggedMealRef.current;
    if (meal && meal.date !== dateStr) {
      moveMutation.mutate({ id: meal.id, date: dateStr });
    }
    draggedMealRef.current = null;
    setIsDragging(false);
    setEdgeZone(null);
    clearEdgeTimer();
  }, [moveMutation, clearEdgeTimer]);

  const openPicker = useCallback(
    (date: string, mealType?: string) => {
      setPickerDate(date);
      setPickerMealType(mealType || "");
      setRecipeSearch("");
      setPickerOpen(true);
    },
    []
  );

  const filteredRecipes = recipes.filter((r) =>
    r.title.toLowerCase().includes(recipeSearch.toLowerCase())
  );

  const getMealsForDay = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const dayMeals = mealPlans.filter((m) => m.date === dateStr);
    return dayMeals.sort(
      (a, b) => MEAL_ORDER.indexOf(a.meal_type as any) - MEAL_ORDER.indexOf(b.meal_type as any)
    );
  };

  return (
    <div className="min-h-screen pb-20 relative">
      {/* Edge zone indicators during drag */}
      {isDragging && (
        <>
          <div
            className={cn(
              "fixed left-0 top-0 bottom-0 z-50 flex items-center justify-center transition-all duration-300 pointer-events-none",
              edgeZone === "left"
                ? "w-12 bg-primary/20 border-r-2 border-primary"
                : "w-10 bg-muted/10 border-r border-border/50"
            )}
          >
            <div className="flex flex-col items-center gap-1">
              <ChevronLeft className={cn(
                "h-5 w-5 transition-colors",
                edgeZone === "left" ? "text-primary" : "text-muted-foreground/50"
              )} />
              {edgeZone === "left" && edgeProgress && (
                <div className="w-1 h-8 rounded-full bg-primary/30 overflow-hidden">
                  <div className="w-full bg-primary rounded-full animate-edge-fill" style={{ animationDuration: `${EDGE_HOLD_DELAY}ms` }} />
                </div>
              )}
            </div>
          </div>
          <div
            className={cn(
              "fixed right-0 top-0 bottom-0 z-50 flex items-center justify-center transition-all duration-300 pointer-events-none",
              edgeZone === "right"
                ? "w-12 bg-primary/20 border-l-2 border-primary"
                : "w-10 bg-muted/10 border-l border-border/50"
            )}
          >
            <div className="flex flex-col items-center gap-1">
              <ChevronRight className={cn(
                "h-5 w-5 transition-colors",
                edgeZone === "right" ? "text-primary" : "text-muted-foreground/50"
              )} />
              {edgeZone === "right" && edgeProgress && (
                <div className="w-1 h-8 rounded-full bg-primary/30 overflow-hidden">
                  <div className="w-full bg-primary rounded-full animate-edge-fill" style={{ animationDuration: `${EDGE_HOLD_DELAY}ms` }} />
                </div>
              )}
            </div>
          </div>
        </>
      )}
      <header className="flex items-center justify-between px-4 pt-6 pb-2">
        <h1 className="text-3xl font-bold tracking-tight">{t("planner")}</h1>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setChatOpen(true)} className="relative">
            <Sparkles className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setWeekOffset(0)}>
            {t("today")}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setWeekOffset((w) => w + 1)}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="divide-y divide-border">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const meals = getMealsForDay(day);
          const isToday = isSameDay(day, today);

          return (
            <div
              key={dateStr}
              className={cn(
                "px-4 py-4 transition-colors",
                dragOverDate === dateStr && "bg-primary/10"
              )}
              onDragOver={(e) => handleDragOver(e, dateStr)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, dateStr)}
            >
              {/* Day header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "text-3xl font-bold",
                      isToday ? "text-primary" : "text-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  <div className="flex flex-col leading-tight">
                    <span
                      className={cn(
                        "text-xs font-bold uppercase tracking-wide",
                        isToday ? "text-primary" : "text-foreground"
                      )}
                    >
                      {format(day, "EEEE")}
                    </span>
                    <span
                      className={cn(
                        "text-xs uppercase tracking-wide",
                        isToday
                          ? "text-primary/70"
                          : "text-muted-foreground"
                      )}
                    >
                      {format(day, "MMMM")}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => openPicker(dateStr)}
                  className="text-primary p-1"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>

              {/* Meals */}
              {meals.length > 0 && (
                <div className="ml-1 space-y-1">
                  {meals.map((meal) => (
                    <SwipeToDelete
                      key={meal.id}
                      onDelete={() => deleteMutation.mutate(meal.id)}
                    >
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <div
                            draggable
                            onDragStart={(e) => handleDragStart(e, meal)}
                            onDragEnd={handleDragEnd}
                            className="flex items-center gap-2 py-1.5 px-1 cursor-grab active:cursor-grabbing group"
                            onClick={() => navigate(`/recipe/${meal.recipe_id}`)}
                          >
                            <span className="text-sm select-none">
                              {MEAL_EMOJI[meal.meal_type] || "•"}
                            </span>
                            <span className="text-sm flex-1 select-none">{meal.recipes.title}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(meal.id); }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onClick={() => navigate(`/recipe/${meal.recipe_id}`)}>
                            <ArrowRight className="h-4 w-4 mr-2" />
                            {t("openRecipe")}
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => {
                            if (window.electronAPI?.isElectron) {
                              window.electronAPI.openRecipeWindow(meal.recipe_id);
                            } else {
                              window.open(`/recipe/${meal.recipe_id}`, "_blank");
                            }
                          }}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            {t("openInNewWindow")}
                          </ContextMenuItem>
                          <ContextMenuSub>
                            <ContextMenuSubTrigger>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              {t("reassignMeal")}
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent>
                              {MEAL_ORDER.filter((type) => type !== meal.meal_type).map((type) => (
                                <ContextMenuItem
                                  key={type}
                                  onClick={() => reassignMutation.mutate({ id: meal.id, meal_type: type })}
                                >
                                  {MEAL_EMOJI[type]} <span className="capitalize ml-1">{type}</span>
                                </ContextMenuItem>
                              ))}
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                          <ContextMenuSub>
                            <ContextMenuSubTrigger>
                              <Copy className="h-4 w-4 mr-2" />
                              {t("duplicateToDay")}
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent>
                              {days
                                .filter((d) => format(d, "yyyy-MM-dd") !== meal.date)
                                .map((d) => (
                                  <ContextMenuItem
                                    key={format(d, "yyyy-MM-dd")}
                                    onClick={() =>
                                      duplicateMutation.mutate({
                                        recipe_id: meal.recipe_id,
                                        meal_type: meal.meal_type,
                                        date: format(d, "yyyy-MM-dd"),
                                      })
                                    }
                                  >
                                    {format(d, "EEE, MMM d")}
                                  </ContextMenuItem>
                                ))}
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onClick={() => deleteMutation.mutate(meal.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t("removeFromPlan")}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </SwipeToDelete>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Recipe Picker Drawer */}
      <Drawer open={pickerOpen} onOpenChange={setPickerOpen}>
        <DrawerContent>
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-lg font-semibold">{t("addRecipe")}</h3>
            {pickerDate && (
              <p className="text-sm text-muted-foreground">
                {format(new Date(pickerDate + "T00:00:00"), "EEEE, MMMM d")}
              </p>
            )}
          </div>

          {/* Meal type selector */}
          <div className="flex gap-2 px-4 pb-3">
            {MEAL_ORDER.map((type) => (
              <button
                key={type}
                onClick={() =>
                  setPickerMealType(pickerMealType === type ? "" : type)
                }
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm capitalize transition-colors",
                  pickerMealType === type
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                )}
              >
                {MEAL_EMOJI[type]} {type}
              </button>
            ))}
          </div>

          {!pickerMealType && (
            <p className="px-4 py-2 text-xs text-muted-foreground text-center">
              {t("selectMealTypeFirst")}
            </p>
          )}

          {pickerMealType && (
            <>
              {/* Search */}
              <div className="px-4 pb-3">
                <Input
                  placeholder={t("searchRecipes")}
                  value={recipeSearch}
                  onChange={(e) => setRecipeSearch(e.target.value)}
                  className="bg-secondary border-0"
                  autoFocus
                />
              </div>

              {/* Recipe list */}
              <div className="max-h-[40vh] overflow-y-auto">
                {filteredRecipes.map((recipe) => (
                  <button
                    key={recipe.id}
                    onClick={() =>
                      addMutation.mutate({
                        date: pickerDate,
                        meal_type: pickerMealType,
                        recipe_id: recipe.id,
                      })
                    }
                    className="flex items-center gap-3 w-full px-4 py-3 text-left border-b border-border/50 transition-colors hover:bg-secondary/50"
                  >
                    {recipe.image_url ? (
                      <img
                        src={recipe.image_url}
                        alt=""
                        className="h-10 w-10 rounded-md object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-md bg-secondary shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">
                        {recipe.title}
                      </span>
                      {recipe.cuisine?.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {recipe.cuisine.join(", ")}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>

      <MealPlanChat
        open={chatOpen}
        onOpenChange={setChatOpen}
        recipes={recipes}
        existingPlans={mealPlans.map((m) => ({
          date: m.date,
          meal_type: m.meal_type,
          recipe_title: m.recipes.title,
        }))}
      />
    </div>
  );
}
