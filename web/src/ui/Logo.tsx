import selo from "./assets/logo-selo.svg";

/**
 * O selo do logo (M12, P193): o 当 de 当てる vazado num círculo vermelho, do style guide do
 * designer (docs/identidade/). O círculo é vermelho nos dois temas (P177), e o 当, o furo, mostra o
 * fundo da página: branco no claro, preto no escuro, sem regra nenhuma. Decorativo: o nome do jogo
 * vem ao lado, em texto.
 */
export function Logo() {
  return <img class="logo" src={selo} alt="" aria-hidden="true" width={48} height={48} />;
}

/**
 * O mesmo selo como a aba Início da nav (P205), em 28 px. Decorativo também: o nome do link é o
 * "Início" em texto, só para o leitor de tela, ao lado. Outra classe, e não .logo: o e2e confere
 * o logo da Início por ela.
 */
export function NavLogo() {
  return <img class="nav-logo" src={selo} alt="" aria-hidden="true" width={28} height={28} />;
}
