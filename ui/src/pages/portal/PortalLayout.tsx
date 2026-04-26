import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { portalApi, PortalApiError } from "@/api/portal";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function PortalLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: branding } = useQuery({
    queryKey: ["portal", "branding"],
    queryFn: () => portalApi.branding(),
    retry: false,
  });

  const { data: me, isError, error } = useQuery({
    queryKey: ["portal", "me"],
    queryFn: () => portalApi.me(),
    retry: false,
  });

  useEffect(() => {
    if (
      isError &&
      error instanceof PortalApiError &&
      error.status === 401
    ) {
      navigate("/portal/login", { replace: true });
    }
  }, [isError, error, navigate]);

  const productName = branding?.productName ?? "Avero Enterprise";
  const primaryColor = branding?.primaryColor ?? "#F5C518";

  async function handleLogout() {
    const token = localStorage.getItem("avero.portal.token");
    localStorage.removeItem("avero.portal.token");
    if (token) {
      try {
        await portalApi.logout(token);
      } catch {
        // ignore logout errors
      }
    }
    queryClient.clear();
    navigate("/portal/login", { replace: true });
  }

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      style={{ "--portal-primary": primaryColor } as React.CSSProperties}
    >
      {/* Top nav */}
      <header
        className="border-b border-border px-6 h-14 flex items-center justify-between flex-shrink-0"
        style={{ borderBottomColor: `${primaryColor}33` }}
      >
        <span
          className="font-bold text-base tracking-tight"
          style={{ color: primaryColor }}
        >
          {productName}
        </span>

        <div className="flex items-center gap-3">
          {me && (
            <span className="text-sm text-muted-foreground hidden sm:block">
              {me.name}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="flex items-center gap-1.5"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-4xl w-full mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
