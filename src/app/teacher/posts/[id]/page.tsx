import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { PostForm, type FormInitial } from "@/components/teacher/PostForm";
import { Card, Container, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { isoToBangkokInput } from "@/lib/calendar";
import { KIND_LABEL, SCHOOL, isUuid } from "@/lib/postForm";
import { loadManagedPosts, type MyPost } from "@/lib/posts";
import { createClient } from "@/lib/supabase/server";
import { loadCurrentRooms, loadTeachingOptions } from "@/lib/teaching";

export const metadata: Metadata = { title: "แก้ไขโพสต์" };

function toInitial(post: MyPost): FormInitial {
  const first = post.targets[0];
  return {
    subjectId: post.subjectId ?? "",
    title: post.title,
    description: post.description,
    contentOrder: post.type === "material" && post.contentOrder ? String(post.contentOrder) : "",
    examKind: post.examKind,
    rooms: Object.fromEntries(
      post.targets.map((t) => [
        t.classroomId ?? SCHOOL,
        t.dueAt ? isoToBangkokInput(t.dueAt, false) : "", // date only; assignments are due at 23:59
      ]),
    ),
    eventStart: first?.dueAt ? isoToBangkokInput(first.dueAt, false) : "",
    eventEnd: first?.endsAt ? isoToBangkokInput(first.endsAt, false) : "",
  };
}

export default async function EditPostPage({ params }: PageProps<"/teacher/posts/[id]">) {
  const profile = await requireProfile({ roles: ["teacher", "admin"] });
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const isAdmin = profile.role === "admin";
  const [[post], subjects, rooms] = await Promise.all([
    loadManagedPosts(supabase, profile, { id, limit: 1 }),
    loadTeachingOptions(supabase, profile),
    loadCurrentRooms(supabase),
  ]);
  if (!post) notFound();
  const kind = post.type;

  return (
    <Container className="py-10">
      <Link
        href="/teacher?tab=mine"
        className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 text-sm font-bold text-muted transition-colors hover:bg-surface hover:text-brand"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {isAdmin ? "โพสต์ทั้งหมด" : "งานของฉัน"}
      </Link>
      <PageHeader eyebrow={`แก้ไข${KIND_LABEL[kind]}`} title={post.title} />
      <Card bold className="mx-auto max-w-3xl">
        <h2 className="mb-6 flex items-center gap-2.5 font-display text-xl font-bold text-ink">
          <span className="bg-brand-gradient grid h-9 w-9 place-items-center rounded-xl text-white shadow-brand-glow">
            <Pencil aria-hidden className="h-4 w-4" />
          </span>
          แก้ไขรายละเอียด
        </h2>
        <PostForm
          kind={kind}
          userId={profile.id}
          subjects={subjects}
          rooms={rooms}
          allowSchoolWide={isAdmin && kind === "event"}
          editing={{ postId: post.id, initial: toInitial(post), current: post.attachments[0] ?? null }}
        />
      </Card>
    </Container>
  );
}
