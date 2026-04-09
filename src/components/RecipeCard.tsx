import { Link } from "react-router-dom";
import { Clock, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Recipe } from "@/types/recipe";

interface RecipeCardProps {
  recipe: Recipe;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  return (
    <Link
      to={`/recipe/${recipe.id}`}
      className="flex items-center gap-4 p-3 rounded-xl hover:bg-secondary/50 transition-colors"
    >
      <div className="h-16 w-16 rounded-xl overflow-hidden bg-secondary shrink-0">
        {recipe.image_url ? (
          <img
            src={recipe.image_url}
            alt={recipe.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-2xl">🍽️</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-sm text-foreground truncate">{recipe.title}</h3>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {recipe.cuisine?.map((c) => (
            <Badge key={c} variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
              {c}
            </Badge>
          ))}
          {recipe.complexity && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
              {recipe.complexity}
            </Badge>
          )}
          {recipe.diet && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
              {recipe.diet}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
          {recipe.total_time && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {recipe.total_time}
            </span>
          )}
          {recipe.source_domain && <span>{recipe.source_domain}</span>}
          {(recipe.rating ?? 0) > 0 && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-primary text-primary" />
              {recipe.rating}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
