import type { Metadata } from "next";
import { LavaPlay } from "@/components/home/LavaPlay";
import { GlassStack } from "@/components/play/GlassStack";
import { Container } from "@/components/ui";

export const metadata: Metadata = { title: "ห้องเกม" };

/** /play: the games room. ตึกแก้ว (Glass Stack) and the ลาวาแก้ว fidget toy. Public; nothing is stored on the server. */
export default function PlayPage() {
  return (
    <Container className="space-y-16 py-8">
      <GlassStack />
      <section aria-label="ลาวาแก้ว">
        <LavaPlay />
      </section>
    </Container>
  );
}
