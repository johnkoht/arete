import { useState } from "react";
import { KeyRound, Trash2, Save, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { fetchApiKeyStatus, saveApiKey, deleteApiKey } from "@/api/settings.js";

// ── API Key section ───────────────────────────────────────────────────────────

function ApiKeySection() {
  const queryClient = useQueryClient();
  const [keyInput, setKeyInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["settings", "apikey"],
    queryFn: fetchApiKeyStatus,
  });

  const saveMutation = useMutation({
    mutationFn: saveApiKey,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "apikey"] });
      setKeyInput("");
      setValidationError(null);
      toast.success("API key saved successfully");
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Failed to save API key");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteApiKey,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "apikey"] });
      toast.success("API key removed");
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Failed to remove API key");
    },
  });

  function handleSave() {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      setValidationError("Please enter an API key");
      return;
    }
    if (!trimmed.startsWith("sk-ant-")) {
      setValidationError("Invalid key format — must start with sk-ant-");
      return;
    }
    setValidationError(null);
    saveMutation.mutate(trimmed);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" />
          Anthropic API Key
        </CardTitle>
        <CardDescription>
          Used for AI-powered meeting processing and intelligence features.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />
        ) : status?.configured ? (
          /* Key is configured — show masked key + remove button */
          <div className="flex items-center gap-3">
            <code className="rounded bg-muted px-3 py-1.5 text-sm font-mono text-muted-foreground">
              {status.maskedKey}
            </code>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove API key?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete the saved key. Meeting processing will stop
                    working until you add a new key.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          /* Key not configured — show input */
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="password"
                placeholder="sk-ant-api03-..."
                value={keyInput}
                onChange={(e) => {
                  setKeyInput(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                className="max-w-sm font-mono text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
              />
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saveMutation.isPending}
              >
                <Save className="h-4 w-4 mr-1" />
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
            {validationError && (
              <p className="text-sm text-destructive">{validationError}</p>
            )}
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              Get your key at{" "}
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
              >
                console.anthropic.com
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── About section ─────────────────────────────────────────────────────────────

function AboutSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">About</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2 text-sm">
          <div className="flex gap-4">
            <dt className="w-24 text-muted-foreground">Version</dt>
            <dd className="font-mono">0.1.0</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Settings" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-6">
          <ApiKeySection />
          <AboutSection />
        </div>
      </div>
    </div>
  );
}
