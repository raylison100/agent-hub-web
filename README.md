# agent-hub-web

Interface Vue 3 como PWA. O mesmo build roda dentro do desktop Tauri, no
navegador e instalado no celular. Fala apenas com o daemon pelo protocolo
WebSocket definido em `@agent-hub/core`.

Estado: fase 2, esqueleto funcional. Planejamento em `../docs/`.

## Comandos

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck
pnpm build        # dist/ com service worker e manifest
pnpm preview
```

O `typecheck` usa `vue-tsc`, que ainda exige TypeScript 5. Por isso este
pacote fixa `typescript@5` enquanto `core` e `daemon` usam a versao 7.

## Layout

Tres colunas, como um cliente de desktop: barra lateral com as sessoes
agrupadas por projeto, busca e atalhos; area central; painel direito com
as abas Subagentes e Terminal. A barra e o painel recolhem.

| Rota | Tela |
|------|------|
| `/connect` | Modo direto ou relay, URL, tokens, dispositivos online, notificacoes push. Aceita link de emparelhamento `#pair=` |
| `/` | Nova sessao: workspace, agente ou roteamento pela primeira mensagem |
| `/session/:id` | Chat com streaming. Chamadas de ferramenta consecutivas viram um grupo recolhivel com resumo ("Editou 2 arquivos, executou 1 comando +12 -3"). Delegacoes aparecem como cartao de subagente com a linha do tempo dele aninhada e custo ao vivo. Composer com modelo do perfil, esforco por run e popover de janela de contexto e orcamentos (run, sessao, dia do agente, mes global) |
| `/costs` | Relatorio do ledger por agente, modelo, sessao ou dia, taxa de cache, exportacao CSV |
| `/agents` | Perfis carregados e erros de carregamento |
| `/automations` | Agendamentos por cron, rodar agora, apagar, interruptor geral e ultimas execucoes |

Painel direito: Subagentes lista cada delegacao da sessao com estado e
custo; Terminal mostra as saidas de `run_command` e `git`. Aprovacoes
chegam em qualquer tela, no canto inferior direito.

## Estrutura

```
src/
  daemon/client.ts     cliente WebSocket: auth, request por tipo, listeners
  stores/connection.ts URL, token e estado da conexao
  stores/sessions.ts   sessoes, timeline por sessao com subagentes aninhados, terminal, custos, aprovacoes, runs
  views/               Connect, Sessions (nova sessao), Chat, Cost, Agents, Automations
  components/          Sidebar, Timeline, ToolGroup, ToolCard, SubagentCard, Composer, RightPanel
  push.ts, sw.ts       notificacoes push e service worker
  styles.css           tokens de tema escuro por padrao e claro por preferencia do sistema
```

## Conexao remota

Fora da rede local, aponte a URL para o relay (fase 3) ou para o endereco
do daemon pela VPN. O token e o mesmo de `agent-hub-daemon pair`.
