import { Router, type Request, type Response } from 'express'
import type { AgentRegistry } from './agent-registry'
import type { MessageRouter } from './message-router'
import type { Pinboard } from './pinboard'
import type { InfoChannel } from './info-channel'
import type { AgentConfig } from '../../shared/types'

export type OutputAccessor = (agentName: string, lines: number) => string[] | null

export function createRoutes(
  registry: AgentRegistry,
  messages: MessageRouter,
  outputRef: { accessor: OutputAccessor | null },
  pinboard: Pinboard,
  infoChannel: InfoChannel
): Router {
  const router = Router()

  router.get('/agents', (_req: Request, res: Response) => {
    res.json(registry.list())
  })

  router.post('/agents/register', (req: Request, res: Response) => {
    try {
      const config: AgentConfig = req.body
      const state = registry.register(config)
      res.json(state)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.get('/agents/:name/ceo-notes', (req: Request, res: Response) => {
    const agent = registry.get(req.params.name)
    if (!agent) {
      res.status(404).json({ error: `Agent '${req.params.name}' not found` })
      return
    }
    res.json({ name: agent.name, ceoNotes: agent.ceoNotes, role: agent.role })
  })

  router.post('/messages/send', (req: Request, res: Response) => {
    const { from, to, message } = req.body
    const result = messages.send(from, to, message)
    res.json(result)
  })

  router.post('/messages/broadcast', (req: Request, res: Response) => {
    const { from, message } = req.body
    const result = messages.broadcast(from, message)
    res.json(result)
  })

  router.get('/messages/:name', (req: Request, res: Response) => {
    const msgs = messages.getMessages(req.params.name)
    res.json(msgs)
  })

  // --- Pinboard routes ---

  router.post('/pinboard/tasks', (req: Request, res: Response) => {
    const { title, description, priority } = req.body
    if (!title || !description) {
      res.status(400).json({ error: 'title and description are required' })
      return
    }
    const task = pinboard.postTask(title, description, priority)
    res.json({ id: task.id, title: task.title })
  })

  router.get('/pinboard/tasks', (_req: Request, res: Response) => {
    res.json(pinboard.readTasks())
  })

  router.post('/pinboard/tasks/:id/claim', (req: Request, res: Response) => {
    const { from } = req.body
    const result = pinboard.claimTask(req.params.id, from)
    if (result.status === 'error') {
      res.status(409).json(result)
      return
    }
    res.json(result)
  })

  router.post('/pinboard/tasks/:id/complete', (req: Request, res: Response) => {
    const { from, result } = req.body
    const outcome = pinboard.completeTask(req.params.id, from, result)
    if (outcome.status === 'error') {
      res.status(409).json(outcome)
      return
    }
    res.json(outcome)
  })

  // --- Info Channel routes ---

  router.post('/info', (req: Request, res: Response) => {
    try {
      const { from, note, tags } = req.body
      if (!from || !note) {
        res.status(400).json({ error: 'from and note are required' })
        return
      }
      const entry = infoChannel.postInfo(from, note, tags || [])
      res.json(entry)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.get('/info', (req: Request, res: Response) => {
    const tagsParam = req.query.tags as string | undefined
    const tags = tagsParam ? tagsParam.split(',').filter(Boolean) : undefined
    const entries = infoChannel.readInfo(tags)
    res.json(entries)
  })

  // --- Output route ---

  router.get('/agents/:name/output', (req: Request, res: Response) => {
    const agent = registry.get(req.params.name)
    if (!agent) {
      res.status(404).json({ error: `Agent '${req.params.name}' not found` })
      return
    }
    if (!outputRef.accessor) {
      res.status(503).json({ error: 'Output not available' })
      return
    }
    const lines = Math.min(Math.max(Number(req.query.lines) || 50, 1), 1000)
    const output = outputRef.accessor(req.params.name, lines)
    if (!output) {
      res.status(404).json({ error: `No output buffer for agent '${req.params.name}'` })
      return
    }
    res.json({ lines: output, count: output.length })
  })

  return router
}
