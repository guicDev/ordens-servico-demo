# Verificação

Execute `npm run check`, `npm test` e `npm run build` com Node.js 20 ou superior. Os testes usam dados fictícios em memória e as bibliotecas locais; não abrem bancos ou serviços externos.

Os testes cobrem os contratos consumidos pelas telas, cálculos de retenções em centavos, precificação em reais, contratos agrupados e seus consumos, controle de versão da OS, movimentações e reservas de estoque por diárias, precisão de três casas, restauração, lotes, lixeira, perfis, falha de armazenamento e rejeição de entradas inválidas. Também reabrem seis formatos de XLSX e exercitam análise/confirmação das quatro importações.

O CSS principal possui hash de referência verificado. Os controles e modais essenciais são verificados por seus identificadores. O build inclui somente a lista explícita de arquivos públicos.

## Conferência no navegador

1. Abra o login e entre com `admin` e `demo`. Confirme o menu lateral e todas as páginas.
2. Cadastre e edite uma OS nos formulários existentes. Mude para “Em execução”, confira as reservas no estoque e conclua para conferir a devolução.
3. Abra os detalhes da OS, impressão e PDF. Gere planilha personalizada pelo modal original.
4. Abra a precificação, altere itens e diárias, salve e confira o resumo.
5. Cadastre um pagamento com retenções. Confira o líquido e vincule um contrato para verificar o consumo.
6. Abra detalhes, contratos separados, edição, anexo e planilhas de contratos.
7. Faça entrada e saída manual de estoque, incluindo quantidade com três casas decimais, e abra o histórico.
8. Analise e confirme arquivos fictícios nos quatro modais de importação. Confira os resultados nas respectivas telas.
9. Exercite seleção em massa, envio à lixeira e restauração.
10. Confira histórico e inconsistências; teste filtros e exportações.
11. Abra o dashboard temporário e um relatório demonstrativo. O contexto deve informar que a integração usa conteúdo fictício.
12. Repita os fluxos com os perfis de consulta e confirme as restrições.
13. Recarregue a página, restaure o cenário e confira que outros armazenamentos não mudaram.
14. Confira desktop e celular, incluindo menus, modais e rolagens próprias das telas.

O painel de rede deve mostrar somente os arquivos estáticos locais. `window.DemoOS.requests` e `window.DemoOS.errors` registram apenas método, caminho e status das chamadas da demonstração, sem payloads, senhas ou conteúdo de anexos. `window.DemoOS.state` retorna uma cópia do estado para inspeção local.
