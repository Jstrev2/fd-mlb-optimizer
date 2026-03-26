"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Zap } from "lucide-react";
const NAV = [
  { href: "/", label: "Players", icon: Users },
  { href: "/lineup", label: "Optimize", icon: Zap },
];
export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-md border-t border-white/10">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== "/" && path.startsWith(href));
          return (
            <Link key={href} href={href} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${active ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-300"}`}>
              <Icon size={22} strokeWidth={active ? 2.5 : 1.5} />
              <span className="text-[10px] font-semibold tracking-wider">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
