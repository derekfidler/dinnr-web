import { useState } from "react";
import { ArrowLeft, Mail, Lock, LogOut, Trash2, Download, Upload, Loader2, Languages, ShieldCheck, FileText, ChevronRight, ExternalLink } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useTranslation, LANGUAGES, type Language } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";

export default function Settings() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t, language, setLanguage } = useTranslation();
  const queryClient = useQueryClient();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [translating, setTranslating] = useState(false);

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast({ title: t("passwordMinLength"), variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: t("passwordsDontMatch"), variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: t("passwordUpdated") });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast({ title: t("failedToUpdatePassword"), description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await supabase.from("grocery_items").delete().eq("user_id", user!.id);
      await supabase.from("meal_plans").delete().eq("user_id", user!.id);
      await supabase.from("recipes").delete().eq("user_id", user!.id);
      toast({ title: t("allDataDeleted") });
      await signOut();
      navigate("/auth");
    } catch (err) {
      toast({ title: t("failedToDeleteAccount"), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const { data: recipes, error } = await supabase
        .from("recipes")
        .select("*")
        .eq("user_id", user!.id);
      if (error) throw error;

      const backup = {
        version: 1,
        created_at: new Date().toISOString(),
        recipes: recipes || [],
      };

      const fileName = `${user!.id}/backup-${Date.now()}.json`;
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const { error: uploadError } = await supabase.storage
        .from("recipe-images")
        .upload(fileName, blob, { upsert: true });
      if (uploadError) throw uploadError;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recipe-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: t("backupCreated"), description: t("backupSavedDesc") });
    } catch (err) {
      console.error("Backup error:", err);
      toast({ title: t("backupFailed"), variant: "destructive" });
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async (file: File) => {
    setRestoring(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup.recipes || !Array.isArray(backup.recipes)) {
        throw new Error(t("invalidBackupFormat"));
      }

      let restored = 0;
      for (const recipe of backup.recipes) {
        const { id, created_at, ...recipeData } = recipe;
        const { error } = await supabase.from("recipes").insert({
          ...recipeData,
          user_id: user!.id,
        });
        if (!error) restored++;
      }

      toast({ title: t("restoredRecipes", { count: restored }), description: t("skippedRecipes", { count: backup.recipes.length - restored }) });
    } catch (err) {
      console.error("Restore error:", err);
      toast({ title: t("restoreFailed"), description: err instanceof Error ? err.message : "Invalid file", variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  const handleLanguageChange = async (newLang: Language) => {
    const oldLang = language;
    setLanguage(newLang);

    // If changing away from English, translate all recipes
    if (newLang !== "en" && newLang !== oldLang) {
      setTranslating(true);
      try {
        const { data, error } = await supabase.functions.invoke("translate-recipes", {
          body: { target_language: newLang, user_id: user?.id },
        });
        if (error) throw error;
        toast({ title: t("translationComplete"), description: t("recipesTranslated", { count: data?.translated || 0 }) });
        queryClient.invalidateQueries({ queryKey: ["recipes"] });
      } catch (err) {
        console.error("Translation error:", err);
        toast({ title: t("translationFailed"), variant: "destructive" });
      } finally {
        setTranslating(false);
      }
    } else if (newLang === "en" && oldLang !== "en") {
      // When switching back to English, also translate back
      setTranslating(true);
      try {
        const { data, error } = await supabase.functions.invoke("translate-recipes", {
          body: { target_language: "en", user_id: user?.id },
        });
        if (error) throw error;
        toast({ title: t("translationComplete"), description: t("recipesTranslated", { count: data?.translated || 0 }) });
        queryClient.invalidateQueries({ queryKey: ["recipes"] });
      } catch (err) {
        console.error("Translation error:", err);
        toast({ title: t("translationFailed"), variant: "destructive" });
      } finally {
        setTranslating(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg px-4 pt-6 pb-3 border-b border-border">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">{t("settings")}</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {/* Language Section */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("language")}</h2>
          <div className="rounded-xl bg-card border border-border">
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center gap-3">
                <Languages className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{t("language")}</p>
                  <p className="text-xs text-muted-foreground">{t("languageDescription")}</p>
                </div>
                {translating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              <div className="pl-7">
                <Select
                  value={language}
                  onValueChange={(val) => handleLanguageChange(val as Language)}
                  disabled={translating}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        <span className="flex items-center gap-2">
                          <span>{lang.flag}</span>
                          <span>{lang.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Account Section */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("account")}</h2>
          <div className="rounded-xl bg-card border border-border divide-y divide-border">
            <div className="flex items-center gap-3 px-4 py-3">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{t("email")}</p>
                <p className="text-sm font-medium truncate">{user?.email}</p>
              </div>
            </div>

            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center gap-3">
                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-sm font-medium">{t("changePassword")}</p>
              </div>
              <div className="space-y-2 pl-7">
                <Input
                  type="password"
                  placeholder={t("newPassword")}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="text-sm"
                />
                <Input
                  type="password"
                  placeholder={t("confirmNewPassword")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  onClick={handlePasswordChange}
                  disabled={changingPassword || !newPassword}
                >
                  {changingPassword ? t("updatingPassword") : t("updatePassword")}
                </Button>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-secondary/50 transition-colors"
            >
              <LogOut className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("logOut")}</span>
            </button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-destructive/10 transition-colors text-destructive">
                  <Trash2 className="h-4 w-4" />
                  <span className="text-sm font-medium">{t("deleteAccountAndData")}</span>
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("deleteConfirmDesc")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting ? t("deleting") : t("deleteEverything")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </section>

        <Separator />

        {/* Legal Section */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Legal &amp; Privacy</h2>
          <div className="rounded-xl bg-card border border-border divide-y divide-border">
            <button
              onClick={() => navigate("/privacy")}
              className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-secondary/50 transition-colors"
            >
              <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Privacy Policy</p>
                <p className="text-xs text-muted-foreground">How we collect and use your data</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>

            <button
              onClick={() => navigate("/terms")}
              className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-secondary/50 transition-colors"
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Terms of Service</p>
                <p className="text-xs text-muted-foreground">Rules and conditions for using DINNR</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>

            <a
              href="mailto:privacy@dinnr.app"
              className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-secondary/50 transition-colors"
            >
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">GDPR &amp; Data Requests</p>
                <p className="text-xs text-muted-foreground">privacy@dinnr.app</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
          </div>
        </section>

        <Separator />

        {/* Recipe Library Section */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("recipeLibrary")}</h2>
          <div className="rounded-xl bg-card border border-border divide-y divide-border">
            <button
              onClick={handleBackup}
              disabled={backingUp}
              className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-secondary/50 transition-colors"
            >
              <Download className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{backingUp ? t("creatingBackup") : t("backupRecipes")}</p>
                <p className="text-xs text-muted-foreground">{t("backupDesc")}</p>
              </div>
              {backingUp && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </button>

            <label className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-secondary/50 transition-colors cursor-pointer">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{restoring ? t("restoring") : t("restoreRecipes")}</p>
                <p className="text-xs text-muted-foreground">{t("restoreDesc")}</p>
              </div>
              {restoring && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <input
                type="file"
                accept=".json"
                className="hidden"
                disabled={restoring}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleRestore(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}
