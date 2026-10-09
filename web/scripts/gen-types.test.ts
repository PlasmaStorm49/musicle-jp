import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { generate } from "./gen-types.ts";

it("os tipos gerados estão em dia com os schemas (senão: npm run types)", async () => {
  for (const [out, ts] of await generate()) {
    const onDisk = readFileSync(new URL(`../../${out}`, import.meta.url), "utf8");
    expect(onDisk, out).toBe(ts);
  }
});
