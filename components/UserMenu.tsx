"use client";

import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { UserAvatar } from "./UserAvatar";

export function UserMenu() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);

  const name = session?.user?.name;
  const image = session?.user?.image;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 rounded-full"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={name ? `Menu de ${name}` : "Menu du compte"}
      >
        <UserAvatar src={image} name={name} size={26} />
      </button>

      {open && (
        <>
          {/* Click-outside catcher */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            className="absolute right-0 top-[34px] z-20 flex min-w-[190px] flex-col gap-3 rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[var(--color-foreground)] shadow-lg"
            role="menu"
          >
            <div className="flex items-center gap-[9px]">
              <UserAvatar src={image} name={name} size={30} />
              <div className="min-w-0">
                <div className="truncate font-sans text-[13px] font-semibold">
                  {status === "loading" ? "…" : (name ?? "Compte")}
                </div>
                <div className="font-mono text-[9.5px] text-[var(--color-text-muted)]">
                  connecté via Discord
                </div>
              </div>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => signOut({ redirectTo: "/" })}
              className="rounded-sm border border-[var(--color-border-strong)] px-2 py-[6px] text-left font-sans text-xs font-medium"
            >
              Se déconnecter
            </button>
          </div>
        </>
      )}
    </div>
  );
}
