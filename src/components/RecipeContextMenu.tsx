import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ExternalLink, CalendarPlus, Star, Trash2, ShoppingCart } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";
import { categorizeItem } from "@/lib/groceryCategories";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Recipe, Ingredient } from "@/types/recipe";
import { cn } from "@/lib/utils";

interface RecipeContextMenuProps {
  recipe: Recipe;
  children: React.ReactNode;
}

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
const MEAL_EMOJI: Record<string, string> = {
  breakfast: "☀️", lunch: "🍽️", dinner: "🌙", snack: "🍿",
};

export function RecipeContextMenu({ recipe, children }: RecipeContextMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [planDrawerOpen, setPlanDrawerOpen] = useState(false);
  const [groceryDrawerOpen, setGroceryDrawerOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPlanDate, setSelectedPlanDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [selectedMealType, setSelectedMealType] = useState<string>("dinner");
  const [selectedIngredients, setSelectedIngredients] = useState<Set<number>>(new Set());

  const ratingMutation = useMutation({
    mutationFn: async (rating: number) => {
      const { error } = await supabase.from("recipes").update({ rating }).eq("id", recipe.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  const addToPlanMutation = useMutation({
    mutationFn: async ({ date, meal_type }: { date: string; meal_type: string }) => {
      const { error } = await supabase.from("meal_plans").insert({
        recipe_id: recipe.id,
        date,
        meal_type,
        user_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
      toast({ title: t("addedToPlanner") });
      setPlanDrawerOpen(false);
    },
  });

  const addToGroceriesMutation = useMutation({
    mutationFn: async (items: Ingredient[]) => {
      const rows = items.map((item) => ({
        name: item.name,
        quantity: item.quantity || null,
        qualifier: item.notes || null,
        recipe_name: recipe.title,
        section: categorizeItem(item.name),
        user_id: user?.id,
      }));
      const { error } = await supabase.from("grocery_items").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grocery-items"] });
      toast({ title: t("addedToGroceries") });
      setGroceryDrawerOpen(false);
      setSelectedIngredients(new Set());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("recipes").delete().eq("id", recipe.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      toast({ title: t("recipeDeleted") });
    },
  });

  const ingredients = recipe.ingredients || [];

  const handleOpenGroceries = () => {
    const allIdxs = new Set(ingredients.map((_, i) => i));
    setSelectedIngredients(allIdxs);
    setGroceryDrawerOpen(true);
  };

  const toggleIngredient = (idx: number) => {
    setSelectedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => navigate(`/recipe/${recipe.id}`)}>
            <ArrowRight className="h-4 w-4 mr-2" />
            {t("openRecipe")}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => {
            if (window.electronAPI?.isElectron) {
              window.electronAPI.openRecipeWindow(recipe.id);
            } else {
              window.open(`/recipe/${recipe.id}`, "_blank");
            }
          }}>
            <ExternalLink className="h-4 w-4 mr-2" />
            {t("openInNewWindow")}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setPlanDrawerOpen(true)}>
            <CalendarPlus className="h-4 w-4 mr-2" />
            {t("addToPlanner")}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Star className="h-4 w-4 mr-2" />
              {t("rateRecipe")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {[1, 2, 3, 4, 5].map((rating) => (
                <ContextMenuItem
                  key={rating}
                  onClick={() => ratingMutation.mutate(rating)}
                >
                  <span className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          "h-3.5 w-3.5",
                          i < rating ? "fill-primary text-primary" : "text-muted-foreground/30"
                        )}
                      />
                    ))}
                  </span>
                </ContextMenuItem>
              ))}
              {(recipe.rating ?? 0) > 0 && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => ratingMutation.mutate(0)}>
                    {t("clearRating")}
                  </ContextMenuItem>
                </>
              )}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem onClick={handleOpenGroceries}>
            <ShoppingCart className="h-4 w-4 mr-2" />
            {t("addToGroceries")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => setDeleteDialogOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t("deleteRecipe")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Plan Drawer */}
      <Drawer open={planDrawerOpen} onOpenChange={setPlanDrawerOpen}>
        <DrawerContent>
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-lg font-semibold">{t("addToPlanner")}</h3>
            <p className="text-sm text-muted-foreground">{recipe.title}</p>
          </div>
          <div className="px-4 pb-4 space-y-4">
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={new Date(selectedPlanDate + "T00:00:00")}
                onSelect={(date) => date && setSelectedPlanDate(format(date, "yyyy-MM-dd"))}
                weekStartsOn={1}
              />
            </div>
            <Select value={selectedMealType} onValueChange={setSelectedMealType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEAL_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {MEAL_EMOJI[type]} <span className="capitalize">{type}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="w-full"
              onClick={() => addToPlanMutation.mutate({ date: selectedPlanDate, meal_type: selectedMealType })}
            >
              {t("addToPlanner")}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Grocery Drawer */}
      <Drawer open={groceryDrawerOpen} onOpenChange={setGroceryDrawerOpen}>
        <DrawerContent>
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-lg font-semibold">{t("addToGroceries")}</h3>
            <p className="text-sm text-muted-foreground">{recipe.title}</p>
          </div>
          <div className="px-4 pb-2 flex items-center justify-between">
            <button
              className="text-sm text-primary font-medium"
              onClick={() => setSelectedIngredients(new Set(ingredients.map((_, i) => i)))}
            >
              {t("selectAll")}
            </button>
            <button
              className="text-sm text-muted-foreground font-medium"
              onClick={() => setSelectedIngredients(new Set())}
            >
              {t("deselectAll")}
            </button>
          </div>
          <div className="max-h-[40vh] overflow-y-auto px-4">
            {ingredients.map((ing, idx) => (
              <label
                key={idx}
                className="flex items-center gap-3 py-2 border-b border-border/50 cursor-pointer"
              >
                <Checkbox
                  checked={selectedIngredients.has(idx)}
                  onCheckedChange={() => toggleIngredient(idx)}
                />
                <span className="text-sm">
                  {ing.quantity && <span className="font-medium">{ing.quantity} </span>}
                  {ing.unit && <span>{ing.unit} </span>}
                  {ing.name}
                </span>
              </label>
            ))}
          </div>
          <div className="p-4">
            <Button
              className="w-full"
              disabled={selectedIngredients.size === 0}
              onClick={() => {
                const items = [...selectedIngredients].map((i) => ingredients[i]);
                addToGroceriesMutation.mutate(items);
              }}
            >
              {t("addItemsToGroceries").replace("{count}", String(selectedIngredients.size))}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteRecipe")}?</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteRecipeConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
