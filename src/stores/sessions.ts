import type { AgentSummary, Message, RunEvent, RunMode, ServerFrame, SessionSummary } from '@agent-hub/core'
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { client } from '../daemon/client'

export type Reasoning = 'low' | 'medium' | 'high' | 'max'

export interface ImageAttachment {
  mediaType: string
  data: string
  name?: string
}

export interface ToolItem {
  kind: 'tool'
  callId: string
  name: string
  args: unknown
  decision: string
  result?: string
  isError?: boolean
  ms?: number
  runId: string
}

export interface SubagentItem {
  kind: 'subagent'
  agent: string
  task: string
  status: 'running' | 'done'
  costUsd: number
  stop?: string
  items: TimelineItem[]
  steps: number
  runId: string
  taskId?: string
  background?: boolean
  worktree?: { path: string; branch: string }
}

export type TimelineItem =
  | { kind: 'user'; text: string; images?: ImageAttachment[] }
  | { kind: 'assistant'; text: string; live: boolean; runId?: string }
  | ToolItem
  | SubagentItem
  | { kind: 'info'; text: string; tone?: 'warn' | 'error' }
  | { kind: 'improved'; by: string; original: string; improved: string; costUsd: number }

export interface Approval {
  id: string
  sessionId: string
  runId: string
  tool: string
  args: unknown
  risk: string
  expiresAt: number
}

export interface RunState {
  runId: string
  costUsd: number
  steps: number
  finished: boolean
  stop?: string
  error?: string
  lastInputTokens: number
  phase?: string
  agent?: string
  model?: string
}

export interface TerminalEntry {
  command: string
  output: string
  ts: number
  runId: string
}

export interface CostStatus {
  todayUsd: number
  monthUsd: number
  globalMonthLimit: number | null
  agents: Record<string, { todayUsd: number; dayLimit: number | null }>
}

