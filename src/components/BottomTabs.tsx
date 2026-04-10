import { BookOpen, Calendar, ShoppingCart } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export function BottomTabs() {
  const location = useLocation();
  const { t } = useTranslation();

  if (location.pathname === "/auth") return null;

  const tabs = [
    { to: "/", icon: BookOpen, label: t("recipes") },
    { to: "/planner", icon: Calendar, label: t("planner") },
    { to: "/groceries", icon: ShoppingCart, label: t("groceries") },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-1 px-4 py-2 text-xs font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )
            }
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
