/**
 * Auth page — unit tests for the OAuth flow
 *
 * Google (Electron): uses shell.openExternal (system browser) — Google blocks
 *   embedded Chromium frames. deep link → dinnr:// → oauth-callback IPC.
 * Apple (Electron): uses openOAuthWindow (in-app BrowserWindow).
 *   new onOAuthCallbackError / removeOAuthCallbackError IPC pair
 *   did-fail-load in main sends "oauth-callback-error"; renderer resets state immediately
 *   every cleanup path now calls removeOAuthCallbackError alongside removeOAuthCallback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { HashRouter } from "react-router-dom";
import Auth from "./Auth";

// ─── Module mocks ─────────────────────────────────────────────────────────────
//
// vi.mock factories are hoisted to the top of the file by Vitest before any
// variable declarations, so references to module-level vars inside factories
// would fail with "Cannot access before initialization". Use vi.hoisted() to
// declare mock functions in the same hoisted scope as vi.mock().

const { mockSignInWithOAuth, mockExchangeCodeForSession, mockSetSession, mockToast } = vi.hoisted(() => ({
  mockSignInWithOAuth: vi.fn(),
  mockExchangeCodeForSession: vi.fn(),
  mockSetSession: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      exchangeCodeForSession: mockExchangeCodeForSession,
      setSession: mockSetSession,
    },
  },
}));

// useAuth — no logged-in user so the Auth page renders (not a redirect)
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false, session: null, signOut: vi.fn() }),
}));

// Toast — capture calls for assertion
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// i18n — return the key so test assertions are stable regardless of locale
vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Analytics — fire-and-forget, no assertion needed in these tests
vi.mock("@/lib/analytics", () => ({
  trackSignup: vi.fn(),
  identifyUser: vi.fn(),
  resetUser: vi.fn(),
}));

// Sentry — not under test
vi.mock("@/lib/sentry", () => ({
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a full window.electronAPI mock with sensible defaults. */
function makeElectronAPI(overrides: Partial<NonNullable<Window["electronAPI"]>> = {}): NonNullable<Window["electronAPI"]> {
  return {
    isElectron: true,
    openExternal: vi.fn().mockResolvedValue(undefined),
    openOAuthWindow: vi.fn().mockResolvedValue(undefined),
    openRecipeWindow: vi.fn().mockResolvedValue(undefined),
    onOAuthCallback: vi.fn(),
    removeOAuthCallback: vi.fn(),
    onOAuthCallbackError: vi.fn(),
    removeOAuthCallbackError: vi.fn(),
    ...overrides,
  };
}

function renderAuth() {
  return render(
    <HashRouter>
      <Auth />
    </HashRouter>
  );
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  // Real timers by default — waitFor relies on real setTimeout.
  // Individual tests that need fake timers call vi.useFakeTimers() themselves.
  mockToast.mockClear();
  mockSignInWithOAuth.mockReset();
  // Default Supabase mock returns — always return a valid shape so destructuring
  // { error } never throws "Cannot destructure property 'error' of undefined".
  mockExchangeCodeForSession.mockResolvedValue({ error: null });
  mockSetSession.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.useRealTimers();
  // Remove electronAPI stub between tests
  delete (window as Window & { electronAPI?: unknown }).electronAPI;
});

// ─── Google Sign-In — Electron system browser flow ───────────────────────────

