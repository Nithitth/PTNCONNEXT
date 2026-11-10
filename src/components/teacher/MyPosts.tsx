import Link from "next/link";
import { CalendarClock, ExternalLink, FileText, Link2, Pencil } from "lucide-react";
import { dayKey, formatDayShort, formatTime } from "@/lib/calendar";
import { EXAM_KIND_LABEL, EXAM_LEAD_DAYS, KIND_LABEL } from "@/lib/postForm";
import type { MyPost } from "@/lib/posts";
import { EmptyState, cx, smallButtonStyles } from "@/components/ui";
import { DeletePostButton } from "./DeletePostButton";
import { KIND_STYLE } from "./kindStyle";

function whenLabel(post: MyPost, t: MyPost["targets"][number]) {
  if (!t.dueAt) return null;
  const day = formatDayShort(dayKey(t.dueAt));
  if (post.type === "assignment") return `ส่ง ${day} ${formatTime(t.dueAt)}`;
  if (post.type === "exam") return `สอบ ${day} · เตือน ${EXAM_LEAD_DAYS[post.examKind]} วันก่อน`;
  if (post.type === "event") {
    const end = t.endsAt ? dayKey(t.endsAt) : null;
    return end && end !== dayKey(t.dueAt) ? `${day} – ${formatDayShort(end)}` : day;
  }
  return null;
}

export function MyPosts({ posts }: { posts: MyPost[] }) {
  if (posts.length === 0) {
    return (
      <EmptyState
        icon={<FileText aria-hidden className="h-6 w-6" />}
        title="ยังไม่มีโพสต์"
        body="งาน เอกสาร และวันสอบที่คุณโพสต์จะแสดงที่นี่ แก้ไขหรือลบได้ตลอด"
      />
    );
  }

  return (
    <ul className="space-y-3">
      {posts.map((post, i) => {
        const style = KIND_STYLE[post.type];
        const isMajor = post.type === "exam" && post.examKind === "major";
        return (
          <li
            key={post.id}
            className={cx(
              "animate-rise rounded-2xl border border-line bg-surface p-4 shadow-soft-sm transition-shadow duration-200 hover:shadow-soft sm:p-5",
              i < 4 && `delay-${i + 1}`,
            )}
          >
            <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
              <div className="min-w-0 flex-1 basis-64">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={cx(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold",
                      isMajor ? "bg-major-soft text-urgent" : style.chip,
                    )}
                  >
                    <style.Icon aria-hidden className="h-3.5 w-3.5" />
                    {post.type === "exam" ? EXAM_KIND_LABEL[post.examKind] : KIND_LABEL[post.type]}
                  </span>
                  {post.subject && (
                    <span className="inline-flex items-center gap-1.5 text-muted">
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: post.subject.color }} />
                      {post.subject.name}
                    </span>
                  )}
                </div>
                <h3 className="mt-2 font-display text-lg font-bold leading-snug text-ink">{post.title}</h3>
                {post.description && (
                  <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm leading-relaxed text-muted">{post.description}</p>
                )}
              </div>
              <div className="flex shrink-0 items-start gap-1.5">
                <Link href={`/teacher/posts/${post.id}`} className={smallButtonStyles}>
                  <Pencil aria-hidden className="h-4 w-4" />
                  แก้ไข
                </Link>
                <DeletePostButton postId={post.id} title={post.title} />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.targets.map((t) => {
                const when = whenLabel(post, t);
                return (
                  <span
                    key={`${t.classroomId}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-sunken px-2.5 py-1 text-xs text-ink"
                  >
                    <b className="font-bold">{t.room}</b>
                    {when && (
                      <>
                        <CalendarClock aria-hidden className="h-3.5 w-3.5 text-faint" />
                        <span className="text-muted">{when}</span>
                      </>
                    )}
                  </span>
                );
              })}
              {post.attachments.map((a) => (
                <a
                  key={a.id}
                  href={a.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-bold text-brand transition-colors hover:border-brand/30 hover:bg-brand-soft"
                >
                  {a.kind === "file" ? <FileText aria-hidden className="h-3.5 w-3.5" /> : <Link2 aria-hidden className="h-3.5 w-3.5" />}
                  <span className="truncate">{a.name}</span>
                  <ExternalLink aria-hidden className="h-3 w-3 opacity-60" />
                </a>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
