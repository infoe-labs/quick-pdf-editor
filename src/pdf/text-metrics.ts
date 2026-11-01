import { OPS } from "pdfjs-dist";
import type { PDFPageProxy } from "pdfjs-dist";
export interface RunMetrics {
  fontId: string;
  text: string;
  advances: number[];
  characterSpacing: number;
  wordSpacing: number;
  horizontalScale: number;
  textRise: number;
}
interface Glyph {
  unicode?: string;
  width?: number;
  isSpace?: boolean;
}
// PDF.js normalizes text-showing operators. Isolated adapter: unknown glyphs and
// vertical writing deliberately leave geometry unresolved instead of inventing it.
export async function textMetrics(page: PDFPageProxy): Promise<RunMetrics[]> {
  const ops = await page.getOperatorList();
  const result: RunMetrics[] = [];
  let fontId = "",
    fontSize = 0,
    characterSpacing = 0,
    wordSpacing = 0,
    horizontalScale = 1,
    textRise = 0;
  const stack: {
    fontId: string;
    fontSize: number;
    characterSpacing: number;
    wordSpacing: number;
    horizontalScale: number;
    textRise: number;
  }[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];
    if (fn === OPS.save)
      stack.push({
        fontId,
        fontSize,
        characterSpacing,
        wordSpacing,
        horizontalScale,
        textRise,
      });
    else if (fn === OPS.restore) {
      const s = stack.pop();
      if (s)
        ({
          fontId,
          fontSize,
          characterSpacing,
          wordSpacing,
          horizontalScale,
          textRise,
        } = s);
    } else if (fn === OPS.setFont) {
      fontId = String(args[0]);
      fontSize = Number(args[1]);
    } else if (fn === OPS.setCharSpacing) characterSpacing = Number(args[0]);
    else if (fn === OPS.setWordSpacing) wordSpacing = Number(args[0]);
    else if (fn === OPS.setHScale) horizontalScale = Number(args[0]) / 100;
    else if (fn === OPS.setTextRise) textRise = Number(args[0]);
    else if (fn === OPS.showText && Array.isArray(args[0])) {
      let text = "",
        width = 0,
        valid = true;
      const advances = [0];
      for (const value of args[0] as (Glyph | number)[]) {
        if (typeof value === "number") {
          width -= (value * fontSize) / 1000;
          advances[advances.length - 1] = width;
          continue;
        }
        const chars = value.unicode;
        if (!chars || typeof value.width !== "number" || chars.length !== 1) {
          valid = false;
          break;
        }
        text += chars;
        width +=
          (value.width * fontSize) / 1000 +
          characterSpacing +
          (value.isSpace ? wordSpacing : 0);
        advances.push(width);
      }
      if (valid && width > 0)
        result.push({
          fontId,
          text,
          advances: advances.map((v) => v / width),
          characterSpacing,
          wordSpacing,
          horizontalScale,
          textRise,
        });
    }
  }
  return result;
}
