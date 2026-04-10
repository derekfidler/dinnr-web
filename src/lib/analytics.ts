import posthog from "posthog-js";
import { supabase } from "@/integrations/supabase/client";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string;
// EU data residency — data never leaves EU servers
const POSTHOG_HOST = "https://eu.i.posthog.com";

function getClientType(): "desktop" | "web" {
  if (typeof window !== "undefined" && window.electronAPI?.isElectron) {
    return "desktop";
  }
  return "web";
}

export function initPostHog() {
  if (!POSTHOG_KEY || POSTHOG_KEY.startsWith("phc_replace")) return;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: "https://eu.posthog.com",
    // Only create person profiles for users who have explicitly identified
    // (i.e. logged-in users). Anonymous visitors get no profile — GDPR-friendly.
    person_profiles: "identified_only",
    // We track page views manually per-route
    capture_pageview: false,
    capture_pageleave: false,
    // Do not capture IP address
    ip: false,
    persistence: "localStorage",
  });
}

function capture(event: string, properties?: Record<string, unknown>) {
  posthog.capture(event, {
    client_type: getClientType(),
    ...properties,
  });
}

// ─── Identity ────────────────────────────────────────────────────────────────

/** Call on login. Uses Supabase UUID — no PII. */
export function identifyUser(userId: string) {
  posthog.identify(userId, {
    client_type: getClientType(),
  });
}

/** Call on logout to disassociate future events from the identified user. */
export function resetUser() {
  posthog.reset();
}

// ─── Install / First launch ──────────────────────────────────────────────────

const FIRST_SEEN_KEY = "dinnr_first_seen";

/** Fires 'app_installed' exactly once per device/browser. */
export function trackInstall() {
  if (localStorage.getItem(FIRST_SEEN_KEY)) return;
  localStorage.setItem(FIRST_SEEN_KEY, "1");
  capture("app_installed");
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export function trackSignup(method: "email" | "google") {
  capture("user_signed_up", { method });
}

// ─── Page views ──────────────────────────────────────────────────────────────

export type PageName = "recipe_library" | "recipe" | "cook_view" | "grocery" | "planner";

export function trackPageView(page: PageName) {
  capture("page_viewed", { page });
}

// ─── Recipes ─────────────────────────────────────────────────────────────────

const RECIPE_MILESTONES = [1, 5, 10, 50];

/**
 * Tracks a recipe creation event. Queries current recipe count from Supabase
 * (filtered by RLS to the current user) and fires milestone events.
 */
export async function trackRecipeCreated(method: "url" | "image" | "manual") {
  try {
    const { count } = await supabase
      .from("recipes")
      .select("*", { count: "exact", head: true });

    const recipeCount = count ?? 0;
    capture("recipe_created", { method, recipe_count: recipeCount });

    if (RECIPE_MILESTONES.includes(recipeCount)) {
      capture("recipe_milestone_reached", { milestone: recipeCount });
    }
  } catch {
    // Analytics errors must never affect app behaviour
  }
}

// ─── Cook mode ───────────────────────────────────────────────────────────────

export function trackCookModeStarted() {
  capture("cook_mode_started");
}

// ─── Groceries ───────────────────────────────────────────────────────────────

export function trackGroceryItemAdded(source: "manual" | "recipe") {
  capture("grocery_item_added", { source });
}

// ─── Planner ─────────────────────────────────────────────────────────────────

export function trackMealPlanCreated(mealType: string) {
  capture("meal_plan_created", { meal_type: mealType });
}