describe("handleGoogleSignIn — Electron system browser (openExternal)", () => {
  it("calls openExternal (not openOAuthWindow) with the OAuth URL", async () => {
    const api = makeElectronAPI();
    window.electronAPI = api;

    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/auth?state=x" },
      error: null,
    });

    renderAuth();
    fireEvent.click(screen.getByText("continueWithGoogle"));

    await waitFor(() => expect(api.openExternal).toHaveBeenCalledTimes(1));
    expect(api.openExternal).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/auth?state=x");
    // In-app window must NOT be used for Google
    expect(api.openOAuthWindow).not.toHaveBeenCalled();
  });

  it("exchanges code for session on PKCE callback (code in query params)", async () => {
    let capturedOAuthCallback: ((url: string) => void) | null = null;
    const api = makeElectronAPI({
      onOAuthCallback: vi.fn((cb) => { capturedOAuthCallback = cb; }),
    });
    window.electronAPI = api;

    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/auth" },
      error: null,
    });
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    renderAuth();
    fireEvent.click(screen.getByText("continueWithGoogle"));
    await waitFor(() => expect(capturedOAuthCallback).not.toBeNull());

    act(() => {
      capturedOAuthCallback!("dinnr://auth/callback?code=test-pkce-code");
    });

    await waitFor(() =>
      expect(mockExchangeCodeForSession).toHaveBeenCalledWith("test-pkce-code")
    );

    expect(api.removeOAuthCallback).toHaveBeenCalled();
    expect(api.removeOAuthCallbackError).toHaveBeenCalled();
  });

  it("sets session directly on implicit flow (tokens in hash)", async () => {
    let capturedOAuthCallback: ((url: string) => void) | null = null;
    const api = makeElectronAPI({
      onOAuthCallback: vi.fn((cb) => { capturedOAuthCallback = cb; }),
    });
    window.electronAPI = api;

    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/auth" },
      error: null,
    });
    mockSetSession.mockResolvedValue({ error: null });

    renderAuth();
    fireEvent.click(screen.getByText("continueWithGoogle"));
    await waitFor(() => expect(capturedOAuthCallback).not.toBeNull());

    act(() => {
      capturedOAuthCallback!("dinnr://auth/callback#access_token=at123&refresh_token=rt456");
    });

    await waitFor(() =>
      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: "at123",
        refresh_token: "rt456",
      })
    );

    expect(api.removeOAuthCallbackError).toHaveBeenCalled();
  });

  it("shows error toast when callback URL has neither code nor tokens", async () => {
    let capturedOAuthCallback: ((url: string) => void) | null = null;
    const api = makeElectronAPI({
      onOAuthCallback: vi.fn((cb) => { capturedOAuthCallback = cb; }),
    });
    window.electronAPI = api;

    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/auth" },
      error: null,
    });

    renderAuth();
    fireEvent.click(screen.getByText("continueWithGoogle"));
    await waitFor(() => expect(capturedOAuthCallback).not.toBeNull());

    act(() => { capturedOAuthCallback!("dinnr://auth/callback"); });

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "OAuth callback missing code" })
      )
    );

    expect(api.removeOAuthCallbackError).toHaveBeenCalled();
  });

  it("registers a 5-minute cleanup timeout that removes both listeners", async () => {
    // Spy on setTimeout without mocking it — this lets waitFor still work while
    // letting us assert the timeout delay and capture the callback to invoke it.
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");

    const api = makeElectronAPI();
    window.electronAPI = api;

    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/auth" },
      error: null,
    });

    renderAuth();
    fireEvent.click(screen.getByText("continueWithGoogle"));

    await waitFor(() => expect(api.openExternal).toHaveBeenCalled());

    // The component must have called setTimeout with a 5-minute delay.
    const timeoutCall = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 5 * 60 * 1000);
    expect(timeoutCall).toBeDefined();
    setTimeoutSpy.mockRestore();

    // Invoke the cleanup callback directly — same effect as waiting 5 minutes.
    act(() => { (timeoutCall![0] as () => void)(); });

    expect(api.removeOAuthCallback).toHaveBeenCalled();
    expect(api.removeOAuthCallbackError).toHaveBeenCalled();
    expect(screen.getByText("continueWithGoogle").closest("button")).not.toBeDisabled();
  });

  it("does not sign in a second time if already signing in (guard)", async () => {
    // openExternal is fire-and-forget (no promise to hang on), so we block at
    // signInWithOAuth to keep isSigningIn=true for the duration of the test.
    mockSignInWithOAuth.mockImplementation(() => new Promise(() => {}));

    const api = makeElectronAPI();
    window.electronAPI = api;

    renderAuth();
    const btn = screen.getByText("continueWithGoogle").closest("button")!;
    fireEvent.click(btn);

    // Give the async handler a tick to start
    await act(async () => {});

    // Button becomes disabled while signing in
    expect(btn).toBeDisabled();

    // Second click — guard should prevent a second signInWithOAuth call
    fireEvent.click(btn);
    expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1);
  });

  it("shows a toast and resets when Supabase returns an error", async () => {
    const api = makeElectronAPI();
    window.electronAPI = api;

    mockSignInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { message: "Provider not enabled" },
    });

    renderAuth();
    fireEvent.click(screen.getByText("continueWithGoogle"));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Provider not enabled" })
      )
    );
  });
});

