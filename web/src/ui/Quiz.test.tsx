// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import type { FetchLike } from "../data/source.ts";
import { type QuizStore, quizLoadOf, useQuizStore } from "./Quiz.tsx";

afterEach(cleanup);

type Reply = Awaited<ReturnType<FetchLike>>;

/** Um fetch em que cada pedido de mês espera o teste responder; o bônus não existe (404). */
function controlledFetch() {
  const pending: {
    readonly url: string;
    readonly resolve: (reply: Reply) => void;
    readonly reject: (error: Error) => void;
  }[] = [];
  const fetchFn: FetchLike = (url) => {
    if (url.endsWith("quiz-bonus.json")) {
      return Promise.resolve({ ok: false, status: 404, json: async () => null });
    }
    return new Promise((resolve, reject) => {
      pending.push({ url, resolve, reject });
    });
  };
  return { fetchFn, pending };
}

/** O arquivo de um mês, válido e sem dias. */
const monthFile = (month: string): Reply => ({
  ok: true,
  status: 200,
  json: async () => ({
    schemaVersion: 1,
    kind: "anime-quiz",
    timezone: "America/Sao_Paulo",
    epoch: `${month}-01`,
    month,
    days: {},
  }),
});

/** Monta o store e devolve o último que ele desenhou. */
function setup() {
  const { fetchFn, pending } = controlledFetch();
  const seen: { store: QuizStore | null } = { store: null };
  function Probe() {
    seen.store = useQuizStore({ fetchFn, baseUrl: "http://localhost/", dataDir: "fixtures/" });
    return null;
  }
  render(<Probe />);
  const store = () => {
    if (!seen.store) throw new Error("sem store");
    return seen.store;
  };
  return { store, pending };
}

/** Responde e espera a carga gravar o resultado. */
async function settle(action: () => void) {
  await act(async () => {
    action();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("useQuizStore: os meses num mapa (o usuário, 27/10/2026)", () => {
  it("dois meses pedidos juntos: um não apaga o outro", async () => {
    const { store, pending } = setup();
    act(() => {
      store().request("2026-10");
      store().request("2026-11");
    });
    expect(quizLoadOf(store(), "2026-10").status).toBe("loading");
    expect(quizLoadOf(store(), "2026-11").status).toBe("loading");
    expect(quizLoadOf(store(), "2026-12").status).toBe("idle");
    // Novembro responde antes de outubro.
    await settle(() => pending[1]?.resolve(monthFile("2026-11")));
    await settle(() => pending[0]?.resolve(monthFile("2026-10")));
    const october = quizLoadOf(store(), "2026-10");
    const november = quizLoadOf(store(), "2026-11");
    expect(october.status === "ready" && october.month?.month).toBe("2026-10");
    expect(november.status === "ready" && november.month?.month).toBe("2026-11");
  });

  it("o mesmo mês pedido de novo: a resposta do pedido antigo, que chega depois, não vale", async () => {
    const { store, pending } = setup();
    act(() => store().request("2026-10"));
    act(() => store().request("2026-10"));
    await settle(() => pending[1]?.resolve(monthFile("2026-10")));
    expect(quizLoadOf(store(), "2026-10").status).toBe("ready");
    // A falha do 1º pedido chega por último e é ignorada.
    await settle(() => pending[0]?.reject(new Error("rede")));
    expect(quizLoadOf(store(), "2026-10").status).toBe("ready");
  });

  it("a falha de rede deixa o mês em retry, e só ele", async () => {
    const { store, pending } = setup();
    act(() => {
      store().request("2026-10");
      store().request("2026-11");
    });
    await settle(() => pending[0]?.reject(new Error("rede")));
    await settle(() => pending[1]?.resolve(monthFile("2026-11")));
    expect(quizLoadOf(store(), "2026-10").status).toBe("retry");
    expect(quizLoadOf(store(), "2026-11").status).toBe("ready");
  });
});
