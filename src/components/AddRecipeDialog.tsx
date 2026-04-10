import { useState, useRef } from "react";
import { Link2, Loader2, PenLine, Camera, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { RecipeEditor } from "@/components/RecipeEditor";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Recipe } from "@/types/recipe";
import { useTranslation } from "@/lib/i18n";
import { findDuplicateRecipe } from "@/lib/duplicateCheck";
import { trackRecipeCreated } from "@/lib/analytics";

interface AddRecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function pdfToImages(file: File): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];

  const maxPages = Math.min(pdf.numPages, 5);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.85));
  }

  return images;
}

export function AddRecipeDialog({ open, onOpenChange }: AddRecipeDialogProps) {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [manualEditorOpen, setManualEditorOpen] = useState(false);
  const [partialRecipe, setPartialRecipe] = useState<Partial<Recipe> | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { t, language } = useTranslation();

  // Duplicate confirmation state
  const [duplicateDialog, setDuplicateDialog] = useState<{
    open: boolean;
    existingName: string;
    recipeToDelete: string | null; // ID of the already-saved recipe to delete on cancel
    source: "url" | "image";
  }>({ open: false, existingName: "", recipeToDelete: null, source: "url" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    // Block Instagram and Facebook URLs
    if (/instagram\.com|facebook\.com|fb\.watch/i.test(url)) {
      toast({
        title: t("notSupported"),
        description: t("instagramNotSupported"),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setLoadingMessage(t("extractingRecipe"));
    try {
      const { data, error } = await supabase.functions.invoke("extract-recipe", {
        body: { url: url.trim(), user_id: user?.id, target_language: language !== "en" ? language : undefined },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.partial) {
        toast({
          title: t("partialImport"),
          description: t("partialImportDesc"),
        });
        const partialData = data.recipe as Partial<Recipe>;
        if (
          partialData.image_url &&
          !partialData.image_url.includes("supabase.co") &&
          user?.id
        ) {
          try {
            const imgResp = await fetch(partialData.image_url);
            if (imgResp.ok) {
              const contentType = imgResp.headers.get("content-type") || "image/jpeg";
              const blob = await imgResp.blob();
              const ext = contentType.includes("png")
                ? "png"
                : contentType.includes("webp")
                ? "webp"
                : "jpg";
              const path = `${user.id}/${Date.now()}.${ext}`;
              const { error: uploadError } = await supabase.storage
                .from("recipe-images")
                .upload(path, blob, { contentType, cacheControl: "31536000", upsert: true });
              if (!uploadError) {
                const { data: urlData } = supabase.storage
                  .from("recipe-images")
                  .getPublicUrl(path);
                partialData.image_url = urlData.publicUrl;
              }
            }
          } catch {
            // Non-fatal: proceed with original URL as fallback
          }
        }
        setPartialRecipe(partialData);
        setUrl("");
        onOpenChange(false);
        setTimeout(() => setManualEditorOpen(true), 150);
        return;
      }

      // Check for duplicates after successful save
      if (user?.id && data.recipe?.title) {
        const duplicate = await findDuplicateRecipe(data.recipe.title, user.id, data.recipe.id);
        if (duplicate) {
          setUrl("");
          onOpenChange(false);
          setDuplicateDialog({
            open: true,
            existingName: duplicate,
            recipeToDelete: data.recipe.id,
            source: "url",
          });
          return;
        }
      }

      toast({ title: t("recipeAdded"), description: data.recipe?.title || t("recipeSavedSuccessfully") });
      trackRecipeCreated("url");
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      setUrl("");
      onOpenChange(false);
    } catch (err) {
      console.error("Error adding recipe:", err);
      const isSocialMedia = /tiktok\.com|youtube\.com|youtu\.be/i.test(url);
      toast({
        title: "Failed to extract recipe",
        description: isSocialMedia
          ? "Social media links can be tricky. Opening the editor so you can add it manually."
          : err instanceof Error ? err.message : "Something went wrong",
        variant: isSocialMedia ? "default" : "destructive",
      });
      if (isSocialMedia) {
        setPartialRecipe({ source_url: url.trim(), title: "" } as Partial<Recipe>);
        setUrl("");
        onOpenChange(false);
        setTimeout(() => setManualEditorOpen(true), 150);
        return;
      }
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
    }
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const validFiles = Array.from(files).filter((f) => {
      const isValid = f.type.startsWith("image/") || f.type === "application/pdf";
      const isUnderLimit = f.size <= 20 * 1024 * 1024;
      return isValid && isUnderLimit;
    });
    if (validFiles.length === 0) {
      toast({ title: "Invalid files", description: "Please upload images (PNG, JPG) or PDF files under 20MB.", variant: "destructive" });
      return;
    }
    setSelectedFiles((prev) => [...prev, ...validFiles].slice(0, 10));
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImageUploadSubmit = async () => {
    if (selectedFiles.length === 0) return;

    setIsLoading(true);
    setLoadingMessage(t("readingImages"));
    try {
      const allImages: string[] = [];
      for (const file of selectedFiles) {
        if (file.type === "application/pdf") {
          const pageImages = await pdfToImages(file);
          allImages.push(...pageImages);
        } else {
          allImages.push(await fileToBase64(file));
        }
      }
      setLoadingMessage(t("extractingFromImages"));

      const { data, error } = await supabase.functions.invoke("extract-recipe-from-images", {
        body: { images: allImages, user_id: user?.id, target_language: language !== "en" ? language : undefined },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.partial) {
        toast({
          title: "Partial extraction",
          description: "Some data couldn't be extracted. Please review and complete the recipe.",
        });
        setPartialRecipe(data.recipe as Partial<Recipe>);
        setSelectedFiles([]);
        onOpenChange(false);
        setTimeout(() => setManualEditorOpen(true), 150);
        return;
      }

      // Check for duplicates after successful save
      if (user?.id && data.recipe?.title) {
        const duplicate = await findDuplicateRecipe(data.recipe.title, user.id, data.recipe.id);
        if (duplicate) {
          setSelectedFiles([]);
          onOpenChange(false);
          setDuplicateDialog({
            open: true,
            existingName: duplicate,
            recipeToDelete: data.recipe.id,
            source: "image",
          });
          return;
        }
      }

      toast({ title: "Recipe added!", description: data.recipe?.title || "Recipe saved successfully" });
      trackRecipeCreated("image");
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      setSelectedFiles([]);
      onOpenChange(false);
    } catch (err) {
      console.error("Error extracting from images:", err);
      toast({
        title: "Failed to extract recipe",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
    }
  };

  const handleDuplicateConfirm = () => {
    toast({ title: t("recipeAdded") });
    trackRecipeCreated(duplicateDialog.source);
    queryClient.invalidateQueries({ queryKey: ["recipes"] });
    setDuplicateDialog({ open: false, existingName: "", recipeToDelete: null, source: "url" });
  };

  const handleDuplicateCancel = async () => {
    if (duplicateDialog.recipeToDelete) {
      await supabase.from("recipes").delete().eq("id", duplicateDialog.recipeToDelete);
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    }
    setDuplicateDialog({ open: false, existingName: "", recipeToDelete: null, source: "url" });
  };

  const handleManualSaved = (recipe: Recipe) => {
    trackRecipeCreated("manual");
    setManualEditorOpen(false);
    setPartialRecipe(null);
    onOpenChange(false);
    navigate(`/recipe/${recipe.id}`);
  };

  const handleEditorClose = (isOpen: boolean) => {
    setManualEditorOpen(isOpen);
    if (!isOpen) setPartialRecipe(null);
  };

  const handleDialogClose = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setSelectedFiles([]);
      setUrl("");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("addRecipe")}</DialogTitle>
            <DialogDescription>
              {t("pasteUrlOrCreate")}
            </DialogDescription>
          </DialogHeader>

          {/* URL input */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                type="url"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isLoading}
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && selectedFiles.length === 0 ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {loadingMessage || t("extractingRecipe")}
                </>
              ) : (
                t("importFromUrl")
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-popover px-2 text-muted-foreground">or</span>
            </div>
          </div>

          {/* Image/File upload section */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                <ImagePlus className="h-4 w-4" />
                {t("uploadPhotos")}
              </Button>
              {isMobile && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isLoading}
                >
                  <Camera className="h-4 w-4" />
                  {t("camera")}
                </Button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />

            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {selectedFiles.map((file, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 bg-muted rounded-md px-2 py-1 text-xs"
                    >
                      <span className="truncate max-w-[120px]">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""} selected
                  {selectedFiles.length < 10 && " · add more if needed"}
                </p>
                <Button
                  className="w-full"
                  onClick={handleImageUploadSubmit}
                  disabled={isLoading}
                >
                  {isLoading && loadingMessage.includes("image") ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {loadingMessage}
                    </>
                  ) : (
                    t("extractRecipeFromImages")
                  )}
                </Button>
              </div>
            )}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-popover px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => {
              setPartialRecipe(null);
              handleDialogClose(false);
              setTimeout(() => setManualEditorOpen(true), 150);
            }}
          >
            <PenLine className="h-4 w-4" />
            {t("createManually")}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Duplicate recipe confirmation */}
      <AlertDialog open={duplicateDialog.open} onOpenChange={(open) => {
        if (!open) handleDuplicateCancel();
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("duplicateRecipeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("duplicateRecipeDesc").replace("{name}", duplicateDialog.existingName)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDuplicateCancel}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDuplicateConfirm}>
              {t("addAnyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RecipeEditor
        open={manualEditorOpen}
        onOpenChange={handleEditorClose}
        recipe={partialRecipe as Recipe | null}
        onSaved={handleManualSaved}
      />
    </>
  );
}
