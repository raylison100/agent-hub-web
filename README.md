# agent-hub-web

Interface do Agent Hub em Vue 3, empacotada como PWA. O mesmo build roda no
navegador, instalado no celular e dentro do app de desktop. Nao chama provedor
nenhum: fala so com o [daemon](https://github.com/raylison100/agent-hub-daemon)
pelo protocolo WebSocket definido no
[core](https://github.com/raylison100/agent-hub-core).

No uso normal voce nao precisa rodar este repositorio: o daemon serve o `dist`
em `http://127.0.0.1:47311`.

## Comandos

```bash
pnpm install
pnpm dev          # http://localhost:5173, para desenvolver a interface
pnpm typecheck    # vue-tsc
pnpm build        # dist/ com service worker e manifest
```

O `vue-tsc` ainda exige TypeScript 5, por isso este pacote fixa `typescript@5`
enquanto os outros repositorios usam a versao 7.

## Telas

| Rota | Tela |
|---|---|
| `/` | nova conversa: pasta do projeto, agente ou automatico, papel, modo, esforco e melhorar prompt, com o painel de uso |
| `/session/:id` | conversa com streaming, grupos de ferramentas recolhiveis, cartoes de subagente, aprovacoes, retomada da sessao e voto bom ou ruim |
| `/connect` | primeira conexao: automatica na propria maquina, senha ou relay de fora |
| `/settings/custos` | ledger por agente, modelo, sessao ou dia, cache, exportacao CSV |
| `/settings/automacoes` | agendamentos, gatilhos, rodar agora e interruptor geral |
| `/settings/agentes` | perfis e papeis carregados, com erros de carregamento |
| `/settings/conectores` | servidores MCP: importar do Claude Code, colar JSON, conectar, desconectar, autorizar OAuth |
| `/settings/contexto` | memoria, specs e decisoes do projeto |
| `/settings/skills`, `/settings/plugins` | skills e plugins no layout do Claude Code |
| `/settings/chaves` | chaves de API guardadas no cofre cifrado do daemon |
| `/settings/conexao` | senha de acesso remoto, dispositivos autorizados e controle do daemon |
| `/settings/aparencia` | tema, cor de destaque, tamanho do texto, densidade e fonte |

O painel direito tem Subagentes, Terminal e Tarefas em segundo plano.

## Estrutura

```
src/
  daemon/client.ts       cliente WebSocket: autenticacao, pedidos por tipo, reconexao
  daemon/native-dialog.ts seletor de pasta nativo quando roda no desktop
  stores/                conexao e sessoes: linha do tempo, runs, custos, aprovacoes, terminal
  views/                 uma tela por arquivo
  components/            Sidebar, Composer, Timeline, ToolGroup, SubagentCard, RightPanel, WorkspacePicker
  push.ts, sw.ts         notificacoes push e service worker
  styles.css             tokens de tema escuro e claro
```

## Parte do Agent Hub

Este repositorio e uma das partes do [Agent Hub](https://github.com/raylison100/agent-hub),
um gerenciador de modelos de IA que roda na sua maquina. A documentacao geral
esta na [wiki](https://github.com/raylison100/agent-hub/wiki).

| Repositorio | Papel |
|---|---|
| [agent-hub](https://github.com/raylison100/agent-hub) | ponto de partida, Makefile, scripts e wiki |
| [agent-hub-core](https://github.com/raylison100/agent-hub-core) | biblioteca TypeScript: adaptadores, laco do agente, custo, roteamento, ferramentas, protocolo |
| [agent-hub-daemon](https://github.com/raylison100/agent-hub-daemon) | servico local: sessoes, runs, aprovacoes, automacao, conectores, API WebSocket |
| [agent-hub-web](https://github.com/raylison100/agent-hub-web) | interface Vue 3 como PWA, a mesma no navegador, no celular e no desktop |
| [agent-hub-agents](https://github.com/raylison100/agent-hub-agents) | perfis, papeis, skills, workflows, precos, roteamento e politicas, em texto |
| [agent-hub-desktop](https://github.com/raylison100/agent-hub-desktop) | app Tauri 2 para Windows e Linux |
| [agent-hub-relay](https://github.com/raylison100/agent-hub-relay) | retransmissor sem estado para acesso remoto |
| [agent-hub-channels](https://github.com/raylison100/agent-hub-channels) | clientes em plataformas de mensagem, hoje Telegram |
| [agent-hub-docs](https://github.com/raylison100/agent-hub-docs) | planejamento, arquitetura, ADRs e a fonte das paginas da wiki |

## Licenca

[PolyForm Noncommercial 1.0.0](LICENSE). Pode ler, estudar, modificar e usar
para fins pessoais, de pesquisa, ensino ou em organizacao sem fins lucrativos.
Uso comercial nao e permitido sem autorizacao do autor.

Required Notice: Copyright (c) 2026 Raylison Nunes (https://github.com/raylison100)
