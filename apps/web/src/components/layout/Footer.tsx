import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
] as const;

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative z-10 border-t border-cyan-500/20 bg-black/45 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[2100px] flex-col items-center gap-3 px-4 py-6 text-sm text-foreground/60 sm:flex-row sm:justify-between sm:px-6 xl:px-10">
        <p>&copy; {year} KeyTone. All rights reserved.</p>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-cyan-200"
            >
              {link.label}
            </Link>
          ))}
          <a
            href="mailto:rectrix21@gmail.com"
            className="hover:text-cyan-200"
          >
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
