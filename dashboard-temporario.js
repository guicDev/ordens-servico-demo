const STATUS_DASHBOARD = ["pendente", "autorizado", "em_execucao", "na_rua", "executado", "recusado"];
let eventosDashboard = [];

function dataIsoEvento(evento, ultima = false) {
  const datas = [...String(evento.dataEvento || "").matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)];
  const partes = ultima ? datas.at(-1) : datas[0];
  return partes ? `${partes[3]}-${partes[2]}-${partes[1]}` : "";
}

function mostrarDetalhe(evento) {
  document.getElementById("detalhe-numero").textContent = evento.numeroOS || "Sem número";
  document.getElementById("detalhe-evento").textContent = evento.nomeEvento || "Evento sem nome";
  document.getElementById("detalhe-data").textContent = evento.dataEvento || "Data não informada";
  document.getElementById("detalhe-local").textContent = evento.localEvento || "Local não informado";
  document.getElementById("detalhe-materiais").textContent = evento.materiais || "Materiais não informados";
  const candidatos = document.getElementById("relatorios-candidatos");
  candidatos.replaceChildren();
  candidatos.hidden = true;
  const botaoRelatorio = document.getElementById("btnRelatorioFotografico");
  botaoRelatorio.disabled = !evento.referenciaRelatorio;
  botaoRelatorio.onclick = () => baixarRelatorioFotografico(evento);
}

async function baixarRelatorioFotografico(evento, idRelatorio = "") {
  const botao = document.getElementById("btnRelatorioFotografico");
  botao.disabled = true;
  try {
    const url = `/api/dashboard-temporario/relatorio-fotografico/${encodeURIComponent(evento.referenciaRelatorio)}`;
    const resposta = await fetch(idRelatorio ? `${url}?id=${encodeURIComponent(idRelatorio)}` : url);
    if (resposta.status === 409) {
      const dados = await resposta.json();
      const lista = document.getElementById("relatorios-candidatos");
      lista.replaceChildren();
      for (const [indice, candidato] of (dados.candidatos || []).entries()) {
        const opcao = document.createElement("button");
        opcao.type = "button";
        opcao.className = "btn-topo btn-secundario";
        opcao.textContent = `Relatório ${indice + 1} · OS ${candidato.os || evento.numeroOS || "-"}${candidato.periodo ? ` · ${candidato.periodo}` : ""}`;
        opcao.addEventListener("click", () => baixarRelatorioFotografico(evento, candidato.id));
        lista.append(opcao);
      }
      lista.hidden = false;
      return;
    }
    if (!resposta.ok) {
      const dados = await resposta.json().catch(() => ({}));
      alert(dados.erro || "Não foi possível encontrar o relatório fotográfico desta OS.");
      return;
    }
    const blob = await resposta.blob();
    const nomeArquivo = resposta.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/i)?.[1] || "relatorio-fotografico.docx";
    const endereco = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = endereco;
    link.download = nomeArquivo;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(endereco), 1000);
  } catch {
    alert("Não foi possível baixar o relatório fotográfico. Tente novamente.");
  } finally {
    botao.disabled = false;
  }
}

function criarCartao(evento) {
  const card = document.createElement("div");
  const topo = document.createElement("div");
  const numero = document.createElement("span");
  const titulo = document.createElement("h3");
  const info = document.createElement("div");
  const data = document.createElement("p");
  const local = document.createElement("p");
  const materiais = document.createElement("p");
  card.className = "card";
  topo.className = "card-topo";
  numero.className = "card-os";
  numero.textContent = `OS ${evento.numeroOS || "-"}`;
  topo.append(numero);
  titulo.className = "card-titulo";
  info.className = "card-info";
  titulo.textContent = evento.nomeEvento || "Evento sem nome";
  data.textContent = `Data: ${evento.dataEvento || "Data não informada"}`;
  local.textContent = `Local/endereço: ${evento.localEvento || "Local não informado"}`;
  materiais.textContent = `Materiais: ${evento.materiais || "Materiais não informados"}`;
  info.append(data, local, materiais);
  card.append(topo, titulo, info);
  card.tabIndex = 0;
  card.addEventListener("click", () => mostrarDetalhe(evento));
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); mostrarDetalhe(evento); } });
  return card;
}

