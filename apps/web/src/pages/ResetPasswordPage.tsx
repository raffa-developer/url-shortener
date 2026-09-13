import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { useResetPassword } from "@/lib/queries";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const reset = useResetPassword();

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    setClientError(null);

    if (password.length < 8) {
      setClientError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setClientError("Passwords do not match.");
      return;
    }

    reset.mutate({ token, password });
  }

  const errorMessage =
    clientError ??
    (reset.error instanceof ApiError
      ? reset.error.message
      : reset.error
        ? "Could not reset the password."
        : null);

  if (reset.isSuccess) {
    return (
      <AuthShell
        title="Password updated"
        subtitle="Your password has been changed and all sessions were signed out."
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 className="size-8 text-primary" />
          <Button asChild className="w-full">
            <Link to="/login">Sign in with your new password</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="This link is single-use and expires one hour after it was sent."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      {!token ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            This reset link is missing its token. Request a new one from the
            &ldquo;Forgot password?&rdquo; page.
          </AlertDescription>
        </Alert>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmation">Confirm new password</Label>
            <Input
              id="confirmation"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          </div>
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" className="w-full" disabled={reset.isPending}>
            {reset.isPending ? "Updating…" : "Update password"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
