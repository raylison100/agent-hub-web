# agent-hub-web

Interface Vue 3 como PWA. O mesmo build roda dentro do desktop Tauri, no
navegador e instalado no celular. Fala apenas com o daemon pelo protocolo
WebSocket.

Estado: fase 0, sem codigo. Entra na fase 2. Planejamento em
`../docs/03-repositorios.md`.

Estrutura prevista:

```
src/
  app/          roteador, stores Pinia, tema
  daemon/       cliente ws, catch-up, cache IndexedDB
  views/        Sessoes, Chat, Custos, Orcamentos, Agentes, Dispositivos
  components/   MessageStream, ToolCallCard, ApprovalCard, CostPanel
```
