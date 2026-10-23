// Baixar um texto como arquivo, no navegador (ME103): um Blob e um link com `download`, clicado
// por código. Fica na tela, e não no storage, porque mexe no DOM.

/**
 * Oferece o `text` para baixar com o nome `name`. O endereço do Blob é solto depois de um tempo,
 * e não na hora: o Safari pode ainda estar lendo o arquivo quando o clique volta.
 */
export function downloadText(name: string, text: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
