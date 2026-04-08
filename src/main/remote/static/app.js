(function() {
  'use strict'
  const TOKEN = window.__TOKEN__
  const BASE = `/r/${TOKEN}`
  const POLL_INTERVAL_MS = 5000
  const OUTPUT_CACHE_MS = 5000

  const $ = (id) => document.getElementById(id)
  const outputCache = new Map()  // agentId → { lines, fetchedAt }
  let pollHandle = null
  let agents = []

  function statusMessage(text, kind) {
    const el = $('status-message')
    el.textContent = text
    el.className = `status-message ${kind || ''}`
    if (text) {
      setTimeout(() => { if (el.textContent === text) { el.textContent = ''; el.className = 'status-message' } }, 3000)
    }
  }

  async function fetchState() {
    try {
      const res = await fetch(`${BASE}/state`)
      if (res.status === 404) {
        showDisconnected()
        return
      }
      if (!res.ok) {
        statusMessage(`Server error ${res.status}`, 'error')
        return
      }
      const data = await res.json()
      render(data)
    } catch (err) {
      statusMessage('Network error', 'error')
    }
  }

  function showDisconnected() {
    $('disconnected-overlay').classList.remove('hidden')
    if (pollHandle) { clearInterval(pollHandle); pollHandle = null }
  }

  function render(state) {
    $('project-name').textContent = state.projectName
    $('agent-summary').textContent = `${state.agents.length} agents · ${state.connectionCount} conn`
    const badge = $('connection-badge')
    badge.textContent = `${state.connectionCount === 1 ? '🟢' : '🔴'} ${state.connectionCount}`
    badge.className = `badge ${state.connectionCount > 1 ? 'warn' : 'ok'}`

    agents = state.agents
    renderAgents(state.agents)
    renderSchedules(state.schedules)
    renderPinboard(state.pinboardTasks)
    renderBuddyRoom(state.buddyRoom)
    renderSendTargets(state.agents)
  }

  function renderAgents(list) {
    const container = $('agents-list')
    if (list.length === 0) {
      container.innerHTML = '<div style="color:#666;font-size:12px;font-style:italic">No agents</div>'
      return
    }
    container.innerHTML = list.map(a => `
      <div class="agent-card" data-agent-id="${escapeHtml(a.id)}">
        <div class="agent-card-header" data-action="toggle-output">
          <div>
            <div class="agent-name">${escapeHtml(a.name)}</div>
            <div class="agent-meta">${escapeHtml(a.cli)} · ${escapeHtml(a.model || 'default')}</div>
          </div>
          <span class="agent-status ${escapeHtml(a.status)}">${escapeHtml(a.status)}</span>
        </div>
        <div class="agent-output hidden" data-output-for="${escapeHtml(a.id)}" style="display:none"></div>
      </div>
    `).join('')

    container.querySelectorAll('.agent-card-header').forEach(header => {
      header.addEventListener('click', async () => {
        const card = header.closest('.agent-card')
        const id = card.dataset.agentId
        const outputDiv = card.querySelector('[data-output-for]')
        if (outputDiv.style.display === 'none') {
          outputDiv.style.display = 'block'
          outputDiv.textContent = 'Loading...'
          const lines = await fetchOutput(id)
          outputDiv.textContent = lines.join('\n') || '(no output)'
        } else {
          outputDiv.style.display = 'none'
        }
      })
    })
  }

  async function fetchOutput(agentId) {
    const cached = outputCache.get(agentId)
    if (cached && Date.now() - cached.fetchedAt < OUTPUT_CACHE_MS) {
      return cached.lines
    }
    try {
      const res = await fetch(`${BASE}/agent/${encodeURIComponent(agentId)}/output`)
      if (!res.ok) return []
      const data = await res.json()
      outputCache.set(agentId, { lines: data.lines, fetchedAt: Date.now() })
      return data.lines
    } catch {
      return []
    }
  }

  function renderSchedules(list) {
    const container = $('schedules-list')
    if (list.length === 0) {
      container.innerHTML = '<div style="color:#666;font-size:12px;font-style:italic">No schedules</div>'
      return
    }
    container.innerHTML = list.map(s => {
      const isPaused = s.status === 'paused'
      const intervalDisplay = s.intervalMinutes >= 60 && s.intervalMinutes % 60 === 0
        ? `${s.intervalMinutes / 60}h`
        : `${s.intervalMinutes}min`
      const nextFireMs = Math.max(0, s.nextFireAt - Date.now())
      const nextFireMin = Math.floor(nextFireMs / 60000)
      return `
        <div class="schedule-card" data-schedule-id="${escapeHtml(s.id)}" data-status="${escapeHtml(s.status)}">
          <div class="schedule-name">
            📅 ${escapeHtml(s.name)}
            <span class="agent-status ${escapeHtml(s.status)}">${escapeHtml(s.status)}</span>
          </div>
          <div class="schedule-meta">
            → ${escapeHtml(s.agentName)}<br>
            Every ${intervalDisplay} · ${s.expiresAt === null ? '∞ running' : `${formatTimeLeft(s.expiresAt - Date.now())} left`}
            ${isPaused ? '' : `<br>Next: in ${nextFireMin}m`}
          </div>
          <div class="schedule-actions">
            ${isPaused
              ? '<button data-action="resume">▶ Resume</button>'
              : '<button data-action="pause">⏸ Pause</button>'}
            ${s.status === 'expired' || s.status === 'stopped' ? '<button data-action="restart">↻ Restart</button>' : ''}
          </div>
        </div>
      `
    }).join('')

    container.querySelectorAll('.schedule-card').forEach(card => {
      const id = card.dataset.scheduleId
      card.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => scheduleAction(id, btn.dataset.action))
      })
    })
  }

  function formatTimeLeft(ms) {
    if (ms <= 0) return '0m'
    const mins = Math.floor(ms / 60000)
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    const remMin = mins % 60
    return remMin === 0 ? `${hours}h` : `${hours}h ${remMin}m`
  }

  function renderPinboard(list) {
    const container = $('pinboard-list')
    if (list.length === 0) {
      container.innerHTML = '<div style="color:#666;font-size:12px;font-style:italic">No tasks</div>'
      return
    }
    container.innerHTML = list.map(t => `
      <div class="task-card">
        <div class="task-priority-dot ${escapeHtml(t.priority)}"></div>
        <div>
          <div>${escapeHtml(t.title)}</div>
          ${t.claimedBy ? `<div style="color:#888;font-size:11px">claimed by ${escapeHtml(t.claimedBy)}</div>` : ''}
        </div>
      </div>
    `).join('')
  }

  function renderBuddyRoom(messages) {
    const container = $('buddy-list')
    if (messages.length === 0) {
      container.innerHTML = '<div style="color:#666;font-size:12px;font-style:italic">No messages</div>'
      return
    }
    container.innerHTML = messages.slice(-20).map(m => `
      <div class="buddy-msg">
        <div class="agent-name">${escapeHtml(m.agentName)}</div>
        <div>${escapeHtml(m.message)}</div>
      </div>
    `).join('')
  }

  function renderSendTargets(list) {
    const select = $('send-target')
    const currentValue = select.value
    select.innerHTML = list.map(a => `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`).join('')
    if (currentValue && list.some(a => a.name === currentValue)) {
      select.value = currentValue
    }
  }

  function escapeHtml(s) {
    if (s === undefined || s === null) return ''
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  // Polling lifecycle
  function startPolling() {
    if (pollHandle) return
    fetchState()
    pollHandle = setInterval(fetchState, POLL_INTERVAL_MS)
  }

  function stopPolling() {
    if (pollHandle) {
      clearInterval(pollHandle)
      pollHandle = null
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') startPolling()
    else stopPolling()
  })

  // Section collapse
  document.querySelectorAll('.section-header[data-toggle]').forEach(header => {
    header.addEventListener('click', (e) => {
      // ignore clicks on the inline + button
      if (e.target.classList.contains('inline-btn')) return
      const targetId = header.dataset.toggle
      const body = document.getElementById(targetId)
      if (body) body.classList.toggle('collapsed')
    })
  })

  // Manual refresh
  $('refresh-btn').addEventListener('click', fetchState)

  // Action handlers — populated by Task 15

  // Initial start
  startPolling()
})()
