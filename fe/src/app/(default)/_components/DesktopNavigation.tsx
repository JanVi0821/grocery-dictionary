import Link from "next/link";
import { navigationItems } from "./navigation-items";

export function DesktopNavigation() {
  return (
    <nav className="hidden flex-1 justify-center lg:flex" aria-label="Primary navigation">
      <ul className="flex items-center gap-control-gap">
        {navigationItems.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="focus-ring flex min-h-touch items-center gap-control-gap rounded-pill px-control-x text-label font-semibold text-foreground-muted hover:text-foreground">
              <Icon className="size-nav-icon" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
