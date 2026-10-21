/**
 * Um clique só. O Preact redesenha antes do 2º clique de um toque duplo, que cai no botão que
 * estiver no mesmo lugar da tela nova: em "Próxima rodada", ele caía no "Não sei" da rodada
 * seguinte. Todo botão que troca a tela, ou que fica onde outro some, ignora `detail > 1` (o 2º
 * clique); teclado e leitor de tela mandam `detail` 0 e passam.
 */
export function singleClick(action: (event: MouseEvent) => void): (event: MouseEvent) => void {
  return (event) => {
    if (event.detail > 1) return;
    action(event);
  };
}