export const useSessions = defineStore('sessions', () => {
  const sessions = ref<SessionSummary[]>([])
  const agents = ref<AgentSummary[]>([])
  const agentErrors = ref<{ file: string; message: string }[]>([])
  const timelines = reactive(new Map<string, TimelineItem[]>())
  const runs = reactive(new Map<string, RunState>())
  const approvals = ref<Approval[]>([])
  const lastSeq = reactive(new Map<string, number>())
  const terminal = reactive(new Map<string, TerminalEntry[]>())
  const subByRun = new Map<string, SubagentItem>()
  const costStatus = ref<CostStatus | null>(null)
  const feedback = reactive(new Map<string, 'good' | 'bad'>())

  client.on(handle)
  let wasOnline = false
  client.onStatus((s) => {
    if (s === 'online' && wasOnline) void resync()
    if (s === 'online') wasOnline = true
  })

  async function resync(): Promise<void> {
    try {
      await refresh()
      for (const [sessionId, since] of lastSeq) {
        const sync = await client.request({ type: 'sync', session_id: sessionId, since_seq: since }, 'sync')
        for (const e of sync.events) applyEvent(sessionId, e.run_id, e.seq, e.event)
      }
    } catch {
      return
    }
  }

  let includeArchived = false

  async function refresh(archived?: boolean): Promise<void> {
    if (archived !== undefined) includeArchived = archived
    const list = await client.request({ type: 'session.list', limit: 200, include_archived: includeArchived }, 'session.list')
    sessions.value = list.sessions
  }

  async function update(sessionId: string, patch: { title?: string; pinned?: boolean; archived?: boolean; agent?: string; mode?: RunMode; group?: string | null }): Promise<void> {
    client.send({ type: 'session.update', session_id: sessionId, ...patch })
  }

  /** Aplica o mesmo ajuste a varias sessoes de uma vez. */
  function updateMany(ids: string[], patch: { pinned?: boolean; archived?: boolean; group?: string | null }): void {
    client.send({ type: 'session.update_many', session_ids: ids, ...patch })
  }

  /** Apaga varias sessoes e ja tira todas da lista local. */
  function removeMany(ids: string[]): void {
    client.send({ type: 'session.delete_many', session_ids: ids })
    const alvo = new Set(ids)
    sessions.value = sessions.value.filter((s) => !alvo.has(s.id))
    for (const id of ids) {
      timelines.delete(id)
      runs.delete(id)
    }
  }

  async function remove(sessionId: string): Promise<void> {
    client.send({ type: 'session.delete', session_id: sessionId })
    sessions.value = sessions.value.filter((s) => s.id !== sessionId)
    timelines.delete(sessionId)
    runs.delete(sessionId)
  }

  async function fork(sessionId: string): Promise<SessionSummary> {
    const res = await client.request({ type: 'session.fork', session_id: sessionId }, 'session.created')
    await refresh()
    return res.session
  }

  async function loadAgents(): Promise<void> {
    const res = await client.request({ type: 'agents.list' }, 'agents.list')
    agents.value = res.agents
    agentErrors.value = res.errors
  }

  async function loadCostStatus(): Promise<void> {
    try {
      const res = await client.request({ type: 'cost.status' }, 'cost.status')
      costStatus.value = {
        todayUsd: res.today_usd,
        monthUsd: res.month_usd,
        globalMonthLimit: res.global_month_limit_usd,
        agents: Object.fromEntries(Object.entries(res.agents).map(([k, v]) => [k, { todayUsd: v.today_usd, dayLimit: v.day_limit_usd }])),
      }
    } catch {
      return
    }
  }

  async function open(sessionId: string): Promise<void> {
    const res = await client.request({ type: 'session.get', session_id: sessionId }, 'session.get')
    const live = runs.get(sessionId)
    const keepLocal = live !== undefined && !live.finished && (timelines.get(sessionId)?.length ?? 0) > 0
    if (!keepLocal) timelines.set(sessionId, withChildren(fromMessages(res.messages), res.children ?? []))
    if (!terminal.has(sessionId)) terminal.set(sessionId, [])
    void loadFeedback(sessionId)
    const since = lastSeq.get(sessionId)
    if (since !== undefined) {
      const sync = await client.request({ type: 'sync', session_id: sessionId, since_seq: since }, 'sync')
      for (const e of sync.events) applyEvent(sessionId, e.run_id, e.seq, e.event)
    }
    void loadCostStatus()
  }

  async function create(workspace: string, agent?: string, text?: string): Promise<SessionSummary> {
    const res = await client.request({ type: 'session.create', workspace, agent, text }, 'session.created')
    await refresh()
    return res.session
  }

  async function start(sessionId: string, text: string, reasoning?: Reasoning, mode?: RunMode, agent?: string, improve?: boolean, images?: ImageAttachment[]): Promise<string> {
    timeline(sessionId).push({ kind: 'user', text, images })
    const res = await client.request({ type: 'run.start', session_id: sessionId, text, reasoning, mode, agent, improve, images: images?.map((i) => ({ media_type: i.mediaType, data: i.data, name: i.name })) }, 'run.started')
    runs.set(sessionId, { runId: res.run_id, costUsd: 0, steps: 0, finished: false, lastInputTokens: runs.get(sessionId)?.lastInputTokens ?? 0 })
    return res.run_id
  }

  async function loadFeedback(sessionId: string): Promise<void> {
    try {
      const res = await client.request({ type: 'feedback.list', session_id: sessionId }, 'feedback.list')
      for (const item of res.items) feedback.set(item.run_id, item.verdict)
    } catch {
      return
    }
  }

  function setFeedback(sessionId: string, runId: string, verdict: 'good' | 'bad' | 'none'): void {
    if (verdict === 'none') feedback.delete(runId)
    else feedback.set(runId, verdict)
    client.send({ type: 'feedback.set', session_id: sessionId, run_id: runId, verdict })
  }

  function cancel(sessionId: string): void {
    const run = runs.get(sessionId)
    if (run && !run.finished) client.send({ type: 'run.cancel', run_id: run.runId })
  }

  function respond(approvalId: string, decision: 'allow' | 'deny'): void {
    client.send({ type: 'approval.respond', approval_id: approvalId, decision })
    approvals.value = approvals.value.filter((a) => a.id !== approvalId)
  }

  function override(sessionId: string, scope: 'run' | 'session' | 'agent' | 'global', limitUsd: number): void {
    const run = runs.get(sessionId)
    if (run) client.send({ type: 'budget.override', run_id: run.runId, scope, limit_usd: limitUsd })
  }

  function timeline(sessionId: string): TimelineItem[] {
    let t = timelines.get(sessionId)
    if (!t) {
      t = []
      timelines.set(sessionId, t)
    }
    return t
  }

  function subagents(sessionId: string): SubagentItem[] {
    return timeline(sessionId).filter((i): i is SubagentItem => i.kind === 'subagent')
  }

  function handle(frame: ServerFrame): void {
    if (frame.type === 'event') {
      applyEvent(frame.session_id, frame.run_id, frame.seq, frame.event)
      return
    }
    if (frame.type === 'approval.required') {
      approvals.value.push({
        id: frame.approval_id,
        sessionId: frame.session_id,
        runId: frame.run_id,
        tool: frame.tool,
        args: frame.args,
        risk: frame.risk,
        expiresAt: frame.expires_at,
      })
      return
    }
    if (frame.type === 'approval.resolved') {
      approvals.value = approvals.value.filter((a) => a.id !== frame.approval_id)
      return
    }
    if (frame.type === 'session.updated') {
      const i = sessions.value.findIndex((s) => s.id === frame.session.id)
      if (i >= 0) sessions.value[i] = frame.session
      else sessions.value.unshift(frame.session)
      sessions.value.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
      return
    }
    if (frame.type === 'feedback.ok') {
      if (frame.verdict === 'none') feedback.delete(frame.run_id)
      else feedback.set(frame.run_id, frame.verdict)
      return
    }
    if (frame.type === 'session.deleted_many') {
      const alvo = new Set(frame.session_ids)
      sessions.value = sessions.value.filter((s) => !alvo.has(s.id))
      for (const id of frame.session_ids) {
        timelines.delete(id)
        runs.delete(id)
      }
      return
    }
    if (frame.type === 'session.deleted') {
      sessions.value = sessions.value.filter((s) => s.id !== frame.session_id)
      timelines.delete(frame.session_id)
      runs.delete(frame.session_id)
      return
    }
    if (frame.type === 'automation.started' || frame.type === 'workflow.started') {
      runs.set(frame.session_id, { runId: frame.run_id, costUsd: 0, steps: 0, finished: false, lastInputTokens: 0 })
    }
  }

  function applyEvent(sessionId: string, runId: string, seq: number, event: RunEvent): void {
    const known = lastSeq.get(sessionId) ?? 0
    if (seq <= known) return
    lastSeq.set(sessionId, seq)
    const main = timeline(sessionId)
    let run = runs.get(sessionId)
    if (!run) {
      run = { runId, costUsd: 0, steps: 0, finished: false, lastInputTokens: 0 }
      runs.set(sessionId, run)
    }
    const sub = subByRun.get(runId)
    const nested = sub !== undefined && runId !== run.runId
    const t = nested ? sub.items : main

    switch (event.type) {
      case 'text_delta': {
        const last = t[t.length - 1]
        if (last && last.kind === 'assistant' && last.live) last.text += event.delta
        else t.push({ kind: 'assistant', text: event.delta, live: true, runId })
        return
      }
      case 'tool_call':
        closeLive(t)
        t.push({ kind: 'tool', callId: event.call.id, name: event.call.name, args: event.call.args, decision: event.decision, runId })
        return
      case 'tool_result': {
        const item = findTool(t, event.callId) ?? findTool(main, event.callId)
        if (item) {
          item.result = event.content
          item.isError = event.isError
          item.ms = event.ms
          if (item.name === 'run_command' || item.name === 'git') {
            const args = item.args as { command?: string; args?: string[] } | undefined
            const command = item.name === 'git' ? `git ${(args?.args ?? []).join(' ')}` : (args?.command ?? '')
            entries(sessionId).push({ command, output: event.content, ts: Date.now(), runId })
          }
        }
        return
      }
      case 'usage':
        if (nested && sub) {
          sub.costUsd += event.costUsd
          sub.steps = event.step
        } else {
          run.costUsd += event.costUsd
          run.steps = event.step
          run.lastInputTokens = event.usage.input + event.usage.cacheRead + event.usage.cacheWrite
        }
        return
      case 'delegation':
        if (event.phase === 'start') {
          closeLive(main)
          const item: SubagentItem = {
            kind: 'subagent',
            agent: event.agent,
            task: event.task,
            status: 'running',
            costUsd: 0,
            items: [],
            steps: 0,
            runId: event.runId,
            taskId: event.taskId,
            background: event.background,
            worktree: event.worktree,
          }
          main.push(item)
          subByRun.set(event.runId, item)
        } else {
          const current = subByRun.get(event.runId)
          if (current) {
            current.status = 'done'
            current.costUsd = event.costUsd ?? current.costUsd
            current.stop = event.stop
            closeLive(current.items)
          }
          run.costUsd += event.costUsd ?? 0
        }
        return
      case 'budget_warning':
        t.push({ kind: 'info', tone: 'warn', text: `Orcamento ${event.warning.scope}: ${event.warning.spentUsd.toFixed(4)} de ${event.warning.limitUsd.toFixed(4)} USD` })
        return
      case 'escalation':
        t.push({ kind: 'info', tone: 'warn', text: `Escalado de ${event.from} para ${event.to}: ${event.reason}` })
        return
      case 'compaction':
        t.push({ kind: 'info', text: `Compactacao (${event.mode}): ${event.before} para ${event.after} tokens estimados` })
        return
      case 'skills_loaded':
        t.push({ kind: 'info', text: `Skills: ${event.names.join(', ')}` })
        return
      case 'hook':
        if (!event.allow) t.push({ kind: 'info', tone: 'error', text: `Hook ${event.event}${event.tool ? ` em ${event.tool}` : ''} negou: ${event.reason ?? ''}` })
        return
      case 'phase':
        run.phase = event.name
        t.push({ kind: 'info', text: `Fase ${event.index + 1}: ${event.name}` })
        return
      case 'routed':
        run.agent = event.agent
        run.model = event.model
        t.push({ kind: 'info', text: routedText(event) })
        return
      case 'prompt_improved':
        t.push({ kind: 'improved', by: event.by, original: event.original, improved: event.improved, costUsd: event.costUsd })
        return
      case 'run_finished':
        if (nested) return
        closeLive(main)
        run.finished = true
        run.stop = event.stop
        run.error = event.error
        run.phase = undefined
        if (event.stop !== 'end') main.push({ kind: 'info', tone: event.stop === 'cancelled' ? 'warn' : 'error', text: `Run terminou com ${event.stop}${event.error ? `: ${event.error}` : ''}` })
        void loadCostStatus()
        return
      default:
        return
    }
  }

  function entries(sessionId: string): TerminalEntry[] {
    let list = terminal.get(sessionId)
    if (!list) {
      list = []
      terminal.set(sessionId, list)
    }
    return list
  }

  return {
    sessions,
    agents,
    agentErrors,
    timelines,
    runs,
    approvals,
    terminal,
    costStatus,
    feedback,
    setFeedback,
    refresh,
    update,
    updateMany,
    removeMany,
    remove,
    fork,
    loadAgents,
    loadCostStatus,
    open,
    create,
    start,
    cancel,
    respond,
    override,
    timeline,
    subagents,
  }
})

