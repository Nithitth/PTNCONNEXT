# PTN Connext: how much can it handle? (free plans)

Written 2026-11-13. The site runs on **Supabase Free** and **Vercel Hobby (free)**.
Every limit below comes from the official pages, checked that day:
- supabase.com/pricing
- supabase.com/docs/guides/auth/rate-limits
- supabase.com/docs/guides/platform/compute-and-disk
- vercel.com/docs/limits
- vercel.com/pricing

Free plans change. Check those pages again before relying on a number.

**Example school used for the monthly numbers:** 500 students and 30 teachers, 22 school days a month, and about 15 page views per student per school day. That makes about **165,000 page views a month**. Double the use and the numbers double.

**What was in the system when this was written:** 4 test accounts, 632 TCAS programs, and 2 PDFs (0.8 MB and 5.9 MB).

## Summary

| What | Free-plan limit | What it means for us | Risk |
|---|---|---|---|
| **Accounts** | 50,000 active users a month (Supabase) | The whole school fits many times over | none |
| **Logins at the same moment** | 150 sign-in or session-renew requests per 5 minutes **per IP address**, with a burst of 30 (Supabase Auth) | Logins go through our Vercel server, so **the whole site shares one budget**. About 30 people can sign in instantly, then about 30 per minute. If 500 students all sign in at once, the last ones wait about **17 minutes**, and the rest see "try again in a moment". After signing in once, people stay signed in, so this mainly hurts on launch day | **high on launch day** |
| **People using it at the same moment** | Vercel: up to 30,000 at once. Database: the smallest size (shared CPU, 0.5 GB RAM) | The database is the limit. Estimate (not measured): about 100–200 page views per second. 500 students opening the site within the same minute is about 8 per second, which is fine | low |
| **Page views per month** | Vercel: 1 million function runs and 4 hours of CPU a month | One page view uses about 2–4 runs and 30–50 ms of CPU. That allows **about 250,000–480,000 page views a month**, or 11,000–22,000 per school day. The example school uses about 35–65% | medium |
| **Teacher PDF size** | Stored file: **10 MB or less**. A teacher may **pick up to 50 MB**, which is shrunk automatically (see below) | Files go straight from the phone to Supabase, so Vercel's 4.5 MB limit doesn't apply | none |
| **Roadmap proof file** | Stored: 5 MB. Pick: up to 20 MB, shrunk automatically | | none |
| **All files together** | **1 GB** (teacher PDFs and Roadmap proofs share it) | ~100 PDFs at 10 MB, ~300 at 3.4 MB, ~1,000 at 1 MB. Teacher PDFs are deleted after **180 days**, so the space keeps freeing itself | medium (was high before compression and auto-delete) |
| **PDF downloads** | **5 GB of downloads a month**, shared with all database traffic | The database uses about 1–2.5 GB a month, which leaves **about 2.5–4 GB for PDFs** | **highest** |
| **Database size** | 500 MB | A few MB today. The login log grows about 60 MB a year; everything else is tiny. Room for several years | low |
| **Page/image traffic** | Vercel: 100 GB a month | About 50 KB per page view, which is about 2 million page views. Not a limit | none |
| **Switched off when unused** | Supabase pauses a free project after **1 week with no use** | Over a school holiday the site goes down until someone presses "Restore" in Supabase | **high over holidays** |

## PDF downloads: the first thing to run out

Each time someone opens or downloads a PDF, the whole file counts against the 5 GB. Opening the same file twice counts twice.

| PDF size | One room (40 students) | All 8 rooms (320 students) | Whole school (500) |
|---|---|---|---|
| 10 MB (largest allowed) | 400 MB, about 6–10 per month | 3.2 GB, about 1 per month | 5 GB, **the whole month** |
| 3.4 MB (average before compression) | 136 MB, about 20–30 per month | 1.1 GB, about 2–3 per month | 1.7 GB, about 1–2 per month |
| **1 MB (typical after auto-compression)** | 40 MB, **about 70–100 per month** | 320 MB, **about 8–12 per month** | 500 MB, about 5–8 per month |

Supabase also lists a separate 5 GB of "cached" downloads. Its pages don't say whether our private, signed PDF links count as cached, so that 5 GB is not counted here.

If a free limit is exceeded, sign-in returns an error (HTTP 429). The pages don't say exactly what happens for downloads and storage. A free plan can't buy extra, so expect the project to be restricted until the next month.

## What runs out first

1. **PDF downloads** (5 GB a month). Compression makes this about 3× larger in practice.
2. **Many logins at once on launch day.**
3. **Holiday pause** after 1 week of no use.
4. **Vercel function runs**, only if use is about twice the example school's.

## What the site does to save space

- **Automatic compression.** When a teacher picks a PDF, the browser redraws each page as a compressed picture before uploading it. Slide decks usually shrink 60–90%. The teacher can choose "ใช้ไฟล์ต้นฉบับ" when the text must stay selectable. Roadmap proof photos are shrunk too.
- **Teacher PDFs expire after 180 days.** Every file shows a countdown. Teachers get a pop-up window 14 days before their files are deleted. A daily clean-up deletes expired files, and after that they can't be downloaded. Uploading the file again restarts the 180 days.

## Ways to get more room

- **Share big or popular files as Google Drive links.** These use none of our Supabase downloads.
- **Launch room by room** (one room every couple of minutes), or raise the sign-in limit in Supabase → Authentication → Rate Limits.
- **Supabase Pro ($25 a month):** 250 GB downloads, 100 GB files, 8 GB database, and no holiday pause.
- **Vercel Hobby** is for non-commercial use. A school project is likely fine, but check Vercel's terms.

## Not measured yet

- How many requests per second the database really handles.
- How many function runs and how much CPU one page view really uses.

Check the Vercel and Supabase usage pages after the first pilot week, and update this file.
