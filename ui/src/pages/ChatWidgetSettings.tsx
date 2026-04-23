import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Check, Copy } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToastActions } from "../context/ToastContext";
import { chatWidgetApi, type ChatWidgetSettings } from "../api/chatWidget";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

const QUERY_KEY = (companyId: string) => ["chat-widget-settings", companyId] as const;

const DEFAULT_SETTINGS: Omit<ChatWidgetSettings, "companyId"> = {
  welcomeMessage: "Hi! How can we help you today?",
  agentName: "Avero AI",
  brandColor: "#2563eb",
  collectEmail: true,
  collectPhone: false,
};

export function ChatWidgetSettings() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToastActions();
  const queryClient = useQueryClient();

  const [welcomeMessage, setWelcomeMessage] = useState(DEFAULT_SETTINGS.welcomeMessage);
  const [agentName, setAgentName] = useState(DEFAULT_SETTINGS.agentName);
  const [brandColor, setBrandColor] = useState(DEFAULT_SETTINGS.brandColor);
  const [collectEmail, setCollectEmail] = useState(DEFAULT_SETTINGS.collectEmail);
  const [collectPhone, setCollectPhone] = useState(DEFAULT_SETTINGS.collectPhone);
  const [copied, setCopied] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: QUERY_KEY(selectedCompanyId ?? ""),
    queryFn: () => chatWidgetApi.getSettings(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Chat Widget" },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  useEffect(() => {
    if (!settings) return;
    setWelcomeMessage(settings.welcomeMessage);
    setAgentName(settings.agentName);
    setBrandColor(settings.brandColor);
    setCollectEmail(settings.collectEmail);
    setCollectPhone(settings.collectPhone);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () =>
      chatWidgetApi.updateSettings(selectedCompanyId!, {
        welcomeMessage,
        agentName,
        brandColor,
        collectEmail,
        collectPhone,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(QUERY_KEY(selectedCompanyId!), updated);
      pushToast({ title: "Chat widget settings saved", tone: "success" });
    },
    onError: (err: unknown) => {
      pushToast({
        title: "Could not save settings",
        body: err instanceof Error ? err.message : "Unknown error",
        tone: "error",
      });
    },
  });

  const embedCode = useMemo(() => {
    if (!selectedCompanyId) return "";
    const origin =
      typeof window !== "undefined" && window.location
        ? `${window.location.protocol}//${window.location.host}`
        : "";
    return `<script>
  window.AveroChatConfig = { companyId: "${selectedCompanyId}" };
</script>
<script async src="${origin}/widget/avero-chat.js"></script>`;
  }, [selectedCompanyId]);

  const dirty =
    !!settings &&
    (welcomeMessage !== settings.welcomeMessage ||
      agentName !== settings.agentName ||
      brandColor !== settings.brandColor ||
      collectEmail !== settings.collectEmail ||
      collectPhone !== settings.collectPhone);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      pushToast({ title: "Copy failed", tone: "error" });
    }
  };

  if (!selectedCompany) {
    return (
      <div className="text-sm text-muted-foreground">
        No company selected. Select a company from the switcher above.
      </div>
    );
  }

  const brandColorIsValid = /^#[0-9a-fA-F]{6}$/.test(brandColor);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-full flex items-center justify-center text-white"
          style={{ backgroundColor: brandColorIsValid ? brandColor : "#2563eb" }}
          aria-hidden
        >
          <MessageSquare className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Chat Widget</h1>
          <p className="text-sm text-muted-foreground">
            Configure the floating chat bubble for your website.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="agentName">Agent name</Label>
            <Input
              id="agentName"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Avero AI"
              disabled={isLoading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="welcomeMessage">Welcome message</Label>
            <Textarea
              id="welcomeMessage"
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder="Hi! How can we help you today?"
              rows={2}
              disabled={isLoading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="brandColor">Brand color</Label>
            <div className="flex items-center gap-2">
              <Input
                id="brandColor"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                placeholder="#2563eb"
                className="w-40"
                disabled={isLoading}
              />
              <input
                type="color"
                value={brandColorIsValid ? brandColor : "#2563eb"}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-9 w-12 rounded border border-border cursor-pointer"
                aria-label="Brand color picker"
              />
            </div>
            {!brandColorIsValid ? (
              <p className="text-xs text-red-600">Must be a hex color like #2563eb.</p>
            ) : null}
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Collect email</Label>
              <p className="text-xs text-muted-foreground">
                Ask visitors for an email before chatting.
              </p>
            </div>
            <ToggleSwitch
              checked={collectEmail}
              onCheckedChange={setCollectEmail}
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Collect phone</Label>
              <p className="text-xs text-muted-foreground">
                Ask visitors for a phone number before chatting.
              </p>
            </div>
            <ToggleSwitch
              checked={collectPhone}
              onCheckedChange={setCollectPhone}
              disabled={isLoading}
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || !brandColorIsValid || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div>
            <h2 className="text-base font-medium">Embed on your website</h2>
            <p className="text-sm text-muted-foreground">
              Paste this snippet before <code>&lt;/body&gt;</code>.
            </p>
          </div>
          <pre className="rounded-md border border-border bg-muted px-3 py-2 text-xs whitespace-pre-wrap break-all">
            {embedCode}
          </pre>
          <div>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" /> Copy embed code
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
