import { useEffect, useRef, useState } from "preact/hooks";
import { formatHms, msUntilNextDay } from "../core/dates.ts";
import { todayHref } from "../core/routes.ts";
import { t } from "../i18n/t.ts";
import { singleClick } from "./singleClick.ts";

type Props = {
  /** Data do jogo terminado; o próximo diário é o dia seguinte. */
  readonly date: string;
  readonly announce: (message: string) => void;
};

/** Vai ao diário de hoje (a regra do endereço e o porquê do reload estão em core/routes.ts). */
function goToToday() {
  const href = todayHref(window.location.href);
  if (href === null) window.location.reload();
  else window.location.assign(href);
}

/**
 * Tempo até a virada em Brasília. O restante é recalculado do relógio a cada tique (e quando a
 * aba volta a ficar visível), porque abas em segundo plano atrasam os timers.
 */
export function Countdown({ date, announce }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const left = msUntilNextDay(now, date);
  // Já zerado ao abrir não é novidade: só a passagem de "faltando" para zero é anunciada.
  const announced = useRef(left === 0);

  useEffect(() => {
    if (left === 0) return; // já zerou: não precisa mais do relógio
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [left === 0]);

  useEffect(() => {
    if (left === 0 && !announced.current) {
      announced.current = true; // um anúncio só, não a cada segundo
      announce(t("countdown.ready"));
    }
  }, [left, announce]);

  if (left === 0) {
    return (
      <section class="countdown">
        {/* Na tela, o botão já diz isso, e o aria-live anunciou: a frase fica para o leitor de
            tela, e o resumo cabe com o botão (regra 25). */}
        <p class="sr-only">{t("countdown.ready")}</p>
        {/* Recarrega a página: o 2º clique de um toque duplo não pode valer (regra 23). */}
        <button type="button" class="primary" onClick={singleClick(goToToday)}>
          {t("countdown.play")}
        </button>
      </section>
    );
  }
  return (
    <section class="countdown">
      <p>
        {t("countdown.label")}{" "}
        <span role="timer" class="countdown-time">
          {formatHms(left)}
        </span>
      </p>
    </section>
  );
}
