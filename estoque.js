let estoqueItens = [];
let estoqueFiltrado = [];
let estoqueItemEditando = null;
let canalEstoque = null;
let syncEstoquePendente = null;

function el(id) {
  return document.getElementById(id);
}

function textoSeguro(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizarBuscaEstoque(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function numeroEstoque(valor) {
  const numero = Number(valor || 0);
  if (!Number.isFinite(numero)) return 0;
  return Math.round(numero * 1000) / 1000;
}

function formatarQtd(valor, unidade = "") {
  const numero = numeroEstoque(valor);
  const texto = numero.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return unidade ? `${texto} ${unidade}` : texto;
}

function atualizarStatusEstoque(id, mensagem = "", tipo = "") {
  const campo = el(id);
  if (!campo) return;
  campo.textContent = mensagem;
  campo.className = `modal-status ${tipo || ""}`.trim();
}

async function carregarEstoque() {
  try {
    const resposta = await fetch(`/api/estoque/itens?_=${Date.now()}`, { cache: "no-store" });
    if (!resposta.ok) throw new Error("Erro ao carregar estoque.");
    const dados = await resposta.json();
    estoqueItens = Array.isArray(dados.itens) ? dados.itens : [];
    renderizarResumoEstoque(dados.resumo || {});
    preencherSelectMovimentacao();
    filtrarEstoque();
  } catch (erro) {
    const lista = el("listaEstoque");
    if (lista) lista.innerHTML = `<div class="financeiro-vazio">${textoSeguro(erro.message)}</div>`;
  }
}

function renderizarResumoEstoque(resumo) {
  el("estoqueResumoItens").textContent = String(resumo.totalItens || 0);
  el("estoqueResumoDisponivel").textContent = formatarQtd(resumo.disponivel || 0);
  el("estoqueResumoUso").textContent = formatarQtd(resumo.emUso || 0);
  el("estoqueResumoBaixo").textContent = String(resumo.baixoEstoque || 0);
}

function preencherSelectMovimentacao() {
  const select = el("estoqueMovItem");
  if (!select) return;
  const atual = select.value;
  select.innerHTML = estoqueItens
    .filter((item) => item.ativo)
    .map((item) => `<option value="${textoSeguro(item.id)}">${textoSeguro(item.nome)}</option>`)
    .join("");
  if (atual && [...select.options].some((option) => option.value === atual)) select.value = atual;
  else if (estoqueItemEditando?.id) select.value = estoqueItemEditando.id;
}

function classeStatusEstoque(status) {
  return `estoque-status estoque-status-${status || "ok"}`;
}

function rotuloStatusEstoque(status) {
  return {
    ok: "OK",
    baixo: "Baixo",
    zerado: "Zerado",
    inativo: "Inativo",
  }[status] || "OK";
}

function filtrarEstoque() {
  const termo = normalizarBuscaEstoque(el("buscaEstoque")?.value || "");
  const status = el("filtroStatusEstoque")?.value || "";
  estoqueFiltrado = estoqueItens.filter((item) => {
    if (status && item.statusEstoque !== status) return false;
    if (!termo) return true;
    const alvo = normalizarBuscaEstoque([
      item.nome,
      item.categoria,
      item.unidade,
      Array.isArray(item.aliases) ? item.aliases.join(" ") : "",
    ].join(" "));
    return alvo.includes(termo);
  });
  renderizarListaEstoque();
}

function limparFiltrosEstoque() {
  if (el("buscaEstoque")) el("buscaEstoque").value = "";
  if (el("filtroStatusEstoque")) el("filtroStatusEstoque").value = "";
  filtrarEstoque();
}

function renderizarListaEstoque() {
  const lista = el("listaEstoque");
  if (!lista) return;
  el("estoqueContador").textContent = String(estoqueFiltrado.length);
  if (!estoqueFiltrado.length) {
    lista.innerHTML = '<div class="financeiro-vazio">Nenhum item encontrado.</div>';
    return;
  }

  lista.innerHTML = estoqueFiltrado.map((item) => `
    <article class="estoque-item ${estoqueItemEditando?.id === item.id ? "selecionado" : ""}" onclick="selecionarItemEstoque('${textoSeguro(item.id)}')">
      <div class="estoque-item-topo">
        <div>
          <h3>${textoSeguro(item.nome)}</h3>
          <span>${textoSeguro(item.categoria || "Sem categoria")}</span>
        </div>
        <span class="${classeStatusEstoque(item.statusEstoque)}">${rotuloStatusEstoque(item.statusEstoque)}</span>
      </div>
      <div class="estoque-metricas">
        <div><span>Total</span><strong>${formatarQtd(item.quantidadeTotal, item.unidade)}</strong></div>
        <div><span>Disponível</span><strong>${formatarQtd(item.disponivel, item.unidade)}</strong></div>
        <div><span>Em uso</span><strong>${formatarQtd(item.emUso, item.unidade)}</strong></div>
      </div>
      <div class="estoque-item-rodape">
        <span>Minimo: ${formatarQtd(item.estoqueMinimo, item.unidade)}</span>
        <button type="button" onclick="event.stopPropagation(); editarItemEstoque('${textoSeguro(item.id)}')">Editar</button>
      </div>
    </article>
  `).join("");
}

function selecionarItemEstoque(id) {
  const item = estoqueItens.find((registro) => registro.id === id);
  if (!item) return;
  estoqueItemEditando = item;
  if (el("estoqueMovItem")) el("estoqueMovItem").value = item.id;
  renderizarListaEstoque();
}

function editarItemEstoque(id) {
  const item = estoqueItens.find((registro) => registro.id === id);
  if (!item) return;
  estoqueItemEditando = item;
  el("tituloFormEstoque").textContent = "Editar item";
  el("estoqueNome").value = item.nome || "";
  el("estoqueCategoria").value = item.categoria || "";
  el("estoqueUnidade").value = item.unidade || "un";
  el("estoqueQuantidadeInicial").value = "";
  el("estoqueQuantidadeInicial").disabled = true;
  el("estoqueQuantidadeInicial").placeholder = "Use entrada/saida manual";
  el("estoqueMinimo").value = String(item.estoqueMinimo || 0);
  el("estoqueAliases").value = Array.isArray(item.aliases) ? item.aliases.join("\n") : "";
  el("estoqueObservacoes").value = item.observacoes || "";
  el("estoqueAtivo").checked = item.ativo !== false;
  if (el("estoqueMovItem")) el("estoqueMovItem").value = item.id;
  atualizarStatusEstoque("statusEstoqueItem");
  renderizarListaEstoque();
  abrirModalItemEstoque();
}

function limparFormEstoque() {
  estoqueItemEditando = null;
  el("tituloFormEstoque").textContent = "Novo item";
  ["estoqueNome", "estoqueCategoria", "estoqueUnidade", "estoqueQuantidadeInicial", "estoqueMinimo", "estoqueAliases", "estoqueObservacoes"].forEach((id) => {
    const campo = el(id);
    if (campo) campo.value = "";
  });
  el("estoqueAtivo").checked = true;
  el("estoqueQuantidadeInicial").disabled = false;
  el("estoqueQuantidadeInicial").placeholder = "";
  atualizarStatusEstoque("statusEstoqueItem");
  renderizarListaEstoque();
}

function abrirModalItemEstoque() {
  const modal = el("modalItemEstoque");
  if (modal) modal.style.display = "flex";
  requestAnimationFrame(() => el("estoqueNome")?.focus());
}

function fecharModalItemEstoque() {
  atualizarStatusEstoque("statusEstoqueItem");
  const modal = el("modalItemEstoque");
  if (modal) modal.style.display = "none";
}

function abrirModalNovoItemEstoque() {
  limparFormEstoque();
  abrirModalItemEstoque();
}

function abrirModalMovEstoque(itemId = "") {
  const id = itemId || estoqueItemEditando?.id || el("estoqueMovItem")?.value || "";
  if (id && el("estoqueMovItem")) el("estoqueMovItem").value = id;
  atualizarStatusEstoque("statusEstoqueMov");
  const modal = el("modalMovEstoque");
  if (modal) modal.style.display = "flex";
  requestAnimationFrame(() => el("estoqueMovItem")?.focus());
}

function fecharModalMovEstoque() {
  atualizarStatusEstoque("statusEstoqueMov");
  const modal = el("modalMovEstoque");
  if (modal) modal.style.display = "none";
}

async function salvarItemEstoque() {
  const payload = {
    nome: el("estoqueNome").value.trim(),
    categoria: el("estoqueCategoria").value.trim(),
    unidade: el("estoqueUnidade").value.trim() || "un",
    quantidadeInicial: el("estoqueQuantidadeInicial").value,
    estoqueMinimo: el("estoqueMinimo").value,
    aliases: el("estoqueAliases").value.split(/\r?\n|;/).map((item) => item.trim()).filter(Boolean),
    observacoes: el("estoqueObservacoes").value.trim(),
    ativo: el("estoqueAtivo").checked,
  };

  if (!payload.nome) {
    atualizarStatusEstoque("statusEstoqueItem", "Informe o nome do item.", "erro");
    return;
  }

  try {
    atualizarStatusEstoque("statusEstoqueItem", "Salvando item...", "aviso");
    const url = estoqueItemEditando ? `/api/estoque/itens/${encodeURIComponent(estoqueItemEditando.id)}` : "/api/estoque/itens";
    const resposta = await fetch(url, {
      method: estoqueItemEditando ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const resultado = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(resultado.erro || "Erro ao salvar item.");
    atualizarStatusEstoque("statusEstoqueItem", "Item salvo.", "sucesso");
    estoqueItemEditando = resultado;
    await carregarEstoque();
    editarItemEstoque(resultado.id);
    fecharModalItemEstoque();
  } catch (erro) {
    atualizarStatusEstoque("statusEstoqueItem", erro.message, "erro");
  }
}

async function registrarMovimentacaoEstoque() {
  const payload = {
    itemId: el("estoqueMovItem").value,
    tipo: el("estoqueMovTipo").value,
    quantidade: el("estoqueMovQuantidade").value,
    motivo: el("estoqueMovMotivo").value.trim(),
    observacoes: el("estoqueMovObservacoes").value.trim(),
  };
  if (!payload.itemId || !payload.quantidade || Number(payload.quantidade) <= 0) {
    atualizarStatusEstoque("statusEstoqueMov", "Informe item e quantidade.", "erro");
    return;
  }
  if (!payload.motivo) {
    atualizarStatusEstoque("statusEstoqueMov", "Informe o motivo.", "erro");
    return;
  }

  try {
    atualizarStatusEstoque("statusEstoqueMov", "Registrando movimentação...", "aviso");
    const resposta = await fetch("/api/estoque/movimentacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const resultado = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(resultado.erro || "Erro ao registrar movimentação.");
    atualizarStatusEstoque("statusEstoqueMov", "Movimentação registrada.", "sucesso");
    el("estoqueMovQuantidade").value = "";
    el("estoqueMovMotivo").value = "";
    el("estoqueMovObservacoes").value = "";
    estoqueItemEditando = resultado;
    await carregarEstoque();
    selecionarItemEstoque(resultado.id);
    fecharModalMovEstoque();
  } catch (erro) {
    atualizarStatusEstoque("statusEstoqueMov", erro.message, "erro");
  }
}

async function carregarMovimentacoesEstoque(itemId = "") {
  try {
    const params = new URLSearchParams({ limite: "80" });
    if (itemId) params.set("itemId", itemId);
    const resposta = await fetch(`/api/estoque/movimentacoes?${params.toString()}`, { cache: "no-store" });
    if (!resposta.ok) throw new Error("Erro ao carregar histórico.");
    const dados = await resposta.json();
    renderizarMovimentacoesEstoque(Array.isArray(dados.itens) ? dados.itens : [], itemId);
  } catch (erro) {
    const lista = el("listaMovEstoque");
    if (lista) lista.innerHTML = `<div class="financeiro-vazio">${textoSeguro(erro.message)}</div>`;
  }
}

function renderizarMovimentacoesEstoque(movimentacoes, itemId = "") {
  const lista = el("listaMovEstoque");
  if (!lista) return;
  const item = estoqueItens.find((registro) => registro.id === itemId);
  el("estoqueHistoricoSubtitulo").textContent = item ? `Movimentações de ${item.nome}.` : "Todas as movimentações.";
  if (!movimentacoes.length) {
    lista.innerHTML = '<div class="financeiro-vazio">Nenhuma movimentação registrada.</div>';
    return;
  }
  lista.innerHTML = movimentacoes.map((mov) => `
    <div class="estoque-movimento">
      <div>
        <strong>${textoSeguro(rotuloMovimentoEstoque(mov.tipo))}</strong>
        <span>${textoSeguro(mov.itemNome || "-")}${mov.numeroOS ? ` · OS ${textoSeguro(mov.numeroOS)}` : ""}</span>
      </div>
      <div>
        <strong>${formatarQtd(mov.quantidade)}</strong>
        <span>${textoSeguro(formatarDataMovimento(mov.data))}</span>
      </div>
      <p>${textoSeguro(mov.motivo || mov.descricaoOriginal || "")}</p>
    </div>
  `).join("");
}

function rotuloMovimentoEstoque(tipo) {
  return {
    cadastro_item: "Cadastro",
    edicao_item: "Edição",
    entrada_manual: "Entrada manual",
    saida_manual: "Saída manual",
    saida_os: "Saída por OS",
    devolucao_os: "Devolução por OS",
  }[tipo] || tipo || "-";
}

function formatarDataMovimento(data) {
  if (!data) return "-";
  const valor = new Date(data);
  if (Number.isNaN(valor.getTime())) return data;
  return valor.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function sincronizarEstoqueTempoReal() {
  if (syncEstoquePendente) return syncEstoquePendente;
  syncEstoquePendente = carregarEstoque().finally(() => {
    syncEstoquePendente = null;
  });
  return syncEstoquePendente;
}

function iniciarTempoRealEstoque() {
  if (!("EventSource" in window) || canalEstoque) return;
  canalEstoque = new EventSource("/api/notificacoes/stream");
  ["estoque_atualizado", "os_status_alterado", "os_atualizada"].forEach((evento) => {
    canalEstoque.addEventListener(evento, sincronizarEstoqueTempoReal);
  });
  canalEstoque.addEventListener("error", () => {
    if (canalEstoque?.readyState === EventSource.CLOSED) canalEstoque = null;
  });
}

window.filtrarEstoque = filtrarEstoque;
window.limparFiltrosEstoque = limparFiltrosEstoque;
window.selecionarItemEstoque = selecionarItemEstoque;
window.editarItemEstoque = editarItemEstoque;
window.limparFormEstoque = limparFormEstoque;
window.abrirModalItemEstoque = abrirModalItemEstoque;
window.fecharModalItemEstoque = fecharModalItemEstoque;
window.abrirModalNovoItemEstoque = abrirModalNovoItemEstoque;
window.abrirModalMovEstoque = abrirModalMovEstoque;
window.fecharModalMovEstoque = fecharModalMovEstoque;
window.salvarItemEstoque = salvarItemEstoque;
window.registrarMovimentacaoEstoque = registrarMovimentacaoEstoque;

window.addEventListener("click", (event) => {
  if (event.target === el("modalItemEstoque")) fecharModalItemEstoque();
  if (event.target === el("modalMovEstoque")) fecharModalMovEstoque();
});

window.addEventListener("DOMContentLoaded", () => {
  carregarEstoque();
  iniciarTempoRealEstoque();
});
