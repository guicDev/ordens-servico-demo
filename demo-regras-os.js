(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RegrasOrdensServico=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
const STATUS_PERMITIDOS = new Set([
  "pendente",
  "autorizado",
  "em_execucao",
  "na_rua",
  "executado",
  "recusado",
]);

function normalizarTexto(valor) {
  return valor === undefined || valor === null ? "" : String(valor).trim();
}

function formatarStatus(status) {
  return {
    pendente: "Pendente",
    autorizado: "Autorizado",
    em_execucao: "Em execução",
    na_rua: "Na rua",
    executado: "Executado",
    recusado: "Recusado",
  }[status] || status;
}

function criarErro(codigo, mensagem, statusCode) {
  const erro = new Error(mensagem);
  erro.codigo = codigo;
  erro.statusCode = statusCode;
  return erro;
}

function montarResumoMovimentosEstoque(resultado = {}) {
  const movimentos = Array.isArray(resultado.movimentos) ? resultado.movimentos : [];
  const ignorados = Array.isArray(resultado.ignorados) ? resultado.ignorados : [];
  const partes = [];

  if (movimentos.length) {
    partes.push(movimentos.map((movimento) =>
      `${movimento.tipo === "devolucao_os" ? "devolvido" : "retirado"} ${movimento.quantidade} ${movimento.item}`
    ).join("; "));
  }
  if (ignorados.length) {
    partes.push(`ignorados: ${ignorados.map((item) => item.descricao).join("; ")}`);
  }
  return partes.join(". ");
}

function criarServicoOrdensServico({
  obterOS,
  salvarOS,
  sincronizarEstoque,
  garantirPrecificacao,
  persistirAlteracaoStatus,
  agora = () => new Date().toISOString(),
}) {
  function criarHistorico({ acao, detalhe = "", observacao = "", responsavel = "" }) {
    return {
      acao: normalizarTexto(acao),
      detalhe: normalizarTexto(detalhe),
      observacao: normalizarTexto(observacao),
      responsavel: normalizarTexto(responsavel),
      data: agora(),
    };
  }

  async function obterOrdemObrigatoria(id) {
    const ordem = await obterOS(normalizarTexto(id));
    if (!ordem) throw criarErro("os_nao_encontrada", "OS não encontrada.", 404);
    if (!Array.isArray(ordem.historico)) ordem.historico = [];
    return ordem;
  }

  async function alterarStatus({ id, status, observacao = "", usuarioNome = "" }) {
    if (!STATUS_PERMITIDOS.has(status)) {
      throw criarErro("status_invalido", "Status inválido.", 400);
    }

    const ordem = await obterOrdemObrigatoria(id);
    const statusAnterior = ordem.status;
    const atualizadoEm = agora();
    ordem.status = status;
    ordem.atualizadoEm = atualizadoEm;
    ordem.responsavel = normalizarTexto(usuarioNome);
    ordem.observacaoAprovacao = normalizarTexto(observacao);
    ordem.historico.push(criarHistorico({
      acao: "Mudanca de status",
      detalhe: `${formatarStatus(statusAnterior)} -> ${formatarStatus(status)}`,
      observacao,
      responsavel: usuarioNome,
    }));

    if (typeof persistirAlteracaoStatus === "function") {
      const persistida = await persistirAlteracaoStatus({
        ordem,
        statusAnterior,
        usuario: usuarioNome,
      });
      return {
        os: persistida.os || ordem,
        statusAnterior,
        statusAtual: status,
        resumoEstoque: persistida.resumoEstoque || "",
      };
    }

    await salvarOS(ordem);
    const resultadoEstoque = await sincronizarEstoque(ordem, statusAnterior, status, usuarioNome);
    const resumoEstoque = montarResumoMovimentosEstoque(resultadoEstoque);
    if (resumoEstoque) {
      ordem.historico.push(criarHistorico({
        acao: "Estoque",
        detalhe: resumoEstoque,
        observacao: "Movimentação automática por mudança de status.",
        responsavel: usuarioNome,
      }));
      await salvarOS(ordem);
    }

    if (status === "executado") {
      await garantirPrecificacao(ordem, usuarioNome);
    }

    return { os: ordem, statusAnterior, statusAtual: status, resumoEstoque };
  }

  async function adicionarObservacao({ id, observacao, usuarioNome = "" }) {
    const texto = normalizarTexto(observacao);
    if (!texto) throw criarErro("observacao_obrigatoria", "Observação obrigatória.", 400);
    const ordem = await obterOrdemObrigatoria(id);
    ordem.atualizadoEm = agora();
    ordem.responsavel = normalizarTexto(usuarioNome);
    ordem.historico.push(criarHistorico({
      acao: "Observacao da OS",
      detalhe: "Observação acrescentada.",
      observacao: texto,
      responsavel: usuarioNome,
    }));
    await salvarOS(ordem);
    return { os: ordem };
  }

  return { alterarStatus, adicionarObservacao };
}

return {
  STATUS_PERMITIDOS,
  criarServicoOrdensServico,
  montarResumoMovimentosEstoque,
};

});