function filtrarEventos() {
  const termo = (document.getElementById("buscaGeral").value || "").trim().toLocaleLowerCase("pt-BR");
  const campo = document.getElementById("campoBuscaFiltro").value || "todos";
  const ano = document.getElementById("anoFiltro").value || "";
  const statusFiltro = document.getElementById("filtroStatus").value || "";
  const inicio = document.getElementById("dataInicialFiltro").value || "";
  const fim = document.getElementById("dataFinalFiltro").value || "";
  const listas = Object.fromEntries(STATUS_DASHBOARD.map((status) => [status, []]));

  for (const evento of eventosDashboard) {
    const data = dataIsoEvento(evento);
    const dataFim = dataIsoEvento(evento, true);
    const texto = campo === "numeroOS" ? evento.numeroOS : campo === "nomeEvento" ? evento.nomeEvento : campo === "localEvento" ? evento.localEvento : campo === "materiais" ? evento.materiais : `${evento.numeroOS} ${evento.nomeEvento} ${evento.dataEvento} ${evento.localEvento} ${evento.materiais}`;
    if (termo && !String(texto || "").toLocaleLowerCase("pt-BR").includes(termo)) continue;
    if (ano && !data.startsWith(ano)) continue;
    if (statusFiltro && evento.status !== statusFiltro) continue;
    if (inicio && (!dataFim || dataFim < inicio)) continue;
    if (fim && (!data || data > fim)) continue;
    if (listas[evento.status]) listas[evento.status].push(evento);
  }

  for (const status of STATUS_DASHBOARD) {
    const lista = listas[status];
    const container = document.querySelector(`#${status} .cards`);
    container.replaceChildren(...lista.map(criarCartao));
    document.getElementById(`badge-${status}`).textContent = String(lista.length);
    document.getElementById(`resumo-${status}`).textContent = String(lista.length);
  }
  document.getElementById("mensagem").textContent = Object.values(listas).some((lista) => lista.length) ? "" : "Nenhum evento encontrado.";
}

async function carregarEventos() {
  const mensagem = document.getElementById("mensagem");
  try {
    const resposta = await fetch("/api/dashboard-temporario", { cache: "no-store" });
    if (resposta.status === 401) { window.location.href = "/login.html"; return; }
    if (!resposta.ok) throw new Error("Falha ao carregar eventos");
    const eventos = await resposta.json();
    if (!Array.isArray(eventos)) throw new Error("Resposta inesperada");
    eventosDashboard = eventos;
    const anos = [...new Set(eventos.map((evento) => dataIsoEvento(evento).slice(0, 4)).filter(Boolean))].sort().reverse();
    for (const ano of anos) {
      const opcao = document.createElement("option");
      opcao.value = ano;
      opcao.textContent = ano;
      document.getElementById("anoFiltro").append(opcao);
    }
    document.getElementById("anoFiltro").value = anos.includes(String(new Date().getFullYear())) ? String(new Date().getFullYear()) : "";
    filtrarEventos();
  } catch {
    mensagem.textContent = "Não foi possível carregar os eventos. Atualize a página para tentar novamente.";
  }
}

function limparFiltros() {
  for (const id of ["buscaGeral", "anoFiltro", "filtroStatus", "dataInicialFiltro", "dataFinalFiltro"]) document.getElementById(id).value = "";
  document.getElementById("campoBuscaFiltro").value = "todos";
  filtrarEventos();
}

async function sair() {
  try { await fetch("/api/logout", { method: "POST" }); }
  finally { window.location.href = "/login.html"; }
}

for (const id of ["buscaGeral", "campoBuscaFiltro", "anoFiltro", "filtroStatus", "dataInicialFiltro", "dataFinalFiltro"]) {
  document.getElementById(id).addEventListener(id === "buscaGeral" ? "input" : "change", filtrarEventos);
}
document.getElementById("limparFiltros").addEventListener("click", limparFiltros);
document.getElementById("sair").addEventListener("click", sair);
window.onload = carregarEventos;