function routedText(event: Extract<RunEvent, { type: 'routed' }>): string {
  const by =
    event.by === 'rule' ? 'regra' : event.by === 'classifier' ? 'classificador' : event.by === 'score' ? 'pontuacao' : event.by === 'default' ? 'padrao' : event.by
  const head = `Roteado para ${event.agent} (${event.model}) por ${by}${event.intent ? `, intencao ${event.intent}` : ''}`
  const top = (event.ranking ?? []).filter((r) => r.excluded === undefined).slice(0, 3)
  if (top.length === 0) return head
  return `${head}. Ranking: ${top.map((r) => `${r.agent} ${r.score.toFixed(2)}`).join(', ')}`
}

function closeLive(t: TimelineItem[]): void {
  const last = t[t.length - 1]
  if (last && last.kind === 'assistant') last.live = false
}

function findTool(t: TimelineItem[], callId: string): ToolItem | undefined {
  for (let i = t.length - 1; i >= 0; i--) {
    const item = t[i]!
    if (item.kind === 'tool' && item.callId === callId) return item
    if (item.kind === 'subagent') {
      const inner = findTool(item.items, callId)
      if (inner) return inner
    }
  }
  return undefined
}

function fromMessages(messages: Message[]): TimelineItem[] {
  const t: TimelineItem[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      const raw = m.parts.map((p) => (p.type === 'text' ? p.text : '')).filter(Boolean).join('\n\n')
      const original = /<pedido_original>\n([\s\S]*?)\n<\/pedido_original>/.exec(raw)
      const text = original ? original[1]! : raw
      t.push(m.kind === 'compaction' ? { kind: 'info', text } : { kind: 'user', text })
      if (original) t.push({ kind: 'improved', by: 'harness', original: text, improved: raw.slice(0, original.index).trim(), costUsd: 0 })
      continue
    }
    if (m.role === 'assistant') {
      const text = m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')
      if (text) t.push({ kind: 'assistant', text, live: false, runId: m.runId })
      for (const p of m.parts) if (p.type === 'tool_call') t.push({ kind: 'tool', callId: p.id, name: p.name, args: p.args, decision: 'executed', runId: m.runId ?? '' })
      continue
    }
    for (const p of m.parts) {
      if (p.type !== 'tool_result') continue
      const item = findTool(t, p.callId)
      if (item) {
        item.result = p.content
        item.isError = p.isError
      }
    }
  }
  return t
}

