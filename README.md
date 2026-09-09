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

## Telas

| Rota | Tela |
|------|------|
| `/connect` | URL do daemon e token. Guardados em localStorage do navegador |
| `/` | Nova sessao (workspace, agente ou roteamento, primeira mensagem) e lista de sessoes com custo |
| `/session/:id` | Chat com streaming, cartoes de ferramenta expandiveis, custo da sessao e do run, cancelar, subir limite apos estouro |
| `/costs` | Relatorio do ledger por agente, modelo, sessao ou dia, com taxa de cache |
| `/agents` | Perfis carregados e erros de carregamento |

Aprovacoes chegam em qualquer tela, no canto inferior direito, com aprovar
e negar.

## Estrutura

```
src/
  daemon/client.ts     cliente WebSocket: auth, request por tipo, listeners
  stores/connection.ts URL, token e estado da conexao
  stores/sessions.ts   sessoes, timeline por sessao a partir de mensagens e eventos, aprovacoes, runs
  views/               Connect, Sessions, Chat, Cost, Agents
  components/          ToolCard
  styles.css           tokens de tema claro e escuro
```

## Conexao remota

Fora da rede local, aponte a URL para o relay (fase 3) ou para o endereco
do daemon pela VPN. O token e o mesmo de `agent-hub-daemon pair`.
