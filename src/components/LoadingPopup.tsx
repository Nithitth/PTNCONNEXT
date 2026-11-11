/**
 * The loading pop-up shown by every `loading.tsx` while a page is being built on the server.
 * A card in the middle of the page area (the nav bar stays usable): the flashing "t" logo, a Thai
 * explanation, and a small progress bar along the bottom of the card. Pure CSS, no client JS.
 * Under reduced motion the global rule in globals.css stops the animations, leaving a still logo and bar.
 */
export function LoadingPopup({
  title = "กำลังโหลด…",
  detail = "กำลังดึงข้อมูลล่าสุดจากเซิร์ฟเวอร์ อาจใช้เวลาสักครู่",
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 py-16">
      <div
        role="status"
        aria-live="polite"
        className="animate-pop w-full max-w-xs overflow-hidden rounded-3xl border border-line bg-surface text-center shadow-soft-lg"
      >
        <div className="px-6 pb-6 pt-8">
          <span
            aria-hidden
            className="animate-logo-flash bg-brand-gradient mx-auto grid h-16 w-16 place-items-center rounded-2xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny local logo, no optimisation needed */}
            <img src="/brand/arrow-white.png" alt="" className="h-9 w-9 object-contain" />
          </span>
          <p className="mt-5 font-display text-base font-bold text-ink">{title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{detail}</p>
        </div>
        {/* Progress bar along the bottom of the card */}
        <div aria-hidden className="mx-6 mb-6 h-1.5 overflow-hidden rounded-full bg-sunken">
          <div className="animate-loading-bar bg-brand-gradient relative h-full w-1/2 overflow-hidden rounded-full">
            <span className="animate-loading-shine absolute inset-y-0 left-0 w-1/2 bg-linear-to-r from-transparent via-white/60 to-transparent" />
          </div>
        </div>
      </div>
    </div>
  );
}
