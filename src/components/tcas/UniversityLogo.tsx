import Image from "next/image";
import { cx } from "@/components/ui";
import { universityShort } from "@/lib/tcas";
import { UNIVERSITY_ART } from "@/lib/tcasArt";

/** A university's emblem in a small white circle (list rows, headers, compare table). */
export function UniversityLogo({ id, size = 40, className }: { id: string; size?: number; className?: string }) {
  const emblem = UNIVERSITY_ART[id]?.emblem;
  return (
    <span
      className={cx("grid shrink-0 place-items-center rounded-full border border-line bg-white", className)}
      style={{ width: size, height: size }}
    >
      {emblem && (
        <Image src={emblem} alt={universityShort(id)} width={size} height={size} className="h-[70%] w-[70%] object-contain" />
      )}
    </span>
  );
}
