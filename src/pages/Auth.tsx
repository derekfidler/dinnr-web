import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { trackSignup } from "@/lib/analytics";

export default function Auth() {
  const { user, loading } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // In Electron, window.location.origin is "null" (file:// protocol).
  // Use undefined so Supabase falls back to the configured Site URL.
  const isElectron = window.electronAPI?.isElectron === true;

  if (user) {
    return <Navigate to={isElectron ? "/" : "/app"} replace />;
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        trackSignup("email");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: unknown) {
      toast({ title: t("error"), description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (isSigningIn) return;
    if (isElectron) {
      setIsSigningIn(true);
      // Use a mutable ref object so the timeout id and callback-registered flag
      // are accessible in the finally block without closure staleness issues.
      const state = { timeoutId: undefined as ReturnType<typeof setTimeout> | undefined, callbackRegistered: false };
      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "apple",
          options: {
            redirectTo: "dinnr://auth/callback",
            skipBrowserRedirect: true,
          },
        });
        if (error) {
          toast({ title: t("error"), description: error.message, variant: "destructive" });
          return;
        }
        // Guard: only proceed if Supabase returned a valid OAuth URL.
        if (!data.url) {
          toast({ title: t("error"), description: "Failed to generate Apple sign-in URL", variant: "destructive" });
          return;
        }
        // Register the listener BEFORE opening the browser so that fast OAuth
        // flows cannot fire the IPC message before the handler exists.
        // onOAuthCallback removes any stale listener before registering a new one,
        // preventing accumulation on repeated sign-in attempts.
        state.callbackRegistered = true;
        window.electronAPI!.onOAuthCallback(async (callbackUrl) => {
          clearTimeout(state.timeoutId);
          try {
            // Rewrite the custom scheme URL to the canonical Supabase callback URL so
            // that URL parsing and query-string extraction work correctly.
            const callbackBase = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/callback`;
            // Use global regex so all occurrences are replaced (String.replace with a
            // string literal only replaces the first match).
            const rawUrl = callbackUrl.replace(/dinnr:\/\/auth\/callback/g, callbackBase);
            const url = new URL(rawUrl);

            // Provider/Supabase error in callback (e.g. Apple client_secret expired)
            const oauthError = url.searchParams.get("error");
            if (oauthError) {
              const description = url.searchParams.get("error_description")?.replace(/\+/g, " ") ?? oauthError;
              toast({ title: t("error"), description: decodeURIComponent(description), variant: "destructive" });
              return;
            }

            // PKCE flow: code in query params
            const code = url.searchParams.get("code");
            if (code) {
              const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
              if (sessionError) {
                toast({ title: t("error"), description: sessionError.message, variant: "destructive" });
              }
              return;
            }

            // Implicit flow: tokens in hash fragment
            const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
            const accessToken = hash.get("access_token");
            const refreshToken = hash.get("refresh_token");
            if (accessToken && refreshToken) {
              const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
              if (sessionError) {
                toast({ title: t("error"), description: sessionError.message, variant: "destructive" });
              }
              return;
            }

            toast({ title: t("error"), description: "OAuth callback missing code", variant: "destructive" });
          } finally {
            window.electronAPI!.removeOAuthCallback();
            window.electronAPI!.removeOAuthCallbackError();
            setIsSigningIn(false);
          }
        });
        // Listen for load failures from the auth window (e.g. network error, DNS
        // failure). Main sends this when did-fail-load fires so the renderer
        // can reset state immediately instead of waiting for the 5-minute timeout.
        window.electronAPI!.onOAuthCallbackError((message) => {
          clearTimeout(state.timeoutId);
          window.electronAPI!.removeOAuthCallback();
          window.electronAPI!.removeOAuthCallbackError();
          toast({ title: t("error"), description: message || "Failed to load sign-in page", variant: "destructive" });
          setIsSigningIn(false);
        });
        // Open OAuth in an in-app window (equivalent to ASWebAuthenticationSession)
        // so the user never leaves the app. Catch synchronous IPC failures (e.g.
        // BrowserWindow creation error) so isSigningIn does not get stuck.
        window.electronAPI!.openOAuthWindow(data.url).catch((err: Error) => {
          clearTimeout(state.timeoutId);
          window.electronAPI!.removeOAuthCallback();
          window.electronAPI!.removeOAuthCallbackError();
          toast({ title: t("error"), description: err.message ?? "Failed to open sign-in window", variant: "destructive" });
          setIsSigningIn(false);
        });
        // Set up a 5-minute timeout to clean up the listener if the user cancels.
        state.timeoutId = setTimeout(() => {
          window.electronAPI!.removeOAuthCallback();
          window.electronAPI!.removeOAuthCallbackError();
          setIsSigningIn(false);
        }, 5 * 60 * 1000);
      } catch (err: unknown) {
        toast({ title: t("error"), description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      } finally {
        // If an error or early return prevented the callback from being registered,
        // we must reset state here. If the callback was registered, it owns the
        // cleanup (both the happy path and the 5-minute timeout already call
        // removeOAuthCallback + setIsSigningIn(false)).
        if (!state.callbackRegistered) {
          clearTimeout(state.timeoutId);
          window.electronAPI!.removeOAuthCallback?.();
          window.electronAPI!.removeOAuthCallbackError?.();
          setIsSigningIn(false);
        }
      }
      return;
    }

    // Web flow: redirectTo must match an entry in Supabase's redirect allow-list.
    setIsSigningIn(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: window.location.origin + '/app' },
    });
    if (error) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
      setIsSigningIn(false);
    }
    // On success, browser navigates away — no cleanup needed.
  };

  const handleGoogleSignIn = async () => {
    if (isSigningIn) return;
    if (isElectron) {
      // Electron OAuth flow:
      // 1. Get the OAuth URL (supabase stores PKCE verifier in localStorage)
      // 2. Open it in the system browser via IPC
      // 3. System browser does OAuth, Google redirects to dinnr://auth/callback?code=xxx
      // 4. Electron main catches the deep link, sends it back to this renderer
      // 5. We exchange the code for a session (verifier is in our localStorage)
      setIsSigningIn(true);
      // Use a mutable ref object so the timeout id and callback-registered flag
      // are accessible in the finally block without closure staleness issues.
      const state = { timeoutId: undefined as ReturnType<typeof setTimeout> | undefined, callbackRegistered: false };
      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: "dinnr://auth/callback",
            skipBrowserRedirect: true,
          },
        });
        if (error) {
          toast({ title: t("error"), description: error.message, variant: "destructive" });
          return;
        }
        // Guard: only proceed if Supabase returned a valid OAuth URL.
        if (!data.url) {
          toast({ title: t("error"), description: "Failed to generate Google sign-in URL", variant: "destructive" });
          return;
        }
        // Register the listener BEFORE opening the browser so that fast OAuth
        // flows cannot fire the IPC message before the handler exists.
        // onOAuthCallback removes any stale listener before registering a new one,
        // preventing accumulation on repeated sign-in attempts.
        state.callbackRegistered = true;
        window.electronAPI!.onOAuthCallback(async (callbackUrl) => {
          clearTimeout(state.timeoutId);
          try {
            // Rewrite the custom scheme URL to the canonical Supabase callback URL so
            // that URL parsing and query-string extraction work correctly.
            const callbackBase = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/callback`;
            // Use global regex so all occurrences are replaced (String.replace with a
            // string literal only replaces the first match).
            const rawUrl = callbackUrl.replace(/dinnr:\/\/auth\/callback/g, callbackBase);
            const url = new URL(rawUrl);

            // Provider/Supabase error in callback (e.g. Apple client_secret expired)
            const oauthError = url.searchParams.get("error");
            if (oauthError) {
              const description = url.searchParams.get("error_description")?.replace(/\+/g, " ") ?? oauthError;
              toast({ title: t("error"), description: decodeURIComponent(description), variant: "destructive" });
              return;
            }

            // PKCE flow: code in query params
            const code = url.searchParams.get("code");
            if (code) {
              const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
              if (sessionError) {
                toast({ title: t("error"), description: sessionError.message, variant: "destructive" });
              }
              return;
            }

            // Implicit flow: tokens in hash fragment
            const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
            const accessToken = hash.get("access_token");
            const refreshToken = hash.get("refresh_token");
            if (accessToken && refreshToken) {
              const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
              if (sessionError) {
                toast({ title: t("error"), description: sessionError.message, variant: "destructive" });
              }
              return;
            }

            toast({ title: t("error"), description: "OAuth callback missing code", variant: "destructive" });
          } finally {
            window.electronAPI!.removeOAuthCallback();
            window.electronAPI!.removeOAuthCallbackError();
            setIsSigningIn(false);
          }
        });
        // Listen for load failures from the auth window (e.g. network error, DNS
        // failure). Main sends this when did-fail-load fires so the renderer
        // can reset state immediately instead of waiting for the 5-minute timeout.
        window.electronAPI!.onOAuthCallbackError((message) => {
          clearTimeout(state.timeoutId);
          window.electronAPI!.removeOAuthCallback();
          window.electronAPI!.removeOAuthCallbackError();
          toast({ title: t("error"), description: message || "Failed to load sign-in page", variant: "destructive" });
          setIsSigningIn(false);
        });
        // Google blocks OAuth in embedded Chromium frames ("This browser or app
        // may not be secure"). Open the URL in the system browser instead so the
        // user can complete sign-in, then the dinnr:// deep link brings the code
        // back to the renderer via the existing open-url → oauth-callback path.
        window.electronAPI!.openExternal(data.url);
        // Set up a 5-minute timeout to clean up the listener if the user cancels.
        state.timeoutId = setTimeout(() => {
          window.electronAPI!.removeOAuthCallback();
          window.electronAPI!.removeOAuthCallbackError();
          setIsSigningIn(false);
        }, 5 * 60 * 1000);
      } catch (err: unknown) {
        toast({ title: t("error"), description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      } finally {
        // If an error or early return prevented the callback from being registered,
        // we must reset state here. If the callback was registered, it owns the
        // cleanup (both the happy path and the 5-minute timeout already call
        // removeOAuthCallback + setIsSigningIn(false)).
        if (!state.callbackRegistered) {
          clearTimeout(state.timeoutId);
          window.electronAPI!.removeOAuthCallback?.();
          window.electronAPI!.removeOAuthCallbackError?.();
          setIsSigningIn(false);
        }
      }
      return;
    }

    // Web flow: redirectTo must match an entry in Supabase's redirect allow-list.
    setIsSigningIn(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + '/app' },
    });
    if (error) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
      setIsSigningIn(false);
    }
    // On success, browser navigates away — no cleanup needed.
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-primary">dinnr</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isSignUp ? t("createYourAccount") : t("signInToYourRecipes")}
          </p>
        </div>

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={handleAppleSignIn}
          disabled={isSigningIn}
        >
          <svg className="h-4 w-4" viewBox="0 0 814 1000" fill="currentColor">
            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 479.3 0 356.9 0 238.4c0-119.7 39.5-183.7 100.4-237.4 51-46 127.5-75.5 202.7-75.5 79.5 0 144.7 27.8 194.9 27.8 48.3 0 124.5-30.8 200-30.8 32 0 117.3 2.9 179.5 75.5zm-78.5-214.4c36 0 74.5-30.8 99.1-76.4 22.6-42.8 35.4-94.2 35.4-140.8 0-6.4-.7-12.8-1.3-19.2-34.1 1.3-74.5 23.3-99.7 71-22 42.8-36 94.8-36 140.8 0 6.4 1.3 13.5 2 19.2 1.3-.7 1.3-.7.5.4z" />
          </svg>
          {t("continueWithApple")}
        </Button>

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={handleGoogleSignIn}
          disabled={isSigningIn}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          {t("continueWithGoogle")}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">{t("or")}</span>
          </div>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <Input
            type="email"
            placeholder={t("email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-secondary border-0"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="bg-secondary border-0"
          />
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : isSignUp ? t("signUp") : t("signIn")}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isSignUp ? t("alreadyHaveAccount") : t("dontHaveAccount")}{" "}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-primary font-medium hover:underline"
          >
            {isSignUp ? t("signIn") : t("signUp")}
          </button>
        </p>
      </div>
    </div>
  );
}
