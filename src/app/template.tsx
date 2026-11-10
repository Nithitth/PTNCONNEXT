import type { ReactNode } from "react";

// A template re-mounts on every navigation, so each page slides in.
export default function Template({ children }: { children: ReactNode }) {
  return <div className="animate-page">{children}</div>;
}
