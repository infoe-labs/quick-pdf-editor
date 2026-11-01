import { mkdir, writeFile } from "node:fs/promises";
import { fixture } from "./fixtures";
await mkdir("tests/fixtures", { recursive: true });
for (const kind of [
  "financial",
  "truetype",
  "subset",
  "cff",
  "form",
  "signed",
  "scanned",
])
  await writeFile(`tests/fixtures/${kind}.pdf`, await fixture(kind));
