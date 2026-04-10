interface Window {
  electronAPI?: {
    isElectron: boolean;
    openExternal: (url: string) => Promise<void>;
    openOAuthWindow: (url: string) => Promise<void>;
    openRecipeWindow: (recipeId: string) => Promise<void>;
    onOAuthCallback: (callback: (url: string) => void) => void;
    removeOAuthCallback: () => void;
    onOAuthCallbackError: (callback: (message: string) => void) => void;
    removeOAuthCallbackError: () => void;
  };
}
