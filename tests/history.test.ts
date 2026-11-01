import test from "node:test";
import assert from "node:assert/strict";
import { historyReducer, type History } from "../src/lib/history";
test("history is atomic, bounded, restores pages/forms and clears redo on a new branch", () => {
  const initial: History = {
    present: { edits: [], pages: [], formValues: {} },
    past: [],
    future: [],
  };
  let h = historyReducer(initial, {
    type: "commit",
    value: { ...initial.present, formValues: { example: "one" } },
  });
  h = historyReducer(h, { type: "undo" });
  assert.deepEqual(h.present, initial.present);
  h = historyReducer(h, { type: "redo" });
  assert.equal(h.present.formValues.example, "one");
  for (let i = 0; i < 70; i++)
    h = historyReducer(h, {
      type: "commit",
      value: { ...h.present, formValues: { example: String(i) } },
    });
  assert.equal(h.past.length, 50);
  h = historyReducer(h, { type: "undo" });
  assert.equal(h.present.formValues.example, "68");
  h = historyReducer(h, { type: "commit", value: initial.present });
  assert.equal(h.future.length, 0);
  assert.equal(
    historyReducer(h, { type: "reset", value: initial.present }).past.length,
    0,
  );
});
