export type NavItem = { href: string; label: string; short: string; icon: string };

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" },
  { href: "/charts", label: "Charts", short: "Charts", icon: "M4 19V5M4 19h16M8 15l3-3 3 2 4-5" },
  { href: "/strategy", label: "Strategy", short: "Strategy", icon: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
  { href: "/journal", label: "Journal", short: "Journal", icon: "M4 4h16v16H4zM4 9h16M9 4v16" },
  { href: "/notebook", label: "Notebook", short: "Notes", icon: "M15.5 3.5a2.12 2.12 0 0 1 3 3L8 17l-4 1 1-4z" },
  { href: "/news", label: "News", short: "News", icon: "M4 5h13v14H4zM7 8h7M7 12h7M7 16h5M17 8h3v9a2 2 0 0 1-2 2" },
  { href: "/sessions", label: "Sessions", short: "Time", icon: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7v5l3.5 2" },
  { href: "/sidekick", label: "Sidekick", short: "Sidekick", icon: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" },
  { href: "/sanctuary", label: "Calm", short: "Calm", icon: "M12 21C7 18 4 14 4 10a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 4-3 8-8 11z" },
  { href: "/risk", label: "Risk", short: "Risk", icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v4M12 16h.01" },
];

export const PROFILE: NavItem = {
  href: "/profile",
  label: "Profile",
  short: "Profile",
  icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0",
};
