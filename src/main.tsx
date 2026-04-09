import { createRoot } from "react-dom/client";
import { initSentry } from "./lib/sentry";
import App from "./App.tsx";
import "./index.css";

// Sentry must be initialized before React so it can instrument the app
// from the very first render and catch errors during hydration.
initSentry();

createRoot(document.getElementById("root")!).render(<App />);
