import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, MailCheck } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { useForgotPassword } from "@/lib/queries";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const forgot = useForgotPassword();

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    forgot.mutate(email);
  }

  const errorMessage =
    forgot.error instanceof ApiError
      ? forgot.error.message
      : forgot.error
        ? "Could not send the email."
        : null;

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we will send you a reset link."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      {forgot.isSuccess ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="size-8 text-primary" />
          <p className="text-sm">
            If an account exists for <span className="font-medium">{email}</span>, a
            reset link is on its way.
          </p>
          <p className="text-xs text-muted-foreground">
            Running locally? The console mailer logs the link in the API output.
          </p>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" className="w-full" disabled={forgot.isPending}>
            {forgot.isPending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
