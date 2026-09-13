import { useState } from "react";
import type { ReactNode } from "react";
import { KeyRound, Link2, Menu } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { useLogout } from "@/lib/queries";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function SidebarLink({
  to,
  end,
  icon: Icon,
  label,
  onNavigate,
}: {
  to: string;
  end?: boolean;
  icon: typeof Link2;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        )
      }
    >
      <Icon className="size-4" />
      {label}
    </NavLink>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleLogout(): void {
    logout.mutate(undefined, {
      onSettled: () => navigate("/login", { replace: true }),
    });
  }

  const nav = (
    <nav className="flex flex-col gap-1">
      <SidebarLink to="/" end icon={Link2} label="Links" onNavigate={() => setMobileOpen(false)} />
      <SidebarLink
        to="/keys"
        icon={KeyRound}
        label="API keys"
        onNavigate={() => setMobileOpen(false)}
      />
    </nav>
  );

  return (
    <div className="flex min-h-svh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto p-3">{nav}</div>
        <div className="space-y-3 border-t border-sidebar-border p-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
            <ThemeToggle />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleLogout}
            disabled={logout.isPending}
          >
            Log out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b">
                <SheetTitle>
                  <Logo />
                </SheetTitle>
                <SheetDescription className="sr-only">Navigation</SheetDescription>
              </SheetHeader>
              <div className="flex-1 p-3">{nav}</div>
              <SheetFooter className="border-t">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
                  <ThemeToggle />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleLogout}
                  disabled={logout.isPending}
                >
                  Log out
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
          <Logo />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
