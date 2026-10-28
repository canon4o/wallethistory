import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Server Actions must revalidate through lib/cache/revalidate, which also moves the cache version
// on. Importing next/cache directly would leave cached numbers stale after a write.
describe("Server Actions and the cache", () => {
  const dir = path.resolve(process.cwd(), "lib/actions");
  const files = readdirSync(dir).filter((name) => name.endsWith(".ts"));

  it.each(files)("%s does not import revalidatePath from next/cache", (name) => {
    const source = readFileSync(path.join(dir, name), "utf8");
    expect(source).not.toMatch(/revalidatePath[^;]*from "next\/cache"/);
  });

  // The version bump happens inside revalidate(). Without `await` the action can return, and the
  // client re-render read the cache, before the bump lands, so the page shows the old numbers.
  it.each(files)("%s awaits every revalidate call", (name) => {
    const source = readFileSync(path.join(dir, name), "utf8");
    const calls = source.split("\n").filter((line) => /\brevalidate\(/.test(line) && !/function revalidate/.test(line));
    for (const line of calls) expect(line).toMatch(/await revalidate\(/);
  });
});
