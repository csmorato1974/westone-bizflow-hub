import { useEffect, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "westone-pwa-install-dismissed-until";
const DISMISS_TIME = 7 * 24 * 60 * 60 * 1000;

function isStandalone() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || iosNavigator.standalone === true;
}

export function PwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedUntil > Date.now()) return;

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
      setShowIosInstructions(false);
      localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const iosTimer = isIos ? window.setTimeout(() => setShowIosInstructions(true), 1800) : undefined;

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      if (iosTimer) window.clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_TIME));
    setInstallPrompt(null);
    setShowIosInstructions(false);
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  if (!installPrompt && !showIosInstructions) return null;

  return (
    <aside
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto flex max-w-md items-start gap-3 rounded-xl border border-primary/40 bg-background/95 p-4 shadow-2xl backdrop-blur"
      aria-label="Instalar WESTONE APP"
    >
      <div className="mt-0.5 rounded-lg bg-primary/15 p-2 text-primary">
        {showIosInstructions ? <Share2 className="h-5 w-5" /> : <Download className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-foreground">Instalar WESTONE APP</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {showIosInstructions
            ? "En Safari, pulsa Compartir y después “Añadir a pantalla de inicio”."
            : "Úsala desde tu pantalla de inicio con apariencia de aplicación."}
        </p>
        {installPrompt && (
          <Button size="sm" className="mt-3" onClick={install}>
            <Download className="mr-2 h-4 w-4" />
            Instalar aplicación
          </Button>
        )}
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={dismiss} aria-label="Cerrar aviso">
        <X className="h-4 w-4" />
      </Button>
    </aside>
  );
}
