import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { portalApi, PortalApiError } from "@/api/portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PortalLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: branding } = useQuery({
    queryKey: ["portal", "branding"],
    queryFn: () => portalApi.branding(),
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: () => portalApi.login(email, password),
    onSuccess: (data) => {
      localStorage.setItem("avero.portal.token", data.token);
      navigate("/portal/dashboard", { replace: true });
    },
    onError: (err) => {
      if (err instanceof PortalApiError) {
        setError(err.message);
      } else {
        setError("Sign in failed. Please try again.");
      }
    },
  });

  const productName = branding?.productName ?? "Avero Enterprise";
  const primaryColor = branding?.primaryColor ?? "#F5C518";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    loginMutation.mutate();
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background px-4"
      style={{ "--portal-primary": primaryColor } as React.CSSProperties}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1
            className="text-2xl font-bold"
            style={{ color: primaryColor }}
          >
            {productName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Customer Portal</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sign In</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
                style={{ backgroundColor: primaryColor, color: "#fff", borderColor: primaryColor }}
              >
                {loginMutation.isPending ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
