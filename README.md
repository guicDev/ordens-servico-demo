# Ordens de Serviço — Demonstração

Demonstração interativa de gestão de eventos com ordens de serviço, contratos, recebimentos e estoque. Todos os registros iniciais são fictícios e criados do zero. Não há cadastro, senha, servidor de dados ou integração externa.

## Explorar

- Visão geral com indicadores que refletem as alterações.
- Ordens em kanban ou lista, busca, filtros por status e data, cadastro, edição, detalhes e mudança de status.
- Lançamentos financeiros em centavos, vencimentos, edição e pagamento fictício.
- Contratos com vigência, valor, edição e documento demonstrativo para impressão.
- Estoque com total, disponível e em uso; entradas, saídas e devoluções validadas.
- Histórico local das ações, exportações CSV e impressão de OS fictícia.
- Tema claro ou escuro e restauração dos dados de exemplo.

## Executar localmente

Requer Node.js 20 ou superior. Não há dependências para instalar.

```sh
npm run check
npm test
npm start
```

Abra `http://127.0.0.1:4174`. O servidor de prévia aceita somente conexões locais. Para escolher outra porta, defina a variável `PORT` antes de iniciar.

## Preparar a publicação

```sh
npm run build
```

O build cria `dist/` com uma lista explícita de cinco arquivos estáticos. Não inclui testes, documentação, histórico de repositório ou arquivos adicionais.

Crie um repositório novo no GitHub e envie os arquivos deste projeto. Não é necessário informar segredos ou criar variáveis de ambiente. Revise o conteúdo antes de tornar o repositório público.

Na Vercel, importe esse repositório, selecione a pasta deste projeto como diretório raiz e mantenha o preset **Other**, build `npm run build` e saída `dist`. O arquivo `vercel.json` já define essas opções e cabeçalhos de segurança. Navegação usa fragmentos de URL; nenhuma regra de reescrita é necessária.

## Dados e limites

As alterações ficam em `localStorage`, na chave exclusiva `ordens-servico-demo.state.v1`. Recarregar a página preserva os registros neste navegador; um navegador ou perfil diferente recebe seu próprio cenário. Duas abas na mesma origem compartilham armazenamento e a última gravação prevalece; não há colaboração ou sincronização entre abas. **Restaurar demonstração** substitui apenas o estado desta aplicação, com datas relativas ao dia atual. Se o navegador bloquear ou esgotar o armazenamento, um aviso informa que as alterações ficam somente na aba atual.

Não informe dados pessoais, financeiros ou comerciais reais. Os dados locais não são cifrados. Os CSVs exportados e documentos impressos são exemplos e permanecem sob controle de quem os gerou. A aplicação não oferece autenticação real, importação de arquivos, emissão fiscal, anexos, mapas, notificações em tempo real ou consulta a serviços externos. Documentos impressos exibem indicação de demonstração e não possuem validade.

Os valores de estoque não são automaticamente reservados por OS; as movimentações são registradas na tela de estoque. Orçamentos de OS e lançamentos financeiros são registros separados: editar um não altera o outro.

