import { useState, useEffect } from "react";
import { Plus, Search, SlidersHorizontal, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { RecipeCard } from "@/components/RecipeCard";
import { RecipeGridCard } from "@/components/RecipeGridCard";
import { RecipeContextMenu } from "@/components/RecipeContextMenu";
import { AddRecipeDialog } from "@/components/AddRecipeDialog";
import type { Recipe } from "@/types/recipe";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { trackPageView } from "@/lib/analytics";

type SortOption = "date" | "alpha" | "cuisine" | "meal" | "time" | "rating";

const COMPLEXITY_OPTIONS = ["easy", "medium", "hard", "expert"];
const DIET_OPTIONS = ["vegetarian", "vegan", "gluten-free", "dairy-free", "keto", "paleo"];
const MEAL_OPTIONS = ["Breakfast", "Lunch", "Dinner", "Dessert"];
const HEALTH_OPTIONS = ["Healthy", "Junk Food", "High Protein", "High Carb"];
const OCCASION_OPTIONS = ["Holiday", "Date Night", "Fancy", "Party", "BBQ", "Weeknight"];
const TIME_OPTIONS_KEYS = [
  { key: "under15min" as const, min: 0, max: 15 },
  { key: "under30min" as const, min: 0, max: 30 },
  { key: "under60min" as const, min: 0, max: 60 },
  { key: "under2hours" as const, min: 0, max: 120 },
  { key: "over2hours" as const, min: 120, max: Infinity },
];

function parseMinutes(timeStr: string | null): number | null {
  if (!timeStr) return null;
  // Handle formats like "1 hour 30 minutes", "2 hours", "45 minutes", "90 min"
  let total = 0;
  const hourMatch = timeStr.match(/(\d+)\s*h/i);
  const minMatch = timeStr.match(/(\d+)\s*m/i);
  if (hourMatch) total += parseInt(hourMatch[1], 10) * 60;
  if (minMatch) total += parseInt(minMatch[1], 10);
  if (total > 0) return total;
  // Fallback: just grab first number and assume minutes
  const numMatch = timeStr.match(/(\d+)/);
  return numMatch ? parseInt(numMatch[1], 10) : null;
}

type TimeFilter = { min: number; max: number } | null;

export default function RecipeLibrary() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => { trackPageView("recipe_library"); }, []);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("date");
  const [appliedCuisines, setAppliedCuisines] = useState<Set<string>>(new Set());
  const [appliedDiets, setAppliedDiets] = useState<Set<string>>(new Set());
  const [appliedComplexities, setAppliedComplexities] = useState<Set<string>>(new Set());
  const [appliedTimeFilter, setAppliedTimeFilter] = useState<TimeFilter>(null);
  const [appliedMeals, setAppliedMeals] = useState<Set<string>>(new Set());
  const [appliedHealth, setAppliedHealth] = useState<Set<string>>(new Set());
  const [appliedOccasions, setAppliedOccasions] = useState<Set<string>>(new Set());

  const [draftCuisines, setDraftCuisines] = useState<Set<string>>(new Set());
  const [draftDiets, setDraftDiets] = useState<Set<string>>(new Set());
  const [draftComplexities, setDraftComplexities] = useState<Set<string>>(new Set());
  const [draftTimeFilter, setDraftTimeFilter] = useState<TimeFilter>(null);
  const [draftMeals, setDraftMeals] = useState<Set<string>>(new Set());
  const [draftHealth, setDraftHealth] = useState<Set<string>>(new Set());
  const [draftOccasions, setDraftOccasions] = useState<Set<string>>(new Set());

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ["recipes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Recipe[]) || [];
    },
  });

  const activeFilterCount =
    appliedCuisines.size + appliedDiets.size + appliedComplexities.size + (appliedTimeFilter ? 1 : 0) + appliedMeals.size + appliedHealth.size + appliedOccasions.size;

  const filtered = recipes.filter((r) => {
    if (search) {
      const s = search.toLowerCase();
      const matchesTitle = r.title.toLowerCase().includes(s);
      const matchesTags = r.tags?.some((t) => t.toLowerCase().includes(s));
      if (!matchesTitle && !matchesTags) return false;
    }
    if (appliedCuisines.size > 0 && (!r.cuisine || !r.cuisine.some((c) => appliedCuisines.has(c.toLowerCase())))) return false;
    if (appliedDiets.size > 0 && (!r.diet || !appliedDiets.has(r.diet.toLowerCase()))) return false;
    if (appliedComplexities.size > 0 && (!r.complexity || !appliedComplexities.has(r.complexity.toLowerCase()))) return false;
    if (appliedTimeFilter) {
      const mins = parseMinutes(r.total_time) ?? parseMinutes(r.cook_time);
      if (mins === null) return false;
      if (appliedTimeFilter.max === Infinity) {
        if (mins < appliedTimeFilter.min) return false;
      } else {
        if (mins > appliedTimeFilter.max) return false;
      }
    }
    const tags = r.tags?.map((t) => t.toLowerCase()) || [];
    if (appliedMeals.size > 0 && !tags.some((t) => appliedMeals.has(t))) return false;
    if (appliedHealth.size > 0 && !tags.some((t) => appliedHealth.has(t))) return false;
    if (appliedOccasions.size > 0 && !tags.some((t) => appliedOccasions.has(t))) return false;
    return true;
  });

  // Sort the filtered recipes
  const sorted = [...filtered].sort((a, b) => {
    switch (sortOption) {
      case "date":
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "alpha":
        return a.title.localeCompare(b.title);
      case "cuisine":
        return (a.cuisine?.[0] || "zzz").localeCompare(b.cuisine?.[0] || "zzz");
      case "meal": {
        const mealOrder = ["breakfast", "lunch", "dinner", "dessert"];
        const getMealIdx = (r: Recipe) => {
          const tags = r.tags?.map(t => t.toLowerCase()) || [];
          const idx = mealOrder.findIndex(m => tags.includes(m));
          return idx === -1 ? 999 : idx;
        };
        return getMealIdx(a) - getMealIdx(b);
      }
      case "time": {
        const ta = parseMinutes(a.total_time) ?? 9999;
        const tb = parseMinutes(b.total_time) ?? 9999;
        return ta - tb;
      }
      case "rating":
        return (b.rating ?? 0) - (a.rating ?? 0);
      default:
        return 0;
    }
  });
  const cuisines = [...new Set(recipes.flatMap((r) => r.cuisine || []).filter(Boolean))].sort() as string[];

  const diets = [...new Set(recipes.map((r) => r.diet).filter(Boolean))] as string[];
  const allDiets = [...new Set([...DIET_OPTIONS, ...diets.map((d) => d.toLowerCase())])];

  const openFilter = () => {
    setDraftCuisines(new Set(appliedCuisines));
    setDraftDiets(new Set(appliedDiets));
    setDraftComplexities(new Set(appliedComplexities));
    setDraftTimeFilter(appliedTimeFilter);
    setDraftMeals(new Set(appliedMeals));
    setDraftHealth(new Set(appliedHealth));
    setDraftOccasions(new Set(appliedOccasions));
    setFilterOpen(true);
  };

  const applyFilters = () => {
    setAppliedCuisines(new Set(draftCuisines));
    setAppliedDiets(new Set(draftDiets));
    setAppliedComplexities(new Set(draftComplexities));
    setAppliedTimeFilter(draftTimeFilter);
    setAppliedMeals(new Set(draftMeals));
    setAppliedHealth(new Set(draftHealth));
    setAppliedOccasions(new Set(draftOccasions));
    setFilterOpen(false);
  };

  const clearDrafts = () => {
    setDraftCuisines(new Set());
    setDraftDiets(new Set());
    setDraftComplexities(new Set());
    setDraftTimeFilter(null);
    setDraftMeals(new Set());
    setDraftHealth(new Set());
    setDraftOccasions(new Set());
  };

  const toggleInSet = (set: Set<string>, value: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  // Desktop: apply filters directly (no draft/apply pattern)
  const toggleAppliedCuisine = (c: string) => toggleInSet(appliedCuisines, c.toLowerCase(), setAppliedCuisines);
  const toggleAppliedDiet = (d: string) => toggleInSet(appliedDiets, d, setAppliedDiets);
  const toggleAppliedComplexity = (c: string) => toggleInSet(appliedComplexities, c, setAppliedComplexities);
  const toggleAppliedMeal = (m: string) => toggleInSet(appliedMeals, m.toLowerCase(), setAppliedMeals);
  const toggleAppliedHealth = (h: string) => toggleInSet(appliedHealth, h.toLowerCase(), setAppliedHealth);
  const toggleAppliedOccasion = (o: string) => toggleInSet(appliedOccasions, o.toLowerCase(), setAppliedOccasions);

  const TIME_OPTIONS = TIME_OPTIONS_KEYS.map((to) => ({ ...to, label: t(to.key) }));

  // Shared filter content for mobile drawer
  const filterContent = (
    <div className="space-y-5">
      {/* Sort */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-2">{t("sortBy")}</p>
        <div className="flex flex-wrap gap-2">
          {(["date", "alpha", "cuisine", "meal", "time", "rating"] as SortOption[]).map((opt) => {
            const labels: Record<SortOption, string> = {
              date: t("sortDateAdded"), alpha: t("sortAlphabetical"),
              cuisine: t("sortCuisine"), meal: t("sortMeal"), time: t("sortTime"), rating: t("sortRating"),
            };
            const active = sortOption === opt;
            return (
              <Badge key={opt} variant={active ? "default" : "outline"} className={cn("cursor-pointer text-sm px-3 py-1", active && "bg-primary text-primary-foreground")} onClick={() => setSortOption(opt)}>{labels[opt]}</Badge>
            );
          })}
        </div>
      </div>
      {cuisines.length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">{t("cuisine")}</p>
          <div className="flex flex-wrap gap-2">
            {cuisines.map((c) => {
              const key = c.toLowerCase();
              const active = draftCuisines.has(key);
              return (
                <Badge
                  key={c}
                  variant={active ? "default" : "outline"}
                  className={cn("cursor-pointer text-sm px-3 py-1", active && "bg-primary text-primary-foreground")}
                  onClick={() => toggleInSet(draftCuisines, key, setDraftCuisines)}
                >
                  {c}
                </Badge>
              );
            })}
          </div>
        </div>
      )}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-2">{t("diet")}</p>
        <div className="flex flex-wrap gap-2">
          {allDiets.map((d) => {
            const active = draftDiets.has(d);
            return (
              <Badge
                key={d}
                variant={active ? "default" : "outline"}
                className={cn("cursor-pointer text-sm px-3 py-1 capitalize", active && "bg-primary text-primary-foreground")}
                onClick={() => toggleInSet(draftDiets, d, setDraftDiets)}
              >
                {d}
              </Badge>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-2">{t("difficulty")}</p>
        <div className="flex flex-wrap gap-2">
          {COMPLEXITY_OPTIONS.map((c) => {
            const active = draftComplexities.has(c);
            return (
              <Badge
                key={c}
                variant={active ? "default" : "outline"}
                className={cn("cursor-pointer text-sm px-3 py-1 capitalize", active && "bg-primary text-primary-foreground")}
                onClick={() => toggleInSet(draftComplexities, c, setDraftComplexities)}
              >
                {c}
              </Badge>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-2">{t("meal")}</p>
        <div className="flex flex-wrap gap-2">
          {MEAL_OPTIONS.map((m) => {
            const key = m.toLowerCase();
            const active = draftMeals.has(key);
            return (
              <Badge key={m} variant={active ? "default" : "outline"} className={cn("cursor-pointer text-sm px-3 py-1", active && "bg-primary text-primary-foreground")} onClick={() => toggleInSet(draftMeals, key, setDraftMeals)}>{m}</Badge>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-2">{t("health")}</p>
        <div className="flex flex-wrap gap-2">
          {HEALTH_OPTIONS.map((h) => {
            const key = h.toLowerCase();
            const active = draftHealth.has(key);
            return (
              <Badge key={h} variant={active ? "default" : "outline"} className={cn("cursor-pointer text-sm px-3 py-1", active && "bg-primary text-primary-foreground")} onClick={() => toggleInSet(draftHealth, key, setDraftHealth)}>{h}</Badge>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-2">{t("occasion")}</p>
        <div className="flex flex-wrap gap-2">
          {OCCASION_OPTIONS.map((o) => {
            const key = o.toLowerCase();
            const active = draftOccasions.has(key);
            return (
              <Badge key={o} variant={active ? "default" : "outline"} className={cn("cursor-pointer text-sm px-3 py-1", active && "bg-primary text-primary-foreground")} onClick={() => toggleInSet(draftOccasions, key, setDraftOccasions)}>{o}</Badge>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-2">{t("totalTime")}</p>
        <div className="flex flex-wrap gap-2">
           {TIME_OPTIONS.map((to) => {
            const active = draftTimeFilter?.min === to.min && draftTimeFilter?.max === to.max;
            return (
              <Badge
                key={to.label}
                variant={active ? "default" : "outline"}
                className={cn("cursor-pointer text-sm px-3 py-1", active && "bg-primary text-primary-foreground")}
                onClick={() => setDraftTimeFilter(active ? null : { min: to.min, max: to.max })}
              >
                {to.label}
              </Badge>
            );
          })}
        </div>
      </div>
    </div>
  );

  const emptyState = (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
      <p className="text-lg mb-1">{t("noRecipesYet")}</p>
      <p className="text-sm">{t("tapToAddFirst")}</p>
    </div>
  );

  const loadingState = (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      {t("loading")}
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* ===== MOBILE LAYOUT ===== */}
      <div className="md:hidden">
        <header
          className="sticky z-40 bg-background/95 backdrop-blur-lg px-4 pt-6 pb-3"
          style={{ top: "var(--titlebar-area-height)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-3xl font-bold tracking-tight">{t("recipes")}</h1>
            <div className="flex items-center gap-1">
              <Drawer open={filterOpen} onOpenChange={setFilterOpen}>
                <DrawerTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative" onClick={openFilter}>
                    <SlidersHorizontal className="h-5 w-5" />
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                </DrawerTrigger>
                <DrawerContent>
                  <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{t("filters")}</h3>
                    <button onClick={clearDrafts} className="text-sm text-primary font-medium">
                      {t("clearAll")}
                    </button>
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto px-4 pb-4">
                    {filterContent}
                  </div>
                  <div className="p-4">
                    <Button className="w-full" onClick={applyFilters}>
                      {t("applyFilters")}
                    </Button>
                  </div>
                </DrawerContent>
              </Drawer>
              <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
                <Settings className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setAddOpen(true)}>
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
             <Input
              placeholder={t("searchRecipes")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-secondary border-0"
            />
          </div>
        </header>
        <main className="flex-1 px-4 pt-3">
          {isLoading ? loadingState : sorted.length === 0 ? emptyState : (
            <div className="space-y-1">
              {sorted.map((recipe) => (
                <RecipeContextMenu key={recipe.id} recipe={recipe}>
                  <div><RecipeCard recipe={recipe} /></div>
                </RecipeContextMenu>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* ===== DESKTOP LAYOUT ===== */}
      <div className="hidden md:flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-border">
          <ScrollArea className="h-[calc(100vh-5rem)]">
            <div className="pl-4 pr-4 pt-6 pb-4 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">{t("filters")}</h2>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => {
                      setAppliedCuisines(new Set());
                      setAppliedDiets(new Set());
                      setAppliedComplexities(new Set());
                      setAppliedTimeFilter(null);
                      setAppliedMeals(new Set());
                      setAppliedHealth(new Set());
                      setAppliedOccasions(new Set());
                    }}
                    className="text-xs text-primary font-medium"
                  >
                    {t("clear")}
                  </button>
                )}
              </div>

              <Accordion type="multiple" defaultValue={["sort", "cuisine", "diet", "difficulty", "time"]}>
                {/* Sort */}
                <AccordionItem value="sort" className="border-b-0">
                  <AccordionTrigger className="py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:no-underline">
                    {t("sortBy")}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-0.5">
                      {(["date", "alpha", "cuisine", "meal", "time", "rating"] as SortOption[]).map((opt) => {
                        const labels: Record<SortOption, string> = {
                          date: t("sortDateAdded"), alpha: t("sortAlphabetical"),
                          cuisine: t("sortCuisine"), meal: t("sortMeal"), time: t("sortTime"), rating: t("sortRating"),
                        };
                        const active = sortOption === opt;
                        return (
                          <button key={opt} onClick={() => setSortOption(opt)} className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors text-left", active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50")}>
                            <span className={cn("h-2 w-2 rounded-sm shrink-0", active ? "bg-primary" : "bg-muted-foreground/30")} />
                            <span className="truncate">{labels[opt]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
                {/* Cuisine */}
                {cuisines.length > 0 && (
                  <AccordionItem value="cuisine" className="border-b-0">
                    <AccordionTrigger className="py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:no-underline">
                      {t("cuisine")}
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-0.5">
                        {cuisines.map((c) => {
                          const key = c.toLowerCase();
                          const active = appliedCuisines.has(key);
                          return (
                            <button
                              key={c}
                              onClick={() => toggleAppliedCuisine(c)}
                              className={cn(
                                "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors text-left",
                                active
                                  ? "bg-primary/10 text-primary font-medium"
                                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                              )}
                            >
                              <span className={cn("h-2 w-2 rounded-sm shrink-0", active ? "bg-primary" : "bg-muted-foreground/30")} />
                              <span className="truncate">{c}</span>
                            </button>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}

                {/* Diet */}
                <AccordionItem value="diet" className="border-b-0">
                   <AccordionTrigger className="py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:no-underline">
                      {t("diet")}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-0.5">
                      {allDiets.map((d) => {
                        const active = appliedDiets.has(d);
                        return (
                          <button
                            key={d}
                            onClick={() => toggleAppliedDiet(d)}
                            className={cn(
                              "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors text-left capitalize",
                              active
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                            )}
                          >
                            <span className={cn("h-2 w-2 rounded-sm shrink-0", active ? "bg-primary" : "bg-muted-foreground/30")} />
                            <span className="truncate">{d}</span>
                          </button>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Difficulty */}
                <AccordionItem value="difficulty" className="border-b-0">
                    <AccordionTrigger className="py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:no-underline">
                      {t("difficulty")}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-0.5">
                      {COMPLEXITY_OPTIONS.map((c) => {
                        const active = appliedComplexities.has(c);
                        return (
                          <button
                            key={c}
                            onClick={() => toggleAppliedComplexity(c)}
                            className={cn(
                              "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors text-left capitalize",
                              active
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                            )}
                          >
                            <span className={cn("h-2 w-2 rounded-sm shrink-0", active ? "bg-primary" : "bg-muted-foreground/30")} />
                            <span className="truncate">{c}</span>
                          </button>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Time */}
                <AccordionItem value="time" className="border-b-0">
                    <AccordionTrigger className="py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:no-underline">
                      {t("totalTime")}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-0.5">
                      {TIME_OPTIONS.map((t) => {
                        const active = appliedTimeFilter?.min === t.min && appliedTimeFilter?.max === t.max;
                        return (
                          <button
                            key={t.label}
                            onClick={() => setAppliedTimeFilter(active ? null : { min: t.min, max: t.max })}
                            className={cn(
                              "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors text-left",
                              active
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                            )}
                          >
                            <span className={cn("h-2 w-2 rounded-sm shrink-0", active ? "bg-primary" : "bg-muted-foreground/30")} />
                            <span className="truncate">{t.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Meal */}
                <AccordionItem value="meal" className="border-b-0">
                    <AccordionTrigger className="py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:no-underline">
                      {t("meal")}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-0.5">
                      {MEAL_OPTIONS.map((m) => {
                        const key = m.toLowerCase();
                        const active = appliedMeals.has(key);
                        return (
                          <button key={m} onClick={() => toggleAppliedMeal(m)} className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors text-left", active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50")}>
                            <span className={cn("h-2 w-2 rounded-sm shrink-0", active ? "bg-primary" : "bg-muted-foreground/30")} />
                            <span className="truncate">{m}</span>
                          </button>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Health */}
                <AccordionItem value="health" className="border-b-0">
                    <AccordionTrigger className="py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:no-underline">
                      {t("health")}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-0.5">
                      {HEALTH_OPTIONS.map((h) => {
                        const key = h.toLowerCase();
                        const active = appliedHealth.has(key);
                        return (
                          <button key={h} onClick={() => toggleAppliedHealth(h)} className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors text-left", active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50")}>
                            <span className={cn("h-2 w-2 rounded-sm shrink-0", active ? "bg-primary" : "bg-muted-foreground/30")} />
                            <span className="truncate">{h}</span>
                          </button>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Occasion */}
                <AccordionItem value="occasion" className="border-b-0">
                    <AccordionTrigger className="py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:no-underline">
                      {t("occasion")}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-0.5">
                      {OCCASION_OPTIONS.map((o) => {
                        const key = o.toLowerCase();
                        const active = appliedOccasions.has(key);
                        return (
                          <button key={o} onClick={() => toggleAppliedOccasion(o)} className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors text-left", active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50")}>
                            <span className={cn("h-2 w-2 rounded-sm shrink-0", active ? "bg-primary" : "bg-muted-foreground/30")} />
                            <span className="truncate">{o}</span>
                          </button>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </ScrollArea>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg px-4 pt-6 pb-4 flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight shrink-0">{t("recipes")}</h1>
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("searchRecipes")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-secondary border-0"
              />
            </div>
            <div className="flex items-center shrink-0">
              <Button variant="ghost" size="icon" onClick={() => setAddOpen(true)}>
                <Plus className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
                <Settings className="h-5 w-5" />
              </Button>
            </div>
          </header>
          <main className="px-4 pb-6">
            {isLoading ? loadingState : sorted.length === 0 ? emptyState : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
                {sorted.map((recipe) => (
                  <RecipeContextMenu key={recipe.id} recipe={recipe}>
                    <div><RecipeGridCard recipe={recipe} /></div>
                  </RecipeContextMenu>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      <AddRecipeDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
