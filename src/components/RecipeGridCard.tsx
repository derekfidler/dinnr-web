import { Link } from "react-router-dom";
import { Clock, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Recipe } from "@/types/recipe";

interface RecipeGridCardProps {
  recipe: Recipe;
}

export function RecipeGridCard({ recipe }: RecipeGridCardProps) {
  return (
    <Link
      to={`/recipe/${recipe.id}`}
      className="group flex flex-col rounded-xl overflow-hidden hover:ring-2 hover:ring-primary/40 transition-all"
    >
      <div className="aspect-[4/3] bg-secondary overflow-hidden">
        {recipe.image_url ? (
          <img
            src={recipe.image_url}
            alt={recipe.title}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-4xl text-muted-foreground">
            🍽️
          </div>
        )}
      </div>
      <div className="px-1 pt-2 pb-3 space-y-1">
        <h3 className="font-medium text-sm text-foreground line-clamp-2 leading-tight">
          {recipe.title}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {recipe.cuisine?.slice(0, 2).map((c) => (
            <Badge key={c} variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
              {c}
            </Badge>
          ))}
          {recipe.diet && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
              {recipe.diet}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {recipe.total_time && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {recipe.total_time}
            </span>
          )}
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
