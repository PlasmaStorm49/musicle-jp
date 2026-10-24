// O laboratório das Misturadas (M17) fica fora do jogo: nenhum arquivo do src fora do src/lab
// importa dele. A marca musicle-lab só existe no main.tsx do laboratório, e o passo 9c da CI a
// procura no dist; um import do jogo levaria o código do laboratório sem a marca, e o 9c passaria.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const LAB = join(SRC, "lab");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return path === LAB ? [] : sources(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("o laboratório fora do jogo", () => {
  it("nenhum arquivo do src, fora do src/lab, importa do laboratório", () => {
    const leaks = sources(SRC).filter((path) =>
      /from\s+["'][^"']*\/lab\//.test(readFileSync(path, "utf-8")),
    );
    expect(leaks.map((path) => relative(SRC, path).split(sep).join("/"))).toEqual([]);
  });

  it("a marca do laboratório está no main.tsx dele", () => {
    expect(readFileSync(join(LAB, "main.tsx"), "utf-8")).toContain('"musicle-lab"');
  });
});
