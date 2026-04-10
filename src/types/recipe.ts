export interface Ingredient {
  quantity?: string;
  unit?: string;
  name: string;
  notes?: string;
}

export interface Instruction {
  step: number;
  text: string;
  section?: string;
}

export interface Recipe {
  id: string;
  created_at: string;
  title: string;
  description: string | null;
  source_url: string | null;
  image_url: string | null;
  servings: string | null;
  prep_time: string | null;
  cook_time: string | null;
  total_time: string | null;
  ingredients: Ingredient[];
  instructions: Instruction[];
  cuisine: string[] | null;
  complexity: string | null;
  diet: string | null;
  tags: string[] | null;
  rating: number | null;
  source_domain: string | null;
}
