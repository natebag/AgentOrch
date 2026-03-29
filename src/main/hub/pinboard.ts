import { v4 as uuid } from 'uuid'

export interface PinboardTask {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  status: 'open' | 'in_progress' | 'completed'
  claimedBy: string | null
  result: string | null
  createdAt: string
}

export class Pinboard {
  private tasks = new Map<string, PinboardTask>()
  onTaskCreated?: (task: PinboardTask) => void
  onTaskUpdated?: (task: PinboardTask) => void

  postTask(title: string, description: string, priority: 'low' | 'medium' | 'high' = 'medium'): PinboardTask {
    const task: PinboardTask = {
      id: uuid(),
      title,
      description,
      priority,
      status: 'open',
      claimedBy: null,
      result: null,
      createdAt: new Date().toISOString()
    }
    this.tasks.set(task.id, task)
    this.onTaskCreated?.(task)
    return task
  }

  loadTasks(tasks: PinboardTask[]): void {
    for (const task of tasks) {
      this.tasks.set(task.id, task)
    }
  }

  readTasks(): PinboardTask[] {
    return Array.from(this.tasks.values())
  }

  claimTask(taskId: string, agentName: string): { status: string; detail: string } {
    const task = this.tasks.get(taskId)
    if (!task) {
      return { status: 'error', detail: `Task '${taskId}' not found` }
    }
    if (task.status === 'completed') {
      return { status: 'error', detail: 'Task is already completed' }
    }
    if (task.claimedBy) {
      return { status: 'error', detail: `Task already claimed by '${task.claimedBy}'` }
    }
    task.claimedBy = agentName
    task.status = 'in_progress'
    this.onTaskUpdated?.(task)
    return { status: 'ok', detail: `Task claimed by '${agentName}'` }
  }

  completeTask(taskId: string, agentName: string, result?: string): { status: string; detail: string } {
    const task = this.tasks.get(taskId)
    if (!task) {
      return { status: 'error', detail: `Task '${taskId}' not found` }
    }
    if (task.claimedBy !== agentName) {
      return { status: 'error', detail: `Only the claimer ('${task.claimedBy}') can complete this task` }
    }
    task.status = 'completed'
    task.result = result ?? null
    this.onTaskUpdated?.(task)
    return { status: 'ok', detail: 'Task completed' }
  }
}
