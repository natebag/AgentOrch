import { Router, type Request, type Response } from 'express'
import type { AgentRegistry } from './agent-registry'
import type { MessageRouter } from './message-router'
import type { AgentConfig } from '../../shared/types'

export function createRoutes(registry: AgentRegistry, messages: MessageRouter): Router {
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

  router.get('/messages/:name', (req: Request, res: Response) => {
    const msgs = messages.getMessages(req.params.name)
    res.json(msgs)
  })

  return router
}
