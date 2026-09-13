import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { useVerifyEmail } from "@/lib/queries";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const verify = useVerifyEmail();
  const attempted = useRef(false);

  useEffect(() => {
    if (token && !attempted.current) {
      attempted.current = true;
      verify.mutate(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const errorMessage =
    verify.error instanceof ApiError ? verify.error.message : null;

  return (
    <AuthShell
      title="Verify your email"
      subtitle="This confirms the address on your account."
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
            This link is missing its token. Open the link from your email, or resend
            it from the dashboard.
          </AlertDescription>
        </Alert>
      ) : verify.isSuccess ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 className="size-8 text-primary" />
          <p className="text-sm">Your email address is verified.</p>
          <Button asChild className="w-full">
            <Link to="/">Go to the dashboard</Link>
          </Button>
        </div>
      ) : verify.isError ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            {errorMessage ?? "This verification link is invalid or has expired."}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Verifying…</p>
        </div>
      )}
    </AuthShell>
  );
}
