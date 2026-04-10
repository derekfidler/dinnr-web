import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock, Users, Star, X, CookingPot, Circle, CheckCircle2, CalendarPlus, MoreVertical, Pencil, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import type { Recipe, Ingredient, Instruction } from "@/types/recipe";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { RecipeEditor } from "@/components/RecipeEditor";
import { convertIngredient, type UnitSystem } from "@/lib/unitConversion";
import { categorizeItem } from "@/lib/groceryCategories";
import { useTranslation } from "@/lib/i18n";
import { trackPageView, trackCookModeStarted, trackGroceryItemAdded, trackMealPlanCreated } from "@/lib/analytics";

export default function RecipeDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [focusedStep, setFocusedStep] = useState<number | null>(null);
  const [cookingMode, setCookingMode] = useState(false);
  const [selectedIngredients, setSelectedIngredients] = useState<Set<number>>(new Set());
  const [editedQuantities, setEditedQuantities] = useState<Record<number, string>>({});
  const [groceryDrawerOpen, setGroceryDrawerOpen] = useState(false);
  const [planDrawerOpen, setPlanDrawerOpen] = useState(false);
  const [selectedPlanDate, setSelectedPlanDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [selectedMealType, setSelectedMealType] = useState<string>("dinner");
  const [menuDrawerOpen, setMenuDrawerOpen] = useState(false);
  const [isRedownloading, setIsRedownloading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("original");
  const [servingMultiplier, setServingMultiplier] = useState<number>(1);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => { trackPageView("recipe"); }, []);

  useEffect(() => {
    if (cookingMode) trackCookModeStarted();
  }, [cookingMode]);

  const { data: recipe, isLoading } = useQuery({
    queryKey: ["recipe", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as Recipe;
    },
    enabled: !!id,
  });

  const ratingMutation = useMutation({
    mutationFn: async (rating: number) => {
      const { error } = await supabase.from("recipes").update({ rating }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipe", id] });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  const addToGroceriesMutation = useMutation({
    mutationFn: async (items: { name: string; quantity?: string; qualifier?: string }[]) => {
      const rows = items.map((item) => ({
        name: item.name,
        quantity: item.quantity || null,
        qualifier: item.qualifier || null,
        recipe_name: recipe?.title || null,
        section: categorizeItem(item.name),
        user_id: user?.id,
      }));
      const { error } = await supabase.from("grocery_items").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      trackGroceryItemAdded("recipe");
      queryClient.invalidateQueries({ queryKey: ["grocery-items"] });
      toast({ title: t("addedToGroceries") });
      setGroceryDrawerOpen(false);
      setSelectedIngredients(new Set());
      setEditedQuantities({});
    },
  });

  const addToPlanMutation = useMutation({
    mutationFn: async ({ date, meal_type }: { date: string; meal_type: string }) => {
      const { error } = await supabase.from("meal_plans").insert({
        recipe_id: id!,
        date,
        meal_type,
        user_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      trackMealPlanCreated(variables.meal_type);
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
      toast({ title: t("addedToPlanner") });
      setPlanDrawerOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("recipes").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      toast({ title: t("recipeDeleted") });
      navigate("/");
    },
  });

  const handleRedownload = async () => {
    if (!recipe?.source_url) {
      toast({ title: t("noSourceUrl"), description: t("noSourceUrlDesc"), variant: "destructive" });
      return;
    }
    setIsRedownloading(true);
    setMenuDrawerOpen(false);
    try {
      const { data, error } = await supabase.functions.invoke("extract-recipe", {
        body: { url: recipe.source_url, user_id: user?.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await supabase.from("recipes").delete().eq("id", id!);
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      toast({ title: t("recipeRedownloaded"), description: data.recipe?.title });
      navigate(`/recipe/${data.recipe.id}`);
    } catch (err) {
      toast({ title: t("redownloadFailed"), description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" });
    } finally {
      setIsRedownloading(false);
    }
  };

  const toggleIngredientSelection = (index: number) => {
    setSelectedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-muted-foreground">
        {t("loading")}
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="flex items-center justify-center min-h-screen text-muted-foreground">
        {t("recipeNotFound")}
      </div>
    );
  }

  const ingredients = (recipe.ingredients || []) as Ingredient[];
  const instructions = (recipe.instructions || []) as Instruction[];

  const parseFraction = (str: string): number | null => {
    const trimmed = str.trim();
    // Handle mixed numbers like "1 1/2"
    const mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixedMatch) {
      return parseInt(mixedMatch[1]) + parseInt(mixedMatch[2]) / parseInt(mixedMatch[3]);
    }
    // Handle simple fractions like "1/2"
    const fracMatch = trimmed.match(/^(\d+)\/(\d+)$/);
    if (fracMatch) {
      return parseInt(fracMatch[1]) / parseInt(fracMatch[2]);
    }
    // Handle decimals
    const num = parseFloat(trimmed);
    return isNaN(num) ? null : num;
  };

  const formatQuantity = (value: number): string => {
    if (value >= 100) return Math.round(value).toString();
    if (value >= 10) return (Math.round(value * 2) / 2).toString();
    if (value >= 1) return (Math.round(value * 4) / 4).toString();
    return parseFloat(value.toFixed(2)).toString();
  };

  const getConvertedIngredient = (ing: Ingredient) => {
    const converted = convertIngredient(ing.quantity, ing.unit, unitSystem);
    if (converted.quantity && servingMultiplier !== 1) {
      const num = parseFraction(converted.quantity);
      if (num !== null) {
        converted.quantity = formatQuantity(num * servingMultiplier);
      }
    }
    return { ...ing, quantity: converted.quantity, unit: converted.unit };
  };

  const MULTIPLIER_OPTIONS = [
    { value: 0.25, label: "¼×" },
    { value: 1/3, label: "⅓×" },
    { value: 0.5, label: "½×" },
    { value: 2/3, label: "⅔×" },
    { value: 0.75, label: "¾×" },
    { value: 1, label: "1×" },
    { value: 1.5, label: "1.5×" },
    { value: 2, label: "2×" },
    { value: 2.5, label: "2.5×" },
    { value: 3, label: "3×" },
    { value: 4, label: "4×" },
  ];

  const servingSelect = (
    <Select
      value={servingMultiplier.toString()}
      onValueChange={(v) => setServingMultiplier(parseFloat(v))}
    >
      <SelectTrigger className="w-[72px] h-8 text-xs bg-secondary border-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-[70]">
        {MULTIPLIER_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value.toString()}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const unitToggle = (
    <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
      {(["original", "metric", "imperial"] as const).map((sys) => (
        <button
          key={sys}
          onClick={() => setUnitSystem(sys)}
          className={cn(
            "px-2.5 py-1 text-xs rounded-md capitalize transition-colors",
            unitSystem === sys
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {sys}
        </button>
      ))}
    </div>
  );

  // Shared sub-components
  const titleBlock = (
    <>
      <h1 className="text-3xl font-bold mb-3">{recipe.title}</h1>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3 flex-wrap">
        {recipe.source_domain && (
          <>
            <a href={recipe.source_url!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">📄 {recipe.source_domain}</a>
            <span className="text-border">|</span>
          </>
        )}
        {recipe.servings && (
          <>
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {recipe.servings}
            </span>
            <span className="text-border">|</span>
          </>
        )}
        {recipe.prep_time && (
          <>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {recipe.prep_time} <span className="text-xs uppercase">Prep</span>
            </span>
          </>
        )}
        {recipe.cook_time && (
          <>
            <span className="flex items-center gap-1">
              {recipe.cook_time} <span className="text-xs uppercase">Cook</span>
            </span>
          </>
        )}
        {recipe.total_time && (
          <>
            <span className="flex items-center gap-1">
              {recipe.total_time} <span className="text-xs uppercase">Total</span>
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3 mb-4">
        <Button
          variant="secondary"
          size="sm"
          className="gap-2"
          onClick={() => { setCookingMode(true); setFocusedStep(null); }}
        >
          <CookingPot className="h-4 w-4" />
          {t("cook")}
        </Button>
        <Drawer open={groceryDrawerOpen} onOpenChange={(open) => {
          setGroceryDrawerOpen(open);
          if (!open) { setSelectedIngredients(new Set()); setEditedQuantities({}); }
        }}>
          <DrawerTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-2">
              🛒 {t("groceries")}
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <div className="flex items-start justify-between px-4 pt-4 pb-2">
              <div>
                <h3 className="text-lg font-semibold">{t("addToGroceries")}</h3>
                <p className="text-sm text-muted-foreground">{t("selectIngredientsToAdd")}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary shrink-0"
                onClick={() => {
                  if (selectedIngredients.size === ingredients.length) {
                    setSelectedIngredients(new Set());
                  } else {
                    setSelectedIngredients(new Set(ingredients.map((_, i) => i)));
                  }
                }}
              >
                {selectedIngredients.size === ingredients.length ? t("deselectAll") : t("selectAll")}
              </Button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {ingredients.map((ing, i) => {
                const converted = getConvertedIngredient(ing);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-3 border-b border-border/50 cursor-pointer"
                    onClick={() => toggleIngredientSelection(i)}
                  >
                    <div
                      className="shrink-0 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); toggleIngredientSelection(i); }}
                    >
                      {selectedIngredients.has(i) ? (
                        <CheckCircle2 className="h-6 w-6 text-primary" />
                      ) : (
                        <Circle className="h-6 w-6 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block text-base">{converted.name}</span>
                      <input
                        type="text"
                        className="text-sm text-primary bg-transparent border-b border-border/50 focus:border-primary outline-none w-full mt-0.5"
                        value={editedQuantities[i] ?? [converted.quantity, converted.unit].filter(Boolean).join(" ")}
                        onChange={(e) => setEditedQuantities((prev) => ({ ...prev, [i]: e.target.value }))}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={t("quantity")}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-4">
              <Button
                className="w-full"
                disabled={selectedIngredients.size === 0}
                onClick={() => {
                  const items = Array.from(selectedIngredients).map((i) => {
                    const ing = ingredients[i];
                    const converted = getConvertedIngredient(ing);
                    const qty = editedQuantities[i] ?? [converted.quantity, converted.unit].filter(Boolean).join(" ");
                    return { name: ing.name, quantity: qty || undefined, qualifier: ing.notes || undefined };
                  });
                  addToGroceriesMutation.mutate(items);
                }}
              >
                Add {selectedIngredients.size > 0 ? `${selectedIngredients.size} ` : ""}{t("ingredients").toLowerCase()}
              </Button>
            </div>
          </DrawerContent>
        </Drawer>
        <Drawer open={planDrawerOpen} onOpenChange={setPlanDrawerOpen}>
          <DrawerTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-2">
              <CalendarPlus className="h-4 w-4" />
              {t("plan")}
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-lg font-semibold">{t("addToPlanner")}</h3>
              <p className="text-sm text-muted-foreground">{t("chooseADayAndMeal")}</p>
            </div>
            <div className="px-4 py-3 space-y-4">
              <div>
                <Calendar
                  mode="single"
                  selected={selectedPlanDate ? new Date(selectedPlanDate + "T00:00:00") : undefined}
                  onSelect={(day) => day && setSelectedPlanDate(format(day, "yyyy-MM-dd"))}
                  weekStartsOn={1}
                  className={cn("p-3 pointer-events-auto mx-auto")}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">{t("meal")}</label>
                <div className="grid grid-cols-4 gap-2">
                  {(["breakfast", "lunch", "dinner", "snack"] as const).map((meal) => (
                    <button
                      key={meal}
                      onClick={() => setSelectedMealType(meal)}
                      className={cn(
                        "rounded-lg py-2 px-1 text-center text-sm capitalize transition-colors border",
                        selectedMealType === meal
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary text-secondary-foreground border-border hover:bg-accent"
                      )}
                    >
                      {meal}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4">
              <Button
                className="w-full"
                onClick={() => addToPlanMutation.mutate({ date: selectedPlanDate, meal_type: selectedMealType })}
                disabled={addToPlanMutation.isPending}
              >
                {t("addToPlanner")}
              </Button>
            </div>
          </DrawerContent>
        </Drawer>
        <div className="flex items-center gap-1 ml-auto">
          {[1, 2, 3, 4, 5].map((star) => (
            <button key={star} onClick={() => ratingMutation.mutate(star)} className="p-0.5">
              <Star
                className={cn(
                  "h-4 w-4 transition-colors",
                  star <= (recipe.rating ?? 0) ? "fill-primary text-primary" : "text-muted-foreground"
                )}
              />
            </button>
          ))}
        </div>
      </div>
      {recipe.description && (
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{recipe.description}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap mb-4">
         {recipe.cuisine?.map((c) => (
          <Badge key={c} variant="secondary" className="capitalize">{c}</Badge>
        ))}
        {recipe.complexity && <Badge variant="secondary" className="capitalize">{recipe.complexity}</Badge>}
        {recipe.diet && <Badge variant="secondary" className="capitalize">{recipe.diet}</Badge>}
        {recipe.tags?.map((tag) => (
          <Badge key={tag} variant="outline" className="capitalize">{tag}</Badge>
        ))}
      </div>
    </>
  );

  const ingredientsList = (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2">
        {unitToggle}
        {servingSelect}
      </div>
      <ul className="space-y-3">
        {ingredients.map((ing, i) => {
          const converted = getConvertedIngredient(ing);
          return (
            <li key={i} className="flex items-baseline gap-2">
              <span className="font-bold text-sm whitespace-nowrap">
                {converted.quantity && `${converted.quantity}`}
                {converted.unit && ` ${converted.unit}`}
              </span>
              <span className="text-sm">{converted.name}</span>
              {converted.notes && (
                <span className="text-sm text-muted-foreground italic">{converted.notes}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  const instructionsList = (
    <div>
      <ol className="space-y-4">
        {instructions.map((inst) => (
          <li key={inst.step}>
            {inst.section && (
              <p className="font-bold text-sm mt-4 mb-2">
                {inst.section}
              </p>
            )}
            <button
              onClick={() => setFocusedStep(focusedStep === inst.step ? null : inst.step)}
              className={cn(
                "text-left w-full flex gap-3 py-2 transition-all",
                focusedStep === null || focusedStep === inst.step ? "opacity-100" : "opacity-30"
              )}
            >
              <span className="text-primary font-bold text-sm shrink-0 mt-0.5">{inst.step}</span>
              <span className="text-sm leading-relaxed">{inst.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );

  return (
    <div className="min-h-screen pb-20">
      {/* Mobile layout */}
      <div className="md:hidden">
        <div className="relative h-72 bg-secondary">
          {recipe.image_url && (
            <img src={recipe.image_url} alt={recipe.title} className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="absolute left-4 bg-background/50 backdrop-blur-sm rounded-full"
            style={{ top: "calc(var(--titlebar-area-height) + 3rem)" }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMenuDrawerOpen(true)}
            className="absolute right-4 bg-background/50 backdrop-blur-sm rounded-full"
            style={{ top: "calc(var(--titlebar-area-height) + 3rem)" }}
          >
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
        <div className="px-4 -mt-12 relative">
          {titleBlock}
          <Tabs defaultValue="ingredients">
            <TabsList className="w-full bg-secondary">
              <TabsTrigger value="ingredients" className="flex-1">{t("ingredients")}</TabsTrigger>
              <TabsTrigger value="instructions" className="flex-1">{t("instructions")}</TabsTrigger>
            </TabsList>
            <TabsContent value="ingredients" className="mt-4">{ingredientsList}</TabsContent>
            <TabsContent value="instructions" className="mt-4">{instructionsList}</TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Desktop two-column layout — breaks out of container to reach right edge */}
      <div className="hidden md:block fixed inset-0 overflow-y-auto z-10 bg-background">
        <div className="grid grid-cols-[1fr,380px] min-h-screen">
          {/* Left: title + instructions */}
          <div
            className="pl-8 pr-10 pb-20"
            style={{ paddingTop: "calc(var(--titlebar-area-height) + 1.5rem)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="rounded-full"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMenuDrawerOpen(true)}
                className="rounded-full"
              >
                <MoreVertical className="h-5 w-5" />
              </Button>
            </div>
            {titleBlock}
            <div className="border-t border-border my-4" />
            {instructionsList}
          </div>
          {/* Right: image + ingredients — flush to right edge */}
          <div className="bg-secondary/50 min-h-screen">
            {recipe.image_url && (
              <img
                src={recipe.image_url}
                alt={recipe.title}
                className="w-full aspect-[4/3] object-cover"
              />
            )}
            <div className="px-6 py-6">
              {ingredientsList}
            </div>
          </div>
        </div>
      </div>

      {/* Cooking Mode Overlay */}
      {cookingMode && (
        <div className="fixed inset-0 z-[60] bg-card flex flex-col">
          {/* Mobile cooking mode */}
          <div className="md:hidden flex flex-col h-full">
            <div
              className="flex items-center justify-between px-4 pb-4"
              style={{ paddingTop: "calc(var(--titlebar-area-height) + 3rem)" }}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setCookingMode(false); setFocusedStep(null); }}
                className="rounded-full"
              >
                <X className="h-5 w-5" />
              </Button>
              <h2 className="text-sm font-medium text-muted-foreground">{t("cookingMode")}</h2>
              <div className="w-10" />
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-12">
              <ol className="space-y-6">
                {instructions.map((inst) => (
                  <li key={inst.step}>
                    {inst.section && (
                      <p className="text-primary font-semibold italic text-lg mb-3">
                        {inst.section}
                      </p>
                    )}
                    <button
                      onClick={() =>
                        setFocusedStep(focusedStep === inst.step ? null : inst.step)
                      }
                      className={cn(
                        "text-left w-full flex gap-4 py-4 transition-all duration-300",
                        focusedStep === null || focusedStep === inst.step
                          ? "opacity-100"
                          : "opacity-25"
                      )}
                    >
                      <span className="text-primary font-bold text-lg shrink-0 mt-0.5">
                        {inst.step}
                      </span>
                      <span className="text-base leading-relaxed">{inst.text}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Desktop cooking mode — two-column like Mela */}
          <div className="hidden md:grid grid-cols-[1fr,340px] h-full">
            {/* Left: instructions */}
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between px-6 pt-6 pb-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setCookingMode(false); setFocusedStep(null); }}
                  className="rounded-full"
                >
                  <X className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" className="rounded-full" disabled>
                  <Clock className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-10 pb-16">
                <ol className="space-y-8">
                  {instructions.map((inst) => (
                    <li key={inst.step}>
                      {inst.section && (
                        <p className="text-primary font-semibold italic text-xl mb-4">
                          {inst.section}
                        </p>
                      )}
                      <button
                        onClick={() =>
                          setFocusedStep(focusedStep === inst.step ? null : inst.step)
                        }
                        className={cn(
                          "text-left w-full flex gap-4 py-3 transition-all duration-300",
                          focusedStep === null || focusedStep === inst.step
                            ? "opacity-100"
                            : "opacity-25"
                        )}
                      >
                        <span className="text-primary font-light text-xl shrink-0 mt-0.5">
                          {inst.step}
                        </span>
                        <span className="text-lg leading-relaxed font-medium">{inst.text}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Right: ingredients with grey background */}
            <div className="bg-secondary/50 overflow-y-auto px-6 pt-16 pb-16">
              <div className="mb-4 flex items-center gap-2">{unitToggle}{servingSelect}</div>
              <ul className="space-y-4">
                {ingredients.map((ing, i) => {
                  const converted = getConvertedIngredient(ing);
                  return (
                    <li key={i} className="flex items-baseline gap-2">
                      <span className="text-primary font-bold text-sm whitespace-nowrap">
                        {converted.quantity && `${converted.quantity}`}
                        {converted.unit && ` ${converted.unit}`}
                      </span>
                      <span className="text-sm font-semibold">{converted.name}</span>
                      {converted.notes && (
                        <span className="text-sm text-muted-foreground">{converted.notes}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
      {/* Menu Drawer */}
      <Drawer open={menuDrawerOpen} onOpenChange={setMenuDrawerOpen}>
        <DrawerContent>
          <div className="py-2">
            <button
              onClick={() => { setMenuDrawerOpen(false); setEditorOpen(true); }}
              className="flex items-center gap-3 w-full px-6 py-4 text-left hover:bg-accent transition-colors"
            >
              <Pencil className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">{t("editRecipe")}</span>
            </button>
            <button
              onClick={handleRedownload}
              disabled={isRedownloading || !recipe?.source_url}
              className="flex items-center gap-3 w-full px-6 py-4 text-left hover:bg-accent transition-colors disabled:opacity-50"
            >
              {isRedownloading ? (
                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
              ) : (
                <RefreshCw className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">{t("redownloadRecipe")}</span>
            </button>
            <button
              onClick={() => { setMenuDrawerOpen(false); deleteMutation.mutate(); }}
              className="flex items-center gap-3 w-full px-6 py-4 text-left hover:bg-accent transition-colors text-destructive"
            >
              <Trash2 className="h-5 w-5" />
              <span className="text-sm font-medium">{t("deleteRecipe")}</span>
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Re-downloading overlay */}
      {isRedownloading && (
        <div className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t("redownloading")}</p>
          </div>
        </div>
      )}

      {/* Recipe Editor */}
      <RecipeEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        recipe={recipe}
      />
    </div>
  );
}
