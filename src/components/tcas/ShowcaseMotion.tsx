"use client";

import { useLayoutEffect } from "react";

/**
 * Scroll effects for the TCAS page (renders nothing):
 * - lands on the results (#search) after a search;
 * - sets `--scroll` (px) on the window section for the parallax props (.tcas-parallax);
 * - reveals `[data-reveal]` elements as they scroll into view.
 * Does nothing when the user prefers reduced motion, so everything just shows.
 */
export function ShowcaseMotion({ sectionId }: { sectionId: string }) {
  useLayoutEffect(() => {
    // After a search (a full page load to /tcas?...#search) the browser doesn't reliably keep the
    // jump to the results once the page has hydrated, so do it here.
    if (window.location.hash === "#search") {
      requestAnimationFrame(() => document.getElementById("search")?.scrollIntoView({ block: "start" }));
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    const section = document.getElementById(sectionId);
    root.classList.add("tcas-motion");

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        section?.style.setProperty("--scroll", String(Math.min(window.scrollY, 1400)));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-shown", "");
          observer.unobserve(e.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -4% 0px" },
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));

    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.classList.remove("tcas-motion");
    };
  }, [sectionId]);

  return null;
}
