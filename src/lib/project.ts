import { createIndexedStore, storageEstimate } from "./storage.js";
import type { Project } from "../pdf/types";
const projects = createIndexedStore({
  appId: "precision-pdf",
  basePath: import.meta.env.BASE_URL,
  namespace: "projects",
  version: 1,
});
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(action: () => Promise<T>): Promise<T> {
  const next = queue.then(action);
  queue = next.catch(() => {});
  return next;
}
export async function saveProject(project: Project) {
  return serial(async () => {
    const s = await storageEstimate();
    if (
      s?.quota &&
      s?.usage &&
      s.quota - s.usage <
        (project.source.byteLength +
          (project.originals || []).reduce(
            (n, s) => n + s.bytes.byteLength,
            0,
          )) *
          2
    )
      throw Error(
        "Storage quota is nearly full. Download your original and change log.",
      );
    await projects.set("current", project, { ttlMs: 7 * 86400000 });
  });
}
export async function restoreProject(): Promise<Project | undefined> {
  await projects.prune();
  return projects.get("current");
}
export async function deleteProject() {
  await serial(() => projects.clear());
}
