import Image from "next/image";
import Link from "next/link";
import { getCurrentProfile, type Role } from "@/lib/auth";
import { formatClassroom } from "@/lib/roster";
import { NavLinks, type NavItem } from "./NavLinks";

function itemsFor(role: Role | null): NavItem[] {
  const items: NavItem[] = [{ href: "/", label: "หน้าแรก", icon: "home" }];
  // The games room is public, so guests see it too.
  if (!role) return [...items, { href: "/play", label: "เกม", icon: "play" }];
  items.push(
    { href: "/calendar", label: "ปฏิทิน", icon: "calendar" },
    { href: "/tcas", label: "TCAS", icon: "tcas" },
  );
  items.push({ href: "/roadmap", label: "Roadmap", icon: "roadmap", badge: "ใหม่" }, { href: "/play", label: "เกม", icon: "play" });
  if (role === "teacher" || role === "admin") items.push({ href: "/teacher", label: "คอนโซลครู", icon: "teacher" });
  if (role === "admin") items.push({ href: "/admin", label: "คอนโซลผู้พัฒนา", icon: "admin" });
  return items;
}

// Logo artwork lives in public/brand/ (cut from the official logo files).
const LOGO_RATIO = 1424 / 206;

export function Logo({ size = "md", tone = "red" }: { size?: "sm" | "md" | "lg"; tone?: "red" | "white" }) {
  const h = size === "sm" ? 18 : size === "lg" ? 40 : 26;
  return (
    <Link
      href="/"
      aria-label="PTN Connext หน้าแรก"
      className="group inline-flex shrink-0 items-center transition-transform duration-200 hover:-translate-y-0.5"
    >
      <Image
        src={tone === "white" ? "/brand/ptn-connext-white.png" : "/brand/ptn-connext-red.png"}
        alt="PTN Connext"
        width={Math.round(h * LOGO_RATIO)}
        height={h}
        priority={size === "md"}
        className="h-auto"
        style={{ width: Math.round(h * LOGO_RATIO) }}
      />
    </Link>
  );
}

export async function NavBar() {
  const profile = await getCurrentProfile();
  const items = itemsFor(profile?.role ?? null);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-8 px-4 sm:px-6">
        <div className="flex h-16 flex-1 items-center md:flex-none">
          <Logo />
        </div>
        <div className="order-3 -mx-4 w-[calc(100%+2rem)] border-t border-line px-2 md:order-none md:mx-0 md:w-auto md:flex-1 md:border-0 md:px-0">
          <NavLinks items={items} />
        </div>
        <div className="flex h-16 items-center">
          {profile ? (
            <Link
              href="/account"
              className="group flex items-center gap-2.5 rounded-xl border border-transparent py-1 pl-1 pr-1 text-sm text-ink transition-all duration-150 hover:border-line-strong hover:bg-surface hover:shadow-soft-sm sm:pr-3"
              title="ข้อมูลบัญชี"
            >
              <span
                aria-hidden
                className="bg-brand-gradient grid h-9 w-9 place-items-center rounded-lg text-sm font-bold text-white transition-transform duration-200"
              >
                {initial(profile.display_name)}
              </span>
              <span className="hidden max-w-52 flex-col leading-tight sm:flex">
                <span className="truncate font-bold">{profile.display_name}</span>
                <span className="text-xs text-muted">
                  {profile.classroom ? `ห้อง ${formatClassroom(profile.classroom)}` : ROLE_LABEL[profile.role]}
                </span>
              </span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-xl border border-brand bg-brand px-4 text-sm font-bold text-white shadow-brand-glow transition-all duration-150 hover:-translate-y-0.5 hover:bg-brand-hot hover:shadow-brand-glow-lg active:translate-y-0 active:scale-[0.98] active:shadow-soft-sm sm:px-5"
            >
              เข้าสู่ระบบ
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

const ROLE_LABEL: Record<Role, string> = { student: "นักเรียน", teacher: "ครู", admin: "ผู้ดูแลระบบ" };

/** First letter of the given name, skipping Thai titles like ด.ญ., นาย, ครู. */
function initial(name: string) {
  const stripped = name.replace(/^(ด\.ช\.|ด\.ญ\.|นาย|นางสาว|นาง|น\.ส\.|ครู|อาจารย์)\s*/, "");
  return Array.from(stripped)[0] ?? "?";
}
