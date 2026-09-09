import type { AgentSummary, Message, RunEvent, ServerFrame, SessionSummary } from '@agent-hub/core'
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { client } from '../daemon/client'

export type TimelineItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; live: boolean }
  | { kind: 'tool'; callId: string; name: string; args: unknown; decision: string; result?: string; isError?: boolean; ms?: number }
  | { kind: 'info'; text: string }

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
}

export const useSessions = defineStore('sessions', () => {
  const sessions = ref<SessionSummary[]>([])
  const agents = ref<AgentSummary[]>([])
  const agentErrors = ref<{ file: string; message: string }[]>([])
  const timelines = reactive(new Map<string, TimelineItem[]>())
  const runs = reactive(new Map<string, RunState>())
  const approvals = ref<Approval[]>([])
  const lastSeq = reactive(new Map<string, number>())

  client.on(handle)
  let wasOnline = false
  client.onStatus((s) => {
    if (s === 'online' && wasOnline) void resync()
    if (s === 'online') wasOnline = true
  })

  /** Depois de reconectar, busca a lista e os eventos perdidos de cada sessao aberta. */
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

  async function refresh(): Promise<void> {
    const list = await client.request({ type: 'session.list', limit: 100 }, 'session.list')
    sessions.value = list.sessions
  }

  async function loadAgents(): Promise<void> {
    const res = await client.request({ type: 'agents.list' }, 'agents.list')
    agents.value = res.agents
    agentErrors.value = res.errors
  }

  async function open(sessionId: string): Promise<void> {
    const res = await client.request({ type: 'session.get', session_id: sessionId }, 'session.get')
    timelines.set(sessionId, fromMessages(res.messages))
    const since = lastSeq.get(sessionId)
    if (since !== undefined) {
      const sync = await client.request({ type: 'sync', session_id: sessionId, since_seq: since }, 'sync')
      for (const e of sync.events) applyEvent(sessionId, e.run_id, e.seq, e.event)
    }
  }

  async function create(workspace: string, agent?: string, text?: string): Promise<SessionSummary> {
    const res = await client.request({ type: 'session.create', workspace, agent, text }, 'session.created')
    await refresh()
    return res.session
  }

  async function start(sessionId: string, text: string): Promise<string> {
    timeline(sessionId).push({ kind: 'user', text })
    const res = await client.request({ type: 'run.start', session_id: sessionId, text }, 'run.started')
    runs.set(sessionId, { runId: res.run_id, costUsd: 0, steps: 0, finished: false })
    return res.run_id
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
      sessions.value.sort((a, b) => b.updatedAt - a.updatedAt)
    }
  }

  function applyEvent(sessionId: string, runId: string, seq: number, event: RunEvent): void {
    const known = lastSeq.get(sessionId) ?? 0
    if (seq <= known) return
    lastSeq.set(sessionId, seq)
    const t = timeline(sessionId)
    const run = runs.get(sessionId) ?? { runId, costUsd: 0, steps: 0, finished: false }
    runs.set(sessionId, run)
    switch (event.type) {
      case 'text_delta': {
        const last = t[t.length - 1]
        if (last && last.kind === 'assistant' && last.live) last.text += event.delta
        else t.push({ kind: 'assistant', text: event.delta, live: true })
        return
      }
      case 'tool_call':
        closeLive(t)
        t.push({ kind: 'tool', callId: event.call.id, name: event.call.name, args: event.call.args, decision: event.decision })
        return
      case 'tool_result': {
        const item = [...t].reverse().find((i) => i.kind === 'tool' && i.callId === event.callId)
        if (item && item.kind === 'tool') {
          item.result = event.content
          item.isError = event.isError
          item.ms = event.ms
        }
        return
      }
      case 'usage':
        run.costUsd += event.costUsd
        run.steps = event.step
        return
      case 'budget_warning':
        t.push({ kind: 'info', text: `Aviso de orcamento (${event.warning.scope}): ${event.warning.spentUsd.toFixed(4)} de ${event.warning.limitUsd.toFixed(4)} USD` })
        return
      case 'escalation':
        t.push({ kind: 'info', text: `Escalado de ${event.from} para ${event.to}: ${event.reason}` })
        return
      case 'compaction':
        t.push({ kind: 'info', text: `Compactacao (${event.mode}): ${event.before} para ${event.after} tokens estimados` })
        return
      case 'skills_loaded':
        t.push({ kind: 'info', text: `Skills carregadas: ${event.names.join(', ')}` })
        return
      case 'run_finished':
        closeLive(t)
        run.finished = true
        run.stop = event.stop
        run.error = event.error
        if (event.stop !== 'end') t.push({ kind: 'info', text: `Run terminou com ${event.stop}${event.error ? `: ${event.error}` : ''}` })
        return
      default:
        return
    }
  }

  return { sessions, agents, agentErrors, timelines, runs, approvals, refresh, loadAgents, open, create, start, cancel, respond, override, timeline }
})

function closeLive(t: TimelineItem[]): void {
  const last = t[t.length - 1]
  if (last && last.kind === 'assistant') last.live = false
}

function fromMessages(messages: Message[]): TimelineItem[] {
  const t: TimelineItem[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      const text = m.parts.map((p) => (p.type === 'text' ? p.text : '')).filter(Boolean).join('\n\n')
      t.push(m.kind === 'compaction' ? { kind: 'info', text } : { kind: 'user', text })
      continue
    }
    if (m.role === 'assistant') {
      const text = m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')
      if (text) t.push({ kind: 'assistant', text, live: false })
      for (const p of m.parts) if (p.type === 'tool_call') t.push({ kind: 'tool', callId: p.id, name: p.name, args: p.args, decision: 'executed' })
      continue
    }
    for (const p of m.parts) {
      if (p.type !== 'tool_result') continue
      const item = [...t].reverse().find((i) => i.kind === 'tool' && i.callId === p.callId)
      if (item && item.kind === 'tool') {
        item.result = p.content
        item.isError = p.isError
      }
    }
  }
  return t
}
