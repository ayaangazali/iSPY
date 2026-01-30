import Link from "next/link"

export function HeaderNav() {
  const links = [
    { href: "/pages/upload", label: "Upload" },
    { href: "/pages/realtimeStreamPage", label: "Realtime" },
    { href: "/pages/saved-videos", label: "Library" },
    { href: "/pages/statistics", label: "Statistics" },
  ]

  return (
    <nav className="hidden md:flex items-center gap-1">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="px-3 py-2 text-sm font-medium text-gray hover:text-white transition-all duration-200 rounded-md hover:bg-white/5"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
