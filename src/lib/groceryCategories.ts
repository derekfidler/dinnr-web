export const GROCERY_SECTIONS = [
  "Vegetables",
  "Fruit",
  "Meat",
  "Fish",
  "Vegetarian",
  "Dairy and eggs",
  "Cheese",
  "Bakery",
  "Deli and prepared",
  "Drinks",
  "Pasta, rice, and grains",
  "International",
  "Oils and sauces",
  "Household",
  "Other",
] as const;

export type GrocerySection = (typeof GROCERY_SECTIONS)[number];

const SECTION_KEYWORDS: Record<GrocerySection, string[]> = {
  Vegetables: [
    "onion", "garlic", "tomato", "potato", "carrot", "celery", "pepper",
    "broccoli", "spinach", "kale", "lettuce", "cucumber", "zucchini",
    "squash", "mushroom", "cabbage", "cauliflower", "asparagus", "corn",
    "pea", "bean", "green bean", "eggplant", "artichoke", "leek",
    "shallot", "scallion", "spring onion", "radish", "beet", "turnip",
    "parsnip", "sweet potato", "yam", "ginger", "jalapeño", "jalapeno",
    "chili", "chile", "arugula", "bok choy", "fennel", "okra",
    "snap pea", "snow pea", "watercress", "endive", "radicchio",
    "brussels sprout", "collard", "swiss chard", "chard",
  ],
  Fruit: [
    "apple", "banana", "orange", "lemon", "lime", "grape", "berry",
    "strawberry", "blueberry", "raspberry", "blackberry", "mango",
    "pineapple", "peach", "pear", "plum", "cherry", "watermelon",
    "melon", "cantaloupe", "kiwi", "papaya", "coconut", "fig",
    "pomegranate", "avocado", "grapefruit", "tangerine", "clementine",
    "nectarine", "apricot", "date", "cranberry", "passion fruit",
    "guava", "lychee", "persimmon", "rhubarb",
  ],
  Meat: [
    "chicken", "beef", "pork", "lamb", "turkey", "steak", "ground beef",
    "ground turkey", "ground pork", "ground chicken", "bacon", "sausage",
    "ham", "veal", "bison", "duck", "venison", "ribs", "roast",
    "tenderloin", "drumstick", "thigh", "breast", "wing", "chop",
    "mince", "meatball", "chorizo", "prosciutto", "pancetta",
    "salami", "pepperoni", "hot dog", "bratwurst",
  ],
  Fish: [
    "salmon", "tuna", "shrimp", "prawn", "cod", "tilapia", "halibut",
    "trout", "bass", "catfish", "crab", "lobster", "clam", "mussel",
    "oyster", "scallop", "squid", "calamari", "octopus", "anchovy",
    "sardine", "swordfish", "mahi", "snapper", "mackerel", "fish",
    "seafood", "crawfish", "crayfish",
  ],
  Vegetarian: [
    "tofu", "tempeh", "seitan", "beyond meat", "impossible",
    "plant-based", "veggie burger", "vegetarian", "vegan",
    "meat substitute", "soy protein", "textured vegetable",
    "jackfruit", "nutritional yeast", "edamame",
  ],
  "Dairy and eggs": [
    "milk", "egg", "butter", "cream", "yogurt", "sour cream",
    "cream cheese", "whipping cream", "half and half", "half & half",
    "condensed milk", "evaporated milk", "buttermilk", "ghee",
    "custard", "cottage cheese", "crème fraîche", "creme fraiche",
    "oat milk", "almond milk", "soy milk", "coconut milk",
  ],
  Cheese: [
    "cheese", "cheddar", "mozzarella", "parmesan", "feta", "gouda",
    "brie", "camembert", "gruyere", "swiss cheese", "provolone",
    "ricotta", "mascarpone", "blue cheese", "gorgonzola", "goat cheese",
    "pecorino", "manchego", "havarti", "monterey jack", "colby",
    "american cheese", "queso",
  ],
  Bakery: [
    "bread", "roll", "bun", "bagel", "croissant", "muffin", "baguette",
    "tortilla", "pita", "naan", "flatbread", "ciabatta", "sourdough",
    "brioche", "focaccia", "english muffin", "wrap", "cracker",
    "breadcrumb", "panko", "pizza dough", "pie crust", "pastry",
    "biscuit", "cornbread", "flour tortilla", "corn tortilla",
  ],
  "Deli and prepared": [
    "hummus", "dip", "salsa", "guacamole", "pesto", "rotisserie",
    "prepared", "pre-made", "ready-made", "deli", "coleslaw",
    "potato salad", "macaroni salad", "soup", "broth", "stock",
    "bouillon", "canned", "frozen",
    "chicken broth", "beef broth", "vegetable broth", "chicken stock",
    "beef stock", "bone broth",
  ],
  Drinks: [
    "water", "juice", "soda", "coffee", "tea", "beer", "wine",
    "kombucha", "sparkling", "seltzer", "lemonade", "energy drink",
    "sports drink", "smoothie", "cocoa", "hot chocolate", "espresso",
    "orange juice", "apple juice", "grape juice", "lemon juice", "lime juice",
    "coconut water", "sparkling water",
  ],
  "Pasta, rice, and grains": [
    "pasta", "spaghetti", "penne", "fettuccine", "linguine", "macaroni",
    "rigatoni", "orzo", "lasagna", "noodle", "ramen", "udon", "soba",
    "rice", "quinoa", "couscous", "barley", "oat", "oatmeal", "cereal",
    "granola", "flour", "cornmeal", "polenta", "bulgur", "farro",
    "millet", "buckwheat", "amaranth", "grits", "cornstarch",
    "baking powder", "baking soda", "yeast", "sugar", "brown sugar",
    "powdered sugar", "honey", "maple syrup", "molasses",
    "lentil", "chickpea", "black bean", "kidney bean", "pinto bean",
    "navy bean", "cannellini", "dried bean",
  ],
  International: [
    "soy sauce", "fish sauce", "oyster sauce", "hoisin", "sriracha",
    "sambal", "gochujang", "gochugaru", "miso", "mirin", "sake",
    "rice vinegar", "sesame oil", "tahini", "harissa", "za'atar",
    "zaatar", "sumac", "turmeric", "curry", "garam masala", "cumin",
    "coriander", "cardamom", "star anise", "five spice", "lemongrass",
    "galangal", "tamarind", "wasabi", "nori", "seaweed", "kimchi",
    "chutney", "tandoori", "tikka", "shawarma", "teriyaki",
    "wonton", "dumpling", "spring roll", "rice paper", "coconut cream",
  ],
  "Oils and sauces": [
    "oil", "olive oil", "vegetable oil", "canola oil", "coconut oil",
    "avocado oil", "vinegar", "balsamic", "apple cider vinegar",
    "white vinegar", "red wine vinegar", "ketchup", "mustard",
    "mayonnaise", "mayo", "hot sauce", "bbq sauce", "barbecue sauce",
    "worcestershire", "soy sauce", "tomato sauce", "marinara",
    "alfredo", "ranch", "dressing", "relish", "capers", "pickles",
    "olives", "jam", "jelly", "preserves", "peanut butter",
    "almond butter", "nutella", "syrup", "extract", "vanilla",
    "salt", "pepper", "black pepper", "white pepper", "seasoning", "spice", "paprika", "oregano",
    "basil", "thyme", "rosemary", "sage", "dill", "parsley",
    "cilantro", "mint", "bay leaf", "cinnamon", "nutmeg", "clove",
    "allspice", "chili powder", "cayenne", "red pepper flake",
    "garlic powder", "onion powder", "italian seasoning",
  ],
  Household: [
    "paper towel", "toilet paper", "napkin", "trash bag", "garbage bag",
    "aluminum foil", "foil", "plastic wrap", "saran wrap", "parchment",
    "wax paper", "ziplock", "zip lock", "storage bag", "sponge",
    "dish soap", "detergent", "cleaner", "bleach", "disinfectant",
    "soap", "shampoo", "toothpaste", "deodorant", "tissue",
    "laundry", "dryer sheet", "fabric softener",
  ],
  Other: [],
};

export function categorizeItem(name: string): GrocerySection {
  const lower = name.toLowerCase().trim();

  // Find the section with the longest matching keyword so that more-specific
  // multi-word keywords (e.g. "garlic powder" in Oils) beat shorter keywords
  // that happen to be substrings (e.g. "garlic" in Vegetables).
  let bestSection: GrocerySection = "Other";
  let bestLength = 0;

  for (const section of GROCERY_SECTIONS) {
    if (section === "Other") continue;
    const keywords = SECTION_KEYWORDS[section];
    for (const keyword of keywords) {
      if (lower.includes(keyword) && keyword.length > bestLength) {
        bestSection = section;
        bestLength = keyword.length;
      }
    }
  }

  return bestSection;
}
