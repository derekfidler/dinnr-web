export type UnitSystem = "original" | "metric" | "imperial";

interface ConversionRule {
  from: string[];
  toMetric: { unit: string; factor: number };
  toImperial: { unit: string; factor: number };
  isMetric: boolean;
}

// Units that stay the same regardless of system
const UNIVERSAL_UNITS = new Set([
  "tsp", "teaspoon", "teaspoons",
  "tbsp", "tablespoon", "tablespoons",
  "pinch", "pinches",
  "clove", "cloves",
  "bunch", "bunches",
  "sprig", "sprigs",
  "slice", "slices",
  "piece", "pieces",
  "whole", "large", "medium", "small",
  "can", "cans",
  "package", "packages", "packet", "packets",
  "stick", "sticks",
  "head", "heads",
  "stalk", "stalks",
  "leaf", "leaves",
  "dash", "dashes",
  "drop", "drops",
]);

const CONVERSION_RULES: ConversionRule[] = [
  // Weight: imperial → metric
  {
    from: ["lb", "lbs", "pound", "pounds"],
    toMetric: { unit: "g", factor: 453.592 },
    toImperial: { unit: "lb", factor: 1 },
    isMetric: false,
  },
  {
    from: ["oz", "ounce", "ounces"],
    toMetric: { unit: "g", factor: 28.3495 },
    toImperial: { unit: "oz", factor: 1 },
    isMetric: false,
  },
  // Weight: metric → imperial
  {
    from: ["g", "gram", "grams"],
    toMetric: { unit: "g", factor: 1 },
    toImperial: { unit: "oz", factor: 0.035274 },
    isMetric: true,
  },
  {
    from: ["kg", "kilogram", "kilograms"],
    toMetric: { unit: "kg", factor: 1 },
    toImperial: { unit: "lb", factor: 2.20462 },
    isMetric: true,
  },
  // Volume: imperial → metric
  {
    from: ["fl oz", "fluid ounce", "fluid ounces", "fl. oz", "fl. oz."],
    toMetric: { unit: "ml", factor: 29.5735 },
    toImperial: { unit: "fl oz", factor: 1 },
    isMetric: false,
  },
  {
    from: ["cup", "cups"],
    toMetric: { unit: "ml", factor: 236.588 },
    toImperial: { unit: "cup", factor: 1 },
    isMetric: false,
  },
  {
    from: ["quart", "quarts", "qt"],
    toMetric: { unit: "ml", factor: 946.353 },
    toImperial: { unit: "quart", factor: 1 },
    isMetric: false,
  },
  {
    from: ["pint", "pints", "pt"],
    toMetric: { unit: "ml", factor: 473.176 },
    toImperial: { unit: "pint", factor: 1 },
    isMetric: false,
  },
  {
    from: ["gallon", "gallons", "gal"],
    toMetric: { unit: "L", factor: 3.78541 },
    toImperial: { unit: "gallon", factor: 1 },
    isMetric: false,
  },
  // Volume: metric → imperial
  {
    from: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"],
    toMetric: { unit: "ml", factor: 1 },
    toImperial: { unit: "fl oz", factor: 0.033814 },
    isMetric: true,
  },
  {
    from: ["l", "liter", "liters", "litre", "litres"],
    toMetric: { unit: "L", factor: 1 },
    toImperial: { unit: "quart", factor: 1.05669 },
    isMetric: true,
  },
  {
    from: ["dl", "deciliter", "deciliters"],
    toMetric: { unit: "dl", factor: 1 },
    toImperial: { unit: "fl oz", factor: 3.3814 },
    isMetric: true,
  },
  // Temperature
  {
    from: ["°f", "fahrenheit", "f"],
    toMetric: { unit: "°C", factor: 0 }, // special handling
    toImperial: { unit: "°F", factor: 0 },
    isMetric: false,
  },
  {
    from: ["°c", "celsius", "c"],
    toMetric: { unit: "°C", factor: 0 },
    toImperial: { unit: "°F", factor: 0 },
    isMetric: true,
  },
];

function findRule(unit: string): ConversionRule | null {
  const lower = unit.toLowerCase().trim();
  return CONVERSION_RULES.find((r) => r.from.includes(lower)) || null;
}

function isUniversalUnit(unit: string): boolean {
  return UNIVERSAL_UNITS.has(unit.toLowerCase().trim());
}

function smartRound(value: number): string {
  if (value >= 100) return Math.round(value).toString();
  if (value >= 10) return (Math.round(value * 2) / 2).toString(); // round to nearest 0.5
  if (value >= 1) return (Math.round(value * 4) / 4).toString(); // round to nearest 0.25
  return parseFloat(value.toFixed(2)).toString();
}

export function convertIngredient(
  quantity: string | undefined,
  unit: string | undefined,
  targetSystem: UnitSystem
): { quantity: string | undefined; unit: string | undefined } {
  if (!quantity || !unit || targetSystem === "original") {
    return { quantity, unit };
  }

  if (isUniversalUnit(unit)) {
    return { quantity, unit };
  }

  const rule = findRule(unit);
  if (!rule) {
    return { quantity, unit };
  }

  const num = parseFloat(quantity);
  if (isNaN(num)) {
    return { quantity, unit };
  }

  // Temperature special handling
  if (rule.from.some((f) => ["°f", "fahrenheit", "f", "°c", "celsius", "c"].includes(f))) {
    if (targetSystem === "metric" && !rule.isMetric) {
      // F → C
      const celsius = (num - 32) * 5 / 9;
      return { quantity: Math.round(celsius).toString(), unit: "°C" };
    }
    if (targetSystem === "imperial" && rule.isMetric) {
      // C → F
      const fahrenheit = (num * 9 / 5) + 32;
      return { quantity: Math.round(fahrenheit).toString(), unit: "°F" };
    }
    return { quantity, unit };
  }

  // Already in target system
  if (targetSystem === "metric" && rule.isMetric) return { quantity, unit };
  if (targetSystem === "imperial" && !rule.isMetric) return { quantity, unit };

  // Convert
  const target = targetSystem === "metric" ? rule.toMetric : rule.toImperial;
  const converted = num * target.factor;

  return {
    quantity: smartRound(converted),
    unit: target.unit,
  };
}
