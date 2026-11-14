// Shrinks files in the browser before they are uploaded, to save Supabase storage and downloads.
// - PDFs: every page is redrawn as a JPEG picture (pdf.js) and put into a new PDF (pdf-lib).
//   Slides usually shrink 60–90%, but text is no longer selectable, so the form offers "ใช้ไฟล์ต้นฉบับ".
// - Photos: resized to a readable size and saved as JPEG.
// The libraries are loaded only when a file is picked, so other pages stay light.
// Browser only: uses canvas, Worker and createImageBitmap.

export type CompressProgress = { page: number; pages: number; pass: 1 | 2 };

export type CompressResult = {
  file: File;
  /** False when the original was kept (already small, or compression didn't help). */
  compressed: boolean;
  originalSize: number;
};

/** A problem the user should see (Thai message). */
export class CompressError extends Error {}

const SKIP_BELOW = 1024 * 1024; // PDFs of 1 MB or less are left alone
const KEEP_IF_SAVING_UNDER = 0.8; // keep the original unless we save at least 20%
const MAX_PAGES = 300;
const PASSES = [
  { longEdge: 1750, quality: 0.72 }, // ≈150 DPI on A4
  { longEdge: 1200, quality: 0.6 },
] as const;

const asPdfFile = (bytes: Uint8Array, name: string) =>
  new File([bytes as BlobPart], name, { type: "application/pdf", lastModified: Date.now() });

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", quality),
  );
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), {
      type: "module",
    });
  }
  return pdfjs;
}

/**
 * Compresses a PDF so it fits `maxBytes`. Keeps the original when it already fits and compression saves
 * less than 20%. Throws CompressError (Thai message) when the file can't be made to fit.
 */
export async function compressPdf(
  file: File,
  { maxBytes, onProgress }: { maxBytes: number; onProgress?: (p: CompressProgress) => void },
): Promise<CompressResult> {
  const original: CompressResult = { file, compressed: false, originalSize: file.size };
  const fits = file.size <= maxBytes;
  const limit = `${Math.round(maxBytes / 1024 / 1024)} MB`;
  if (file.size <= SKIP_BELOW) return original;

  const [pdfjs, { PDFDocument }] = await Promise.all([loadPdfjs(), import("pdf-lib")]);

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch {
    void task.destroy();
    if (fits) return original;
    throw new CompressError(`ไฟล์นี้ย่อขนาดไม่ได้ (อาจมีรหัสผ่านหรือไฟล์เสีย) และใหญ่เกิน ${limit} แชร์เป็นลิงก์ Google Drive แทน`);
  }

  try {
    const pages = doc.numPages;
    if (pages > MAX_PAGES) {
      if (fits) return original;
      throw new CompressError(`ไฟล์มีมากกว่า ${MAX_PAGES} หน้า ย่อขนาดไม่ได้ แชร์เป็นลิงก์ Google Drive แทน`);
    }

    let best: File | null = null;
    for (const [i, { longEdge, quality }] of PASSES.entries()) {
      const out = await PDFDocument.create();
      for (let n = 1; n <= pages; n++) {
        onProgress?.({ page: n, pages, pass: (i + 1) as 1 | 2 });
        const page = await doc.getPage(n);
        const size = page.getViewport({ scale: 1 }); // in PDF points, rotation applied
        const viewport = page.getViewport({ scale: longEdge / Math.max(size.width, size.height) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no canvas");
        ctx.fillStyle = "#ffffff"; // JPEG has no transparency
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, viewport }).promise;
        const jpeg = new Uint8Array(await (await toJpeg(canvas, quality)).arrayBuffer());
        canvas.width = canvas.height = 0; // free memory on phones
        page.cleanup();
        const image = await out.embedJpg(jpeg);
        out.addPage([size.width, size.height]).drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });
      }
      const result = asPdfFile(await out.save(), file.name);
      if (!best || result.size < best.size) best = result;
      if (best.size <= maxBytes) break;
    }

    if (!best || (fits && best.size > file.size * KEEP_IF_SAVING_UNDER)) return original;
    if (best.size > maxBytes) {
      throw new CompressError("ไฟล์ใหญ่เกินไปแม้ย่อแล้ว แชร์เป็นลิงก์ Google Drive แทน");
    }
    return { file: best, compressed: true, originalSize: file.size };
  } catch (e) {
    if (e instanceof CompressError) throw e;
    if (fits) return original;
    throw new CompressError(`ย่อขนาดไฟล์ไม่สำเร็จ และไฟล์ใหญ่เกิน ${limit} แชร์เป็นลิงก์ Google Drive แทน`);
  } finally {
    void task.destroy();
  }
}

/**
 * Resizes a photo (JPG/PNG/WEBP) to a long edge of at most 2,000 px and saves it as JPEG, so it fits
 * `maxBytes`. Keeps the original when that is already smaller. Throws CompressError when it can't fit.
 */
export async function compressImage(file: File, { maxBytes }: { maxBytes: number }): Promise<CompressResult> {
  const original: CompressResult = { file, compressed: false, originalSize: file.size };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // follows the photo's rotation (EXIF)
  } catch {
    if (file.size <= maxBytes) return original;
    throw new CompressError("เปิดรูปนี้ไม่ได้ ลองถ่ายใหม่หรือใช้รูปอื่น");
  }

  try {
    let best: Blob | null = null;
    for (const { longEdge, quality } of [
      { longEdge: 2000, quality: 0.8 },
      { longEdge: 1600, quality: 0.6 },
    ]) {
      const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await toJpeg(canvas, quality);
      canvas.width = canvas.height = 0;
      if (!best || blob.size < best.size) best = blob;
      if (best.size <= maxBytes) break;
    }
    if (!best || (file.size <= maxBytes && best.size >= file.size)) return original;
    if (best.size > maxBytes) throw new CompressError("รูปใหญ่เกินไปแม้ย่อแล้ว ลองใช้รูปอื่น");
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return { file: new File([best], name, { type: "image/jpeg", lastModified: Date.now() }), compressed: true, originalSize: file.size };
  } finally {
    bitmap.close();
  }
}
