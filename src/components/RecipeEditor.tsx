import { useState, useEffect, useRef, useCallback } from "react";
import { X, Plus, Trash2, Star, ChevronRight, Upload, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { Recipe, Ingredient, Instruction } from "@/types/recipe";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslation } from "@/lib/i18n";
import { findDuplicateRecipe } from "@/lib/duplicateCheck";

interface RecipeEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe?: Recipe | null; // null = new recipe
  onSaved?: (recipe: Recipe) => void;
}

const EMPTY_INGREDIENT: Ingredient = { name: "", quantity: "", unit: "", notes: "" };
const EMPTY_INSTRUCTION: Instruction = { step: 1, text: "" };

const COMPLEXITIES = ["easy", "medium", "hard", "expert"];
const DIETS = ["meat", "seafood", "vegetarian", "vegan"];

export function RecipeEditor({ open, onOpenChange, recipe, onSaved }: RecipeEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Duplicate check state
  const [duplicateDialog, setDuplicateDialog] = useState<{
    open: boolean;
    existingName: string;
  }>({ open: false, existingName: "" });
  const [pendingSaveData, setPendingSaveData] = useState<any>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [servings, setServings] = useState("");
  const [totalTime, setTotalTime] = useState("");
  const [complexity, setComplexity] = useState("");
  const [diet, setDiet] = useState("");
  const [rating, setRating] = useState(0);
  const [cuisineText, setCuisineText] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceDomain, setSourceDomain] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ ...EMPTY_INGREDIENT }]);
  const [instructions, setInstructions] = useState<Instruction[]>([{ ...EMPTY_INSTRUCTION }]);

  // Reset form when recipe changes
  useEffect(() => {
    if (open) {
      if (recipe) {
        setTitle(recipe.title || "");
        setDescription(recipe.description || "");
        setImageUrl(recipe.image_url || "");
        setServings(recipe.servings || "");
        setTotalTime(recipe.total_time || "");
        setComplexity(recipe.complexity || "");
        setDiet(recipe.diet || "");
        setRating(recipe.rating || 0);
        setCuisineText(recipe.cuisine?.join(", ") || "");
        setTagsText(recipe.tags?.join(", ") || "");
        setSourceUrl(recipe.source_url || "");
        setSourceDomain(recipe.source_domain || "");
        const ings = (recipe.ingredients || []) as Ingredient[];
        setIngredients(ings.length > 0 ? ings : [{ ...EMPTY_INGREDIENT }]);
        const insts = (recipe.instructions || []) as Instruction[];
        setInstructions(insts.length > 0 ? insts : [{ ...EMPTY_INSTRUCTION }]);
      } else {
        setTitle("");
        setDescription("");
        setImageUrl("");
        setServings("");
        setTotalTime("");
        setComplexity("");
        setDiet("");
        setRating(0);
        setCuisineText("");
        setTagsText("");
        setSourceUrl("");
        setSourceDomain("");
        setIngredients([{ ...EMPTY_INGREDIENT }]);
        setInstructions([{ ...EMPTY_INSTRUCTION }]);
      }
    }
  }, [open, recipe]);

  const uploadImage = useCallback(async (file: File) => {
    if (!user?.id) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image must be under 5MB", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("recipe-images")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from("recipe-images")
        .getPublicUrl(path);
      setImageUrl(publicUrl);
      toast({ title: "Image uploaded" });
    } catch (err) {
      console.error("Upload error:", err);
      toast({ title: "Failed to upload image", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }, [user, toast]);

  // Paste handler for clipboard images
  useEffect(() => {
    if (!open) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) uploadImage(file);
          break;
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [open, uploadImage]);

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    setIngredients((prev) => prev.map((ing, i) => i === index ? { ...ing, [field]: value } : ing));
  };

  const addIngredient = () => {
    setIngredients((prev) => [...prev, { ...EMPTY_INGREDIENT }]);
  };

  const removeIngredient = (index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const updateInstruction = (index: number, value: string) => {
    setInstructions((prev) => prev.map((inst, i) => i === index ? { ...inst, text: value, step: i + 1 } : inst));
  };

  const addInstruction = () => {
    setInstructions((prev) => [...prev, { step: prev.length + 1, text: "" }]);
  };

  const removeInstruction = (index: number) => {
    setInstructions((prev) => prev.filter((_, i) => i !== index).map((inst, i) => ({ ...inst, step: i + 1 })));
  };

  const buildRecipeData = () => {
    const cuisineArr = cuisineText.split(",").map((s) => s.trim()).filter(Boolean);
    const tagsArr = tagsText.split(",").map((s) => s.trim()).filter(Boolean)
      .map((t) => t.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" "));
    const uniqueTags = [...new Set(tagsArr)];

    const validIngredients = ingredients.filter((ing) => ing.name.trim()) as unknown as Record<string, unknown>[];
    const validInstructions = instructions
      .filter((inst) => inst.text.trim())
      .map((inst, i) => ({ ...inst, step: i + 1 })) as unknown as Record<string, unknown>[];

    let domain = sourceDomain;
    if (sourceUrl && !domain) {
      try { domain = new URL(sourceUrl).hostname.replace("www.", ""); } catch {}
    }

    return {
      title: title.trim(),
      description: description.trim() || null,
      image_url: imageUrl.trim() || null,
      servings: servings.trim() || null,
      prep_time: null,
      cook_time: null,
      total_time: totalTime.trim() || null,
      complexity: complexity || null,
      diet: diet || null,
      rating,
      cuisine: cuisineArr.length > 0 ? cuisineArr : null,
      tags: uniqueTags.length > 0 ? uniqueTags : [],
      source_url: sourceUrl.trim() || null,
      source_domain: domain || null,
      ingredients: validIngredients as any,
      instructions: validInstructions as any,
      user_id: user?.id || null,
    } as any;
  };

  const performSave = async (recipeData: any) => {
    setIsSaving(true);
    try {
      if (recipe?.id) {
        const { data, error } = await supabase
          .from("recipes")
          .update(recipeData)
          .eq("id", recipe.id)
          .select()
          .single();
        if (error) throw error;
        toast({ title: "Recipe updated" });
        queryClient.invalidateQueries({ queryKey: ["recipe", recipe.id] });
        queryClient.invalidateQueries({ queryKey: ["recipes"] });
        onSaved?.(data as unknown as Recipe);
      } else {
        const { data, error } = await supabase
          .from("recipes")
          .insert(recipeData)
          .select()
          .single();
        if (error) throw error;
        toast({ title: "Recipe created" });
        queryClient.invalidateQueries({ queryKey: ["recipes"] });
        onSaved?.(data as unknown as Recipe);
      }
      onOpenChange(false);
    } catch (err) {
      console.error("Save error:", err);
      toast({
        title: "Failed to save",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }

    const recipeData = buildRecipeData();

    // For new recipes, check for duplicates
    if (!recipe?.id && user?.id) {
      const duplicate = await findDuplicateRecipe(title.trim(), user.id);
      if (duplicate) {
        setPendingSaveData(recipeData);
        setDuplicateDialog({ open: true, existingName: duplicate });
        return;
      }
    }

    await performSave(recipeData);
  };

  const handleDuplicateConfirm = async () => {
    setDuplicateDialog({ open: false, existingName: "" });
    if (pendingSaveData) {
      await performSave(pendingSaveData);
      setPendingSaveData(null);
    }
  };

  const handleDuplicateCancel = () => {
    setDuplicateDialog({ open: false, existingName: "" });
    setPendingSaveData(null);
  };

  const formContent = (
    <div className="flex flex-col h-full">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadImage(file);
          e.target.value = "";
        }}
      />
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving}>
          Cancel
        </Button>
        <h2 className="text-sm font-semibold">{recipe ? "Edit Recipe" : "New Recipe"}</h2>
        <Button variant="ghost" size="sm" onClick={handleSave} disabled={isSaving} className="text-primary font-semibold">
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Mobile layout */}
        <div className="md:hidden">
          {/* Title */}
          <div className="px-4 py-3 border-b border-border">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Recipe Title"
              className="text-lg font-bold border-0 bg-transparent p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground"
            />
          </div>

          {/* Photo + Image URL */}
          <div className="px-4 py-3 border-b border-border space-y-2">
            <p className="text-sm font-medium">Photo</p>
            <div className="flex items-center gap-3">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="h-20 w-20 object-cover rounded shrink-0" />
              ) : (
                <div className="h-20 w-20 bg-secondary rounded flex items-center justify-center text-muted-foreground shrink-0">
                  <Image className="h-6 w-6" />
                </div>
              )}
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="gap-1.5 w-full"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {isUploading ? "Uploading..." : "Upload Image"}
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">or paste from clipboard</p>
              </div>
            </div>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Or paste image URL..."
              className="text-sm"
            />
          </div>

          {/* Rating */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-medium">Rating</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} onClick={() => setRating(star === rating ? 0 : star)} className="p-0.5">
                  <Star className={cn("h-5 w-5", star <= rating ? "fill-primary text-primary" : "text-muted-foreground")} />
                </button>
              ))}
            </div>
          </div>

          {/* Info row */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-medium">Info</span>
            <div className="flex items-center gap-2 flex-1 ml-4 overflow-hidden">
              <Input value={servings} onChange={(e) => setServings(e.target.value)} placeholder="Servings" className="text-sm h-8 flex-1" />
              <Input value={totalTime} onChange={(e) => setTotalTime(e.target.value)} placeholder="Total Time" className="text-sm h-8 flex-1" />
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground ml-1 shrink-0" />
          </div>

          {/* Categories row */}
          <div className="px-4 py-3 border-b border-border space-y-2">
            <span className="text-sm font-medium">Categories</span>
            <div className="grid grid-cols-2 gap-2">
              <Select value={complexity} onValueChange={setComplexity}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Difficulty" /></SelectTrigger>
                <SelectContent>
                  {COMPLEXITIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={diet} onValueChange={setDiet}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Diet" /></SelectTrigger>
                <SelectContent>
                  {DIETS.map((d) => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input value={cuisineText} onChange={(e) => setCuisineText(e.target.value)} placeholder="Cuisine (comma separated)" className="text-sm h-8" />
            <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Tags (comma separated)" className="text-sm h-8" />
          </div>

          {/* Description */}
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Description</p>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Recipe description..."
              className="min-h-[60px] text-sm bg-secondary/50 border-0"
            />
          </div>

          {/* Ingredients */}
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Ingredients</p>
            <div className="space-y-2">
              {ingredients.map((ing, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={ing.quantity || ""}
                    onChange={(e) => updateIngredient(i, "quantity", e.target.value)}
                    placeholder="Qty"
                    className="w-16 text-sm h-8"
                  />
                  <Input
                    value={ing.unit || ""}
                    onChange={(e) => updateIngredient(i, "unit", e.target.value)}
                    placeholder="Unit"
                    className="w-16 text-sm h-8"
                  />
                  <Input
                    value={ing.name}
                    onChange={(e) => updateIngredient(i, "name", e.target.value)}
                    placeholder="Ingredient"
                    className="flex-1 text-sm h-8"
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeIngredient(i)}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={addIngredient} className="gap-1 text-primary">
                <Plus className="h-3.5 w-3.5" /> Add Ingredient
              </Button>
            </div>
          </div>

          {/* Instructions */}
          <div className="px-4 py-3 pb-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Directions</p>
            <div className="space-y-2">
              {instructions.map((inst, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-primary font-bold text-sm mt-2 shrink-0">{i + 1}</span>
                  <Textarea
                    value={inst.text}
                    onChange={(e) => updateInstruction(i, e.target.value)}
                    placeholder="Step description..."
                    className="flex-1 text-sm min-h-[60px] bg-secondary/50 border-0"
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 mt-1" onClick={() => removeInstruction(i)}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={addInstruction} className="gap-1 text-primary">
                <Plus className="h-3.5 w-3.5" /> Add Step
              </Button>
            </div>
          </div>
        </div>

        {/* Desktop layout — two-column like screenshots */}
        <div className="hidden md:block">
          {/* Top metadata row */}
          <div className="border-b border-border">
            <div className="flex items-start gap-4 p-4">
              {/* Image thumbnail + upload */}
              <div className="shrink-0 flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="relative group"
                >
                  {imageUrl ? (
                    <img src={imageUrl} alt="" className="h-16 w-16 object-cover rounded" />
                  ) : (
                    <div className="h-16 w-16 bg-secondary rounded flex items-center justify-center text-muted-foreground">
                      <Image className="h-5 w-5" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Upload className="h-4 w-4 text-white" />
                  </div>
                </button>
                <span className="text-[10px] text-muted-foreground">{isUploading ? "Uploading..." : "Click or paste"}</span>
              </div>

              {/* Title + metadata */}
              <div className="flex-1 space-y-2">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Recipe Title"
                  className="text-base font-bold border-0 bg-transparent p-0 h-auto focus-visible:ring-0"
                />
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Rating</span>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => setRating(star === rating ? 0 : star)} className="p-0">
                        <Star className={cn("h-3.5 w-3.5", star <= rating ? "fill-primary text-primary" : "text-muted-foreground")} />
                      </button>
                    ))}
                  </div>
                  <span className="text-border">|</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Servings</span>
                    <Input value={servings} onChange={(e) => setServings(e.target.value)} placeholder="e.g. 4" className="w-24 h-6 text-xs border-border" />
                  </div>
                  <span className="text-border">|</span>
                  <Select value={complexity} onValueChange={setComplexity}>
                    <SelectTrigger className="w-28 h-6 text-xs"><SelectValue placeholder="Difficulty" /></SelectTrigger>
                    <SelectContent>
                      {COMPLEXITIES.map((c) => <SelectItem key={c} value={c} className="capitalize text-xs">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={diet} onValueChange={setDiet}>
                    <SelectTrigger className="w-28 h-6 text-xs"><SelectValue placeholder="Diet" /></SelectTrigger>
                    <SelectContent>
                      {DIETS.map((d) => <SelectItem key={d} value={d} className="capitalize text-xs">{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Total Time</span>
                    <Input value={totalTime} onChange={(e) => setTotalTime(e.target.value)} placeholder="e.g. 45 min" className="w-28 h-6 text-xs border-border" />
                  </div>
                  <span className="text-border">|</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Source</span>
                    <Input value={sourceDomain} onChange={(e) => setSourceDomain(e.target.value)} placeholder="domain" className="w-32 h-6 text-xs border-border" />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Source URL</span>
                    <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." className="w-64 h-6 text-xs border-border" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Image URL</span>
                    <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className="w-80 h-6 text-xs border-border" />
                  </div>
                </div>
              </div>

              {/* Categories button area */}
              <div className="shrink-0 space-y-2">
                <Input value={cuisineText} onChange={(e) => setCuisineText(e.target.value)} placeholder="Cuisine (comma sep.)" className="w-48 h-7 text-xs" />
                <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Tags (comma sep.)" className="w-48 h-7 text-xs" />
              </div>
            </div>
          </div>

          {/* Two-column: Ingredients + Nutrition | Description + Directions */}
          <div className="grid grid-cols-[280px,1fr] min-h-[400px]">
            {/* Left column — Ingredients */}
            <div className="border-r border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-secondary/80 px-2 py-1 rounded mb-3">Ingredients</p>
              <div className="space-y-1.5">
                {ingredients.map((ing, i) => (
                  <div key={i} className="flex items-center gap-1 group">
                    <Input value={ing.quantity || ""} onChange={(e) => updateIngredient(i, "quantity", e.target.value)} placeholder="Qty" className="w-12 h-6 text-xs px-1 border-border" />
                    <Input value={ing.unit || ""} onChange={(e) => updateIngredient(i, "unit", e.target.value)} placeholder="Unit" className="w-12 h-6 text-xs px-1 border-border" />
                    <Input value={ing.name} onChange={(e) => updateIngredient(i, "name", e.target.value)} placeholder="Ingredient" className="flex-1 h-6 text-xs px-1 border-border" />
                    <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => removeIngredient(i)}>
                      <X className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={addIngredient} className="gap-1 text-primary text-xs h-6">
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
            </div>

            {/* Right column — Description + Directions */}
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-secondary/80 px-2 py-1 rounded mb-2">Description</p>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Recipe description..."
                  className="min-h-[40px] text-sm border-0 bg-transparent p-0 focus-visible:ring-0"
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-secondary/80 px-2 py-1 rounded mb-2">Directions</p>
                <div className="space-y-2">
                  {instructions.map((inst, i) => (
                    <div key={i} className="flex items-start gap-2 group">
                      <span className="text-primary font-bold text-xs mt-2 shrink-0 w-4 text-right">{i + 1}</span>
                      <Textarea
                        value={inst.text}
                        onChange={(e) => updateInstruction(i, e.target.value)}
                        placeholder="Step description..."
                        className="flex-1 text-sm min-h-[40px] border-0 bg-transparent p-0 focus-visible:ring-0"
                      />
                      <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 mt-1" onClick={() => removeInstruction(i)}>
                        <X className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" onClick={addInstruction} className="gap-1 text-primary text-xs h-6">
                    <Plus className="h-3 w-3" /> Add Step
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const duplicateAlertDialog = (
    <AlertDialog open={duplicateDialog.open} onOpenChange={(open) => {
      if (!open) handleDuplicateCancel();
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("duplicateRecipeTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("duplicateRecipeDesc").replace("{name}", duplicateDialog.existingName)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleDuplicateCancel}>
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleDuplicateConfirm}>
            {t("addAnyway")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="h-[95vh] max-h-[95vh] overflow-x-hidden">
            {formContent}
          </DrawerContent>
        </Drawer>
        {duplicateAlertDialog}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-none w-screen h-screen max-h-screen rounded-none border-none p-0 overflow-hidden overflow-x-hidden flex flex-col [&>button]:hidden">
          {formContent}
        </DialogContent>
      </Dialog>
      {duplicateAlertDialog}
    </>
  );
}
