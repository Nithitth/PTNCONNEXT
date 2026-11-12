import { TcasTabs } from "@/components/tcas/TcasTabs";
import { getCurrentProfile } from "@/lib/auth";

/** Staff get the TCAS tabs (search, stats) on every /tcas page. Each page still checks access itself. */
export default async function TcasLayout({ children }: LayoutProps<"/tcas">) {
  const profile = await getCurrentProfile();
  return (
    <>
      {profile && profile.role !== "student" && <TcasTabs />}
      {children}
    </>
  );
}