// ─── Apple Sign-In — Electron in-app window flow ─────────────────────────────

describe("handleAppleSignIn — Electron in-app BrowserWindow", () => {
  it("calls openOAuthWindow (not openExternal) with the Apple OAuth URL", async () => {
    const api = makeElectronAPI();
    window.electronAPI = api;

    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://appleid.apple.com/auth/authorize?state=y" },
      error: null,
    });

    renderAuth();
    fireEvent.click(screen.getByText("continueWithApple"));

    await waitFor(() => expect(api.openOAuthWindow).toHaveBeenCalledTimes(1));
    expect(api.openOAuthWindow).toHaveBeenCalledWith("https://appleid.apple.com/auth/authorize?state=y");
    expect(api.openExternal).not.toHaveBeenCalled();
  });

  it("shows a toast and resets state when onOAuthCallbackError fires", async () => {
    let capturedErrorHandler: ((msg: string) => void) | null = null;
    const api = makeElectronAPI({
      onOAuthCallbackError: vi.fn((cb) => { capturedErrorHandler = cb; }),
    });
    window.electronAPI = api;

    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://appleid.apple.com/auth/authorize" },
      error: null,
    });

    renderAuth();
    fireEvent.click(screen.getByText("continueWithApple"));
    await waitFor(() => expect(capturedErrorHandler).not.toBeNull());

    act(() => { capturedErrorHandler!("Network error"); });

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", description: "Network error" })
      )
    );

    expect(api.removeOAuthCallback).toHaveBeenCalled();
    expect(api.removeOAuthCallbackError).toHaveBeenCalled();
    expect(screen.getByText("continueWithApple").closest("button")).not.toBeDisabled();
  });

  it("registers a 5-minute cleanup timeout that removes both listeners", async () => {
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");

    const api = makeElectronAPI();
    window.electronAPI = api;

    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://appleid.apple.com/auth/authorize" },
      error: null,
    });

    renderAuth();
    fireEvent.click(screen.getByText("continueWithApple"));
    await waitFor(() => expect(api.openOAuthWindow).toHaveBeenCalled());

    const timeoutCall = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 5 * 60 * 1000);
    expect(timeoutCall).toBeDefined();
    setTimeoutSpy.mockRestore();

    act(() => { (timeoutCall![0] as () => void)(); });

    expect(api.removeOAuthCallback).toHaveBeenCalled();
    expect(api.removeOAuthCallbackError).toHaveBeenCalled();
  });
});

// ─── Web (non-Electron) flow — openOAuthWindow should NOT be called ───────────

describe("handleGoogleSignIn — web (non-Electron) flow", () => {
  it("does not call openOAuthWindow or openExternal in web mode", async () => {
    // No window.electronAPI → isElectron is false
    delete (window as Window & { electronAPI?: unknown }).electronAPI;

    mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });

    renderAuth();
    fireEvent.click(screen.getByText("continueWithGoogle"));

    await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1));

    // electronAPI is absent, so nothing IPC-related can have been called
    expect(window.electronAPI).toBeUndefined();
  });
});