/** Insere cartoes de subagente no historico carregado, logo apos a chamada delegate ou spawn com a mesma tarefa. */
function withChildren(items: TimelineItem[], children: { run_id: string; agent: string; messages: Message[] }[]): TimelineItem[] {
  if (children.length === 0) return items
  const out = [...items]
  for (const c of children) {
    const task = c.messages.find((m) => m.role === 'user')?.parts.find((p) => p.type === 'text')
    const taskText = task && task.type === 'text' ? task.text : ''
    const nested = fromMessages(c.messages).filter((i) => i.kind !== 'user')
    const last = [...c.messages].reverse().find((m) => m.role === 'assistant')
    const card: SubagentItem = { kind: 'subagent', agent: c.agent, task: taskText, status: 'done', costUsd: 0, items: nested, steps: c.messages.filter((m) => m.role === 'assistant').length, runId: c.run_id, stop: last ? 'end' : undefined }
    const anchor = out.findIndex((i) => i.kind === 'tool' && (i.name === 'delegate' || i.name === 'spawn') && String((i.args as { task?: string } | undefined)?.task ?? '') === taskText)
    if (anchor >= 0) out.splice(anchor + 1, 0, card)
    else out.push(card)
  }
  return out
}

/** Linhas adicionadas e removidas estimadas a partir dos argumentos de edicao. */
export function diffStats(item: ToolItem): { plus: number; minus: number } {
  const args = (item.args ?? {}) as Record<string, unknown>
  if (item.name === 'edit_file') {
    const oldText = String(args.old_text ?? '')
    const newText = String(args.new_text ?? '')
    return { plus: lines(newText), minus: lines(oldText) }
  }
  if (item.name === 'write_file') return { plus: lines(String(args.content ?? '')), minus: 0 }
  return { plus: 0, minus: 0 }
}

function lines(text: string): number {
  return text === '' ? 0 : text.split('\n').length
}
