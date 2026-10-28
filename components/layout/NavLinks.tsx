"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { ADMIN_NAV_ITEM, isActivePath, NAV_ITEMS, type NavItem } from "./nav-items";
import { useT } from "@/lib/i18n/client";

const itemClass =
  "flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary-strong";

function NavLink({ item, pathname, nested }: { item: NavItem; pathname: string; nested?: boolean }) {
  const t = useT();
  const active = item.exact ? pathname === item.href : isActivePath(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        itemClass,
        nested && "pl-9",
        active ? "bg-primary-soft text-primary-soft-foreground" : "text-text hover:bg-background",
      )}
    >
      <item.icon className="size-4 shrink-0" aria-hidden="true" />
      {t(item.label)}
    </Link>
  );
}

function NavGroup({ item, pathname }: { item: NavItem; pathname: string }) {
  const t = useT();
  const groupActive = isActivePath(pathname, item.href);
  const [open, setOpen] = useState(groupActive);
  const listId = `nav-group-${item.label.toLowerCase()}`;
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className={cn(itemClass, "justify-between text-text hover:bg-background", groupActive && "text-primary-strong")}
      >
        <span className="flex items-center gap-2">
          <item.icon className="size-4 shrink-0" aria-hidden="true" />
          {t(item.label)}
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? (
        <ul id={listId} className="mt-1 flex flex-col gap-1">
          {item.children?.map((child) => (
            <li key={child.href}>
              <NavLink item={child} pathname={pathname} nested />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function NavLinks({ isAdmin = false }: { isAdmin?: boolean }) {
  const t = useT();
  const pathname = usePathname();
  const items = isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;
  return (
    <nav aria-label={t("Main")}>
      <ul className="flex flex-col gap-1">
        {items.map((item) =>
          item.children ? (
            <NavGroup key={item.href} item={item} pathname={pathname} />
          ) : (
            <li key={item.href}>
              <NavLink item={item} pathname={pathname} />
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
