import { useState } from "react";
import type { ReactNode } from "react";
import {
  ChevronDown,
  KeyRound,
  Link2,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { CommandPalette } from "@/components/command-palette";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth-store";
import { useLogout } from "@/lib/queries";
import { cn } from "@/lib/utils";

const SHORTCUT_HINT = /Mac|iPhone|iPad/.test(navigator.platform ?? "")
  ? "⌘K"
  : "Ctrl K";

function openCommandPalette(): void {
  window.dispatchEvent(new Event("open-command-palette"));
}

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
    "before:absolute before:top-1/2 before:left-0 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary before:transition-opacity",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground before:opacity-100"
      : "text-muted-foreground before:opacity-0 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
  );
}

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
    <NavLink to={to} end={end} onClick={onNavigate} className={navLinkClass}>
      <Icon className="size-4" />
      {label}
    </NavLink>
  );
}

function AccountMenu() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const logout = useLogout();
  const navigate = useNavigate();

  function handleLogout(): void {
    logout.mutate(undefined, {
      onSettled: () => navigate("/login", { replace: true }),
    });
  }

  const initial = user?.email.slice(0, 1).toUpperCase() ?? "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent/60"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {user?.email}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {user?.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} disabled={logout.isPending}>
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (onNavigate?: () => void) => (
    <nav className="flex flex-col gap-0.5">
      <SidebarLink to="/" end icon={Link2} label="Links" onNavigate={onNavigate} />
      <SidebarLink
        to="/keys"
        icon={KeyRound}
        label="API keys"
        onNavigate={onNavigate}
      />
    </nav>
  );

  const searchButton = (onOpen?: () => void) => (
    <button
      type="button"
      onClick={() => {
        onOpen?.();
        openCommandPalette();
      }}
      className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-background/40 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
    >
      <Search className="size-3.5" />
      Search…
      <kbd className="ml-auto rounded border border-sidebar-border px-1 font-sans text-[10px] tracking-wide">
        {SHORTCUT_HINT}
      </kbd>
    </button>
  );

  return (
    <div className="flex min-h-svh">
      <CommandPalette />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <Logo />
        </div>
        <div className="space-y-3 p-3">
          {searchButton()}
          {nav()}
        </div>
        <div className="mt-auto border-t border-sidebar-border p-3">
          <AccountMenu />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border/60 bg-background/95 px-4 backdrop-blur md:hidden">
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
              <div className="space-y-3 p-3">
                {searchButton(() => setMobileOpen(false))}
                {nav(() => setMobileOpen(false))}
              </div>
              <div className="mt-auto border-t p-3">
                <AccountMenu />
              </div>
            </SheetContent>
          </Sheet>
          <Logo />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div
            key={location.pathname}
            className="mx-auto w-full max-w-5xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
