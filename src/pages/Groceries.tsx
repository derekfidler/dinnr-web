import { useState, useEffect } from "react";
import { Plus, Trash2, CheckCircle2, Circle, MoreVertical, Trash, CheckCheck, ChevronDown } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { trackPageView, trackGroceryItemAdded } from "@/lib/analytics";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { GROCERY_SECTIONS, categorizeItem, type GrocerySection } from "@/lib/groceryCategories";

interface GroceryItem {
  id: string;
  name: string;
  quantity: string | null;
  qualifier: string | null;
  recipe_name: string | null;
  section: string | null;
  completed: boolean;
  created_at: string;
}

function AddItemForm({ onAdd }: { onAdd: (name: string, quantity?: string, qualifier?: string) => void }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const { t } = useTranslation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), quantity.trim() || undefined);
    setName("");
    setQuantity("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 px-4 py-3 border-b border-border">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("itemName")}
        className="flex-1 bg-transparent border-none shadow-none focus-visible:ring-0 text-base px-0"
      />
      <Input
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        placeholder={t("qty")}
        className="w-20 bg-transparent border-none shadow-none focus-visible:ring-0 text-base px-0 text-primary"
      />
      <Button type="submit" size="icon" variant="ghost" disabled={!name.trim()}>
        <Plus className="h-5 w-5" />
      </Button>
    </form>
  );
}

function GroceryItemRow({
  item,
  onToggle,
  onDelete,
}: {
  item: GroceryItem;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-border/50 group cursor-pointer"
      onClick={() => onToggle(item.id, !item.completed)}
    >
      {item.completed ? (
        <CheckCircle2 className="h-6 w-6 text-primary shrink-0" />
      ) : (
        <Circle className="h-6 w-6 text-muted-foreground/40 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            "block text-base",
            item.completed && "line-through text-muted-foreground"
          )}
        >
          {item.name}
          {item.qualifier && (
            <span className="italic text-muted-foreground ml-1">{item.qualifier}</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {item.quantity && (
            <span className={cn("text-sm text-primary", item.completed && "text-muted-foreground")}>
              {item.quantity}
            </span>
          )}
          {item.recipe_name && (
            <span className={cn("text-xs text-muted-foreground", item.completed && "line-through")}>
              {item.quantity ? "·" : ""} {item.recipe_name}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(item.id);
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function SectionGroup({
  section,
  items,
  onToggle,
  onDelete,
}: {
  section: string;
  items: GroceryItem[];
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const completedCount = items.filter((i) => i.completed).length;

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full px-4 py-2.5 bg-secondary/50 sticky top-0 z-10"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{section}</span>
          <span className="text-xs text-muted-foreground">
            {completedCount > 0 ? `${completedCount}/` : ""}{items.length}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            collapsed && "-rotate-90"
          )}
        />
      </button>
      {!collapsed && (
        <div>
          {items.map((item) => (
            <GroceryItemRow
              key={item.id}
              item={item}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Groceries() {
  const { t } = useTranslation();
  const [showAdd, setShowAdd] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => { trackPageView("grocery"); }, []);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["grocery-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grocery_items")
        .select("*")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return data as unknown as GroceryItem[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase
        .from("grocery_items")
        .update({ completed })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: ["grocery-items"] });
      const prev = queryClient.getQueryData<GroceryItem[]>(["grocery-items"]);
      queryClient.setQueryData<GroceryItem[]>(["grocery-items"], (old) =>
        old?.map((i) => (i.id === id ? { ...i, completed } : i))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(["grocery-items"], ctx?.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["grocery-items"] }),
  });

  const addMutation = useMutation({
    mutationFn: async ({ name, quantity, qualifier }: { name: string; quantity?: string; qualifier?: string }) => {
      const section = categorizeItem(name);
      const { error } = await supabase
        .from("grocery_items")
        .insert({ name, quantity: quantity || null, qualifier: qualifier || null, section, user_id: user?.id });
      if (error) throw error;
    },
    onSuccess: () => trackGroceryItemAdded("manual"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["grocery-items"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("grocery_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["grocery-items"] }),
  });

  const clearCompletedMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("grocery_items").delete().eq("completed", true);
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["grocery-items"] }),
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("grocery_items").delete().gt("created_at", "1970-01-01T00:00:00Z");
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["grocery-items"] }),
  });

  const [drawerOpen, setDrawerOpen] = useState(false);

  // Group items by section, maintaining the defined order
  const groupedSections = GROCERY_SECTIONS
    .map((section) => ({
      section,
      items: items.filter((item) => (item.section || "Other") === section),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-6 pb-2">
        <h1 className="text-3xl font-bold tracking-tight">{t("groceries")}</h1>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-5 w-5" />
          </Button>
          <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <div className="py-4 pb-8">
                <button
                  className="flex items-center gap-3 w-full px-6 py-4 text-left text-base hover:bg-secondary/50 transition-colors"
                  onClick={() => {
                    clearCompletedMutation.mutate();
                    setDrawerOpen(false);
                  }}
                >
                  <CheckCheck className="h-5 w-5 text-primary" />
                  {t("clearPurchased")}
                </button>
                <button
                  className="flex items-center gap-3 w-full px-6 py-4 text-left text-base hover:bg-secondary/50 transition-colors text-destructive"
                  onClick={() => {
                    clearAllMutation.mutate();
                    setDrawerOpen(false);
                  }}
                >
                  <Trash className="h-5 w-5" />
                  {t("clearAll")}
                </button>
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </div>

      {/* Add item form */}
      {showAdd && (
        <AddItemForm
          onAdd={(name, quantity, qualifier) => {
            addMutation.mutate({ name, quantity, qualifier });
          }}
        />
      )}

      {/* Sectioned list */}
      <div>
        {groupedSections.map((group) => (
          <SectionGroup
            key={group.section}
            section={group.section}
            items={group.items}
            onToggle={(id, completed) => toggleMutation.mutate({ id, completed })}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        ))}
      </div>

      {/* Empty state */}
      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p className="text-lg font-medium">{t("noGroceryItems")}</p>
          <p className="text-sm">{t("tapToAddItems")}</p>
        </div>
      )}
    </div>
  );
}
