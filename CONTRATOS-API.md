# Contratos locais da demonstração

Todas as rotas abaixo são atendidas no navegador, sem servidor de dados. Listas e objetos mantêm os campos consumidos pelos scripts das respectivas telas. Entradas inválidas retornam 400; registros ausentes, 404; acesso restrito, 403; edição desatualizada ou execução repetida, 409. Rotas desconhecidas retornam 501, sem sucesso genérico.

| Área | Métodos e caminhos | Resposta e comportamento |
|---|---|---|
| Acesso | `POST /api/login`, `POST /api/logout`, `GET /api/me` | Perfil fictício, permissões e destino local; senha não é persistida. |
| Dashboard | `GET /api/os`, `GET /api/os/:id`, `GET /api/solicitantes`, `GET /api/dashboard-temporario` | Listas e detalhes no formato da interface; filtro anual quando solicitado. |
| OS | `POST /api/os`, `PUT /api/os/:id`, `PATCH /api/os/:id/status`, `DELETE /api/os/:id` | Criação, edição com versão, status com reserva/devolução e lixeira com motivo. |
| Financeiro | `GET /api/financeiro/precificacoes`, `GET/PUT /api/financeiro/precificacoes/:id`, `POST /api/financeiro/precificacoes/:id/calcular-item` | Resumo e itens em reais; cálculo por quantidade, diárias e tabela fictícia; doações preservadas. |
| Pagamentos | `GET/POST /api/pagamentos-abertos`, `GET/PUT/DELETE /api/pagamentos-abertos/:id`, `GET /api/pagamentos-abertos/:id/historico` | Retenções e líquido em centavos, vínculo de contrato, histórico e lixeira. |
| Contratos | `GET/POST /api/contratos`, `GET /api/contratos/detalhados`, `GET/PUT/DELETE /api/contratos/:id`, `GET/POST /api/contratos/:id/anexo` | Agrupamento por órgão, contratos separados, consumo e saldo, anexos locais limitados. |
| Estoque | `GET/POST /api/estoque/itens`, `PUT /api/estoque/itens/:id`, `GET/POST /api/estoque/movimentacoes` | Cadastro, total/disponível/em uso, saída ou entrada manual, histórico e filtros por item/OS. |
| Histórico | `GET /api/historico`, `GET /api/historico-sistema`, `GET /api/historico-unificado` | Histórico operacional e unificado com resumos. |
| Inconsistências | `GET /api/inconsistencias` | Tipos, contadores e linhas calculados pelas regras de verificação das OS. |
| Lotes | `POST /api/acoes-em-massa/analisar`, `POST /api/acoes-em-massa/executar`, `GET /api/acoes-em-massa/:loteId` | Prévia, confirmação, aplicação por item e impedimento de execução duplicada. |
| Lixeira | `GET /api/lixeira`, `POST /api/lixeira/restaurar/analisar`, `POST /api/lixeira/restaurar/executar` | Registros removidos, prévia de restauração e execução. |
| Importações | `POST /api/os/importacao-dashboard/analisar` e `/confirmar`; `POST /api/financeiro/importacao-precificacao/analisar` e `/confirmar`; `POST /api/pagamentos-abertos/importacao/analisar` e `/confirmar`; `POST /api/contratos/importacao/analisar` e `/confirmar` | Leitura de XLSX, análise e confirmação local conforme o formato próprio de cada tela. |
| Notificações | `/api/notificacoes/stream` | Canal `EventSource` substituído por eventos locais emitidos após mutações. Nenhuma conexão persistente é aberta. |

## Downloads e links diretos

O adaptador também atende downloads disparados por `fetch`, links, `window.open` e navegação de exportação. Os aliases de página continuam sendo navegação estática normal.

| Caminhos | Arquivo |
|---|---|
| `/api/planilhas/principal`, `/api/planilhas/principal/arquivo`, `POST /api/planilhas/personalizada` | XLSX de OS com as colunas e estilos da interface. |
| `POST /api/financeiro/planilhas` | XLSX financeiro ou totais por cliente. |
| `/api/pagamentos-abertos/planilha` | XLSX agrupado por competência ou cliente, com filtros. |
| `/api/contratos/planilha` | XLSX de contratos/vencimentos; modo de mapa com empenhos explicitamente fictícios. |
| `/api/historico-sistema/planilha` | XLSX do histórico com filtros. |
| `/api/os/:id/pdf` | PDF de OS com campos e estrutura do documento. |
| `/api/os/:id/relatorio-fotografico`, `/api/dashboard-temporario/relatorio-fotografico/:referencia` | Exemplo PDF fictício, sem fotografias ou consulta externa, informado na ação. |
| `/modelos/MODELO-IMPORTACAO-PAGAMENTOS-IMPOSTOS.xlsx` | Modelo real XLSX com registros fictícios. |
| `/uploads/:arquivo` e anexo de contrato | Conteúdo do anexo local, sem upload. |

O CSV de resumo de OS e a impressão continuam sendo gerados pela própria interface. Fórmulas iniciadas por caracteres especiais são neutralizadas no CSV. Conexões a origens externas são rejeitadas, mesmo quando tentadas programaticamente.
