import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
const base = process.env.BASE_PATH || "/";
async function pdf() {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  const p = d.addPage([612, 792]);
  p.drawText("Pay Date: 2026/10/10", { x: 48, y: 680, size: 14, font: f });
  p.drawText("Unchanged surroundings", { x: 48, y: 600, size: 12, font: f });
  d.addPage([612, 792]).drawText("Second page", {
    x: 48,
    y: 700,
    size: 14,
    font: f,
  });
  return Buffer.from(await d.save());
}
test("date correction, export, audit and offline recovery stay local", async ({
  page,
  context,
}) => {
  const outbound = [];
  page.on("request", (r) => {
    if(r.method()!=="GET")outbound.push(`Unexpected method: ${r.method()}`);
    if (
      !r.url().startsWith("http://127.0.0.1:4173") &&
      !r.url().startsWith("blob:") &&
      !r.url().startsWith("data:")
    )
      outbound.push(r.url());
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await expect(
    page.getByRole("heading", {
      name: "Small corrections. Carefully preserved.",
    }),
  ).toBeVisible();
  const originalBytes = await pdf();
  await page.locator("input[type=file]").first().setInputFiles({
    name: "synthetic.pdf",
    mimeType: "application/pdf",
    buffer: originalBytes,
  });
  const hit = page.getByRole("button", { name: "Select Pay Date: 2026/10/10" });
  await expect(hit).toBeVisible();
  const box = await hit.boundingBox();
  await hit.click({ position: { x: box.width * 0.77, y: box.height * 0.5 } });
  await expect(page.locator(".original-value")).toHaveText("2026/10/10");
  await page.getByRole("textbox").fill("2026/10/31");
  await page.getByRole("checkbox", { name: /plain white/ }).check();
  await page
    .getByRole("button", { name: "Preview correction", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Accept correction" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept correction" }).click();
  await expect(page.getByRole("button", { name: "Save as new" })).toBeEnabled();
  await page.getByRole("button", { name: "Analyze pixel differences" }).click();
  await expect(
    page.getByText(/No high-delta changes detected outside expected regions/),
  ).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save as new" }).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toBe("synthetic-corrected-copy.pdf");
  const path = await file.path();
  const fs = await import("node:fs/promises");
  const exported = await PDFDocument.load(await fs.readFile(path));
  expect(exported.getPageCount()).toBe(2);
  expect(exported.getTitle()).toBe("Corrected copy");
  await page.getByRole("button", { name: "Changes 1" }).click();
  await expect(page.locator(".history-item")).toContainText("2026/10/31");
  const originalDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download unchanged original" })
    .click();
  const originalFile = await originalDownload;
  expect(await fs.readFile(await originalFile.path())).toEqual(originalBytes);
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Project saved on this device",
  );
  await expect(page.getByText("Offline ready", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  page.on("dialog", (d) => d.accept());
  await page.reload();
  await page.getByRole("button", { name: "Restore saved project" }).click();
  await expect(
    page.getByRole("heading", { name: "synthetic.pdf" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as new" })).toBeEnabled();
  expect(outbound).toEqual([]);
  expect(errors).toEqual([]);
});
test("mobile privacy panel and dark theme remain accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await expect(
    page.getByRole("button", { name: "Open properties" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: /Private & Local/ }).click();
  await expect(
    page.getByRole("heading", { name: "Private by design." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete locally stored project data" }),
  ).toBeVisible();
});

for (const kind of ["truetype", "subset", "cff", "scanned"])
  test(`renders synthetic ${kind} fixture locally`, async ({ page }) => {
    await page.goto(base);
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles(`tests/fixtures/${kind}.pdf`);
    await expect(
      page.getByRole("heading", { name: `${kind}.pdf` }),
    ).toBeVisible();
    const hit = page.getByRole("button", {
      name: "Select Pay Date: 2026/10/10",
    });
    await expect(hit).toBeVisible();
    if (kind === "truetype" || kind === "subset") {
      const b = await hit.boundingBox();
      await hit.click({ position: { x: b.width * 0.8, y: b.height * 0.5 } });
      await expect(
        page.getByRole("checkbox", { name: /Use disclosed/ }),
      ).toBeVisible();
    }
    await expect(page.locator(".page-error")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save as new" }),
    ).toBeEnabled();
  });
test("encrypted input explains limitation and retains current document", async ({
  page,
}) => {
  await page.goto(base);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("tests/fixtures/password.pdf");
  await expect(page.getByRole("alert")).toContainText(
    "Password-protected PDF detected",
  );
  await expect(
    page.getByRole("button", { name: "Save as new" }),
  ).toBeDisabled();
});
test("signed documents disclose invalidation risk", async ({ page }) => {
  await page.goto(base);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("tests/fixtures/signed.pdf");
  await expect(page.getByRole("status")).toContainText(
    "Digital signature detected",
  );
});

test("page operations and merge keep source downloads immutable", async ({
  page,
}) => {
  await page.goto(base);
  const original = await pdf();
  await page.locator("input[type=file]").first().setInputFiles({
    name: "source.pdf",
    mimeType: "application/pdf",
    buffer: original,
  });
  await expect(page.getByRole("button", { name: "Save as new" })).toBeEnabled();
  await page.getByRole("button", { name: "Manage pages" }).click();
  await page
    .getByRole("button", { name: "Rotate page 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Duplicate page 1", exact: true })
    .click();
  await expect(page.locator(".page-item")).toHaveCount(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".page-item")).toHaveCount(2);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".page-item")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Save as new" })).toBeEnabled();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save as new" }).click();
  const exported = await pending;
  const fs = await import("node:fs/promises");
  const doc = await PDFDocument.load(await fs.readFile(await exported.path()));
  expect(doc.getPageCount()).toBe(3);
  expect(doc.getPage(0).getRotation().angle).toBe(90);
  page.on("dialog", (d) => d.accept());
  await page.locator("input[type=file]").nth(1).setInputFiles({
    name: "additional.pdf",
    mimeType: "application/pdf",
    buffer: original,
  });
  await expect(
    page.getByRole("heading", { name: "merged-corrected-copy.pdf" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as new" })).toBeEnabled();
  await page.getByRole("button", { name: "Changes 0" }).click();
  const unchanged = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download unchanged original" })
    .click();
  expect(await fs.readFile(await (await unchanged).path())).toEqual(original);
  await expect(
    page.getByRole("button", { name: "Download source 2 unchanged" }),
  ).toBeVisible();
  await expect(
    page.getByText(/merge history segments are retained/),
  ).toBeVisible();
});

test("supported text fields can be filled in the production build", async ({
  page,
}) => {
  await page.goto(base);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("tests/fixtures/form.pdf");
  await expect(page.getByRole("button", { name: "Save as new" })).toBeEnabled();
  await page.getByRole("button", { name: "Manage pages" }).click();
  await page.getByRole("button", { name: "Supported form fields (1)" }).click();
  await page
    .getByRole("textbox", { name: /Synthetic name/ })
    .fill("Corrected example");
  await expect(page.getByRole("button", { name: "Save as new" })).toBeEnabled();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save as new" }).click();
  const fs = await import("node:fs/promises");
  const d = await PDFDocument.load(
    await fs.readFile(await (await pending).path()),
  );
  expect(d.getForm().getTextField("Synthetic name").getText()).toBe(
    "Corrected example",
  );
});
