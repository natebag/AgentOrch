import express from 'express'
import type { Server } from 'http'
import { AgentRegistry } from './agent-registry'
import { MessageRouter } from './message-router'
import { generateSecret, validateSecret } from './auth'
import { createRoutes } from './routes'

export interface HubServer {
  port: number
  secret: string
  registry: AgentRegistry
  messages: MessageRouter
  close: () => void
}

export function createHubServer(preferredPort = 0): Promise<HubServer> {
  return new Promise((resolve, reject) => {
    const app = express()
    const secret = generateSecret()
    const registry = new AgentRegistry()
    const messages = new MessageRouter(registry)

    app.use(express.json())

    app.use((req, res, next) => {
      const token = req.headers.authorization?.replace('Bearer ', '')
      if (!token || !validateSecret(secret, token)) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      next()
    })

    app.use(createRoutes(registry, messages))

    const server: Server = app.listen(preferredPort, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'))
        return
      }
      resolve({
        port: addr.port,
        secret,
        registry,
        messages,
        close: () => server.close()
      })
    })

    server.on('error', reject)
  })
}
