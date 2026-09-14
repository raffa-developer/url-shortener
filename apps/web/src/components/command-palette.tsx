import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Link2, LogOut, Monitor, Moon, Plus, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useLogout } from "@/lib/queries";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const logout = useLogout();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onOpen = () => setOpen(true);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("open-command-palette", onOpen);
    };
  }, []);

  function run(action: () => void): void {
    setOpen(false);
    action();
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => run(() => navigate("/"))}>
            <Link2 /> Links
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/keys"))}>
            <KeyRound /> API keys
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Create">
          <CommandItem
            onSelect={() =>
              run(() => {
                navigate("/");
                window.dispatchEvent(new Event("open-create-link"));
              })
            }
          >
            <Plus /> New short link
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Appearance">
          <CommandItem onSelect={() => run(() => setTheme("light"))}>
            <Sun /> Light
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("dark"))}>
            <Moon /> Dark
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("system"))}>
            <Monitor /> System
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Account">
          <CommandItem
            onSelect={() =>
              run(() =>
                logout.mutate(undefined, {
                  onSettled: () => navigate("/login", { replace: true }),
                }),
              )
            }
          >
            <LogOut /> Log out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
