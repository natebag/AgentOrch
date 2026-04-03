# AgentOrch — What's Next

Full review of the AgentOrch codebase, cross-referenced against Claude Code internals (`F:\coding\Clud\src`).

---

## Critical Bugs

### 1. Database nukes all data on every startup
**File:** `src/main/db/database.ts:16-18`
```sql
DELETE FROM pinboard_tasks;
DELETE FROM info_entries;
DELETE FROM messages;
```
The entire SQLite persistence layer is pointless. `loadTasks()` and `loadEntries()` in `main()` always return empty arrays because the DB was just wiped. **One-line fix** — remove or gate the DELETE statements behind a "fresh session" flag.

### 2. hubFetch has no error handling
**File:** `src/mcp-server/index.ts:24-33`
No `res.ok` check, no try/catch. If the hub returns 4xx/5xx, `res.json()` parses the error JSON and returns it as a "success". If the hub is DOWN, fetch throws an unhandled exception that crashes the entire tool call.

**Fix:** Wrap in try/catch, check `res.ok`, return structured error with `isError: true`.

### 3. Tool errors don't use `isError: true`
**File:** `src/mcp-server/index.ts` (all tool handlers)
Every error returns `{ content: [...] }` — identical shape to success. Claude Code internally distinguishes failed tool results (`isError: true`) from successful ones. Without this, the model can't tell if `{"status":"error"}` is data or a failure, and doesn't adjust behavior accordingly.

---

## Architecture Issues

### 4. Message nudge injects raw text into PTY stdin
**File:** `src/main/index.ts:173`
```ts
writeToPty(managed, nudge + '\r')
```
If the agent is mid-response or mid-tool-call, this corrupts the input stream. Claude Code uses `SendMessage` as a queued tool result, not stdin injection. This is why agents sometimes behave erratically when messages arrive during active work.

**Fix:** Queue nudges and deliver them only when StatusDetector reports the agent is at a prompt (`active` status).

### 5. CLI launch timing is hardcoded setTimeout chains
**File:** `src/main/index.ts`
```ts
const CLI_LOAD_TIME = 10000
```
`StatusDetector` already knows when an agent reaches a prompt. Use it to trigger initial prompt injection instead of blind 10-second waits. Some CLIs load in 3s, some take 20s.

**Fix:** Add a one-shot listener on StatusDetector's `onChange` that fires the initial prompt when status first transitions to `active`.

### 6. Reconnect loses all conversation context
**File:** `src/main/index.ts` — `reconnectAgent()`
Agent crashes, respawns, gets a fresh "You are X, call read_ceo_notes()" — no idea it was mid-task. Should at minimum inject a summary of recent messages (from MessageStore) and any claimed tasks.

### 7. get_messages is destructive
**File:** `src/main/hub/message-router.ts:61-66`
Queue cleared the moment messages are fetched. If the agent crashes mid-turn after calling `get_messages`, those messages are permanently gone.

**Fix options:**
- Add an `ack` parameter — messages stay until explicitly acknowledged
- Keep messages in SQLite and mark as read instead of deleting
- At minimum, add a `peek` mode that doesn't clear the queue

---

## Missing MCP Tools

### 8. No `abandon_task`
Agent claims a task and dies. Task stuck `in_progress` forever. No one can reclaim it.

**Fix:** Add `abandon_task(task_id)` tool + `Pinboard.abandonTask()` method that sets status back to `open` and clears `claimedBy`.

### 9. No `update_status`
`AgentRegistry.updateStatus()` exists server-side but is never exposed via MCP. Agents can't tell the hub they're `working` vs `idle`. Status is only updated by the PTY status detector, which is unreliable for non-terminal states.

### 10. No `get_message_history`
`MessageStore.getMessageHistory()` exists in the DB layer but has no MCP tool or route. Agents can only get unread messages (destructively). Can't recall past conversations.

**Fix:** Add route `GET /messages/history/:name?limit=N` and MCP tool `get_message_history(agent?, limit?)`.

### 11. No `get_task` by ID
`read_tasks` dumps ALL tasks. As tasks pile up, this wastes massive tokens just to check one task's status.

**Fix:** Add `get_task(task_id)` tool + route `GET /pinboard/tasks/:id`.

---

## Data Integrity

### 12. `get_agents` leaks ceoNotes to every agent
**File:** `src/main/hub/routes.ts:13`
Returns full `AgentState` including `ceoNotes`. The whole point of `read_ceo_notes` as a separate tool is information isolation. But `get_agents` bypasses it, wasting tokens and leaking private instructions.

**Fix:** Strip `ceoNotes` from the `GET /agents` response. Return `{ name, role, status, cli, model }` only.

### 13. `post_task` drops the creator
**File:** `src/main/hub/routes.ts:70-76`
Route destructures `from` from the body but `Pinboard.postTask()` never receives it. No way to know who created a task.

**Fix:** Add `createdBy` field to `PinboardTask`, pass `from` through to `postTask()`.

### 14. Registry throws on duplicate registration
**File:** `src/main/hub/agent-registry.ts:8`
Agent restart = `Agent 'X' already exists` error. Should upsert (update if exists, register if new).

---

## Reliability

### 15. No heartbeat/health check
If the MCP server process dies silently, the hub has no way to know. Agent appears "active" from PTY output but can't communicate via MCP.

**Fix:** Add a periodic ping from the MCP server to the hub, or a `/health` endpoint the hub polls.

### 16. OutputBuffer splits PTY chunks on `\n` incorrectly
**File:** `src/main/shell/output-buffer.ts:12-17`
PTY data arrives as arbitrary byte chunks, not line-aligned. `data.split('\n')` creates phantom empty strings and splits partial lines. Should accumulate a partial-line buffer and only push complete lines.

### 17. Rate limit too tight
**File:** `src/main/hub/message-router.ts:5-6`
10 messages/minute per agent. Active multi-agent workflows with 4+ agents hit this quickly. Consider 30/minute or per-target limits instead of global.

---

## Security

### 18. Hub secret passed as CLI args for codex/gemini
**File:** `src/main/cli-launch.ts:28-30`
```ts
`codex mcp add agentorch -- node "${mcpServerPath}" ${hubPort} ${hubSecret} ...`
```
Visible in `ps aux` / Task Manager to any user on the system. Env vars are the safer approach (already used for Claude).

**Fix:** Use env vars consistently for all CLIs. For codex/gemini that need `mcp add`, write the secret to a temp file and pass `--env-file`.

### 19. Codex launch uses PowerShell syntax regardless of shell
**File:** `src/main/cli-launch.ts:28`
`2>$null` is PowerShell-only. If someone configures bash as their shell, this fails silently.

**Fix:** Use shell-appropriate null redirect (`2>/dev/null` for bash, `2>$null` for PowerShell).

---

## Minor

### 20. Info channel has no delete/update
Once info is posted, it can never be corrected or removed. Stale info accumulates up to 500 FIFO max. Add `delete_info(id)` and optionally `update_info(id, note)`.

---

## Priority Order

| # | Fix | Impact | Effort |
|---|-----|--------|--------|
| 1 | DB wipe on startup | Data survives restarts | Trivial |
| 2 | hubFetch error handling + isError | No silent failures | Small |
| 3 | StatusDetector-driven prompt injection | Reliable CLI launch | Medium |
| 4 | Add abandon_task + get_message_history | Unblocks stuck workflows | Small |
| 5 | Strip ceoNotes from get_agents | Token savings + isolation | Trivial |
| 6 | Registry upsert | Clean reconnects | Trivial |
| 7 | Task creator tracking | Accountability | Trivial |
| 8 | Queue-aware message nudging | No corrupted stdin | Medium |
| 9 | Reconnect context injection | Agents resume work | Medium |
| 10 | Secret via env vars for all CLIs | Security hardening | Small |

---

## Ideas From Claude Code Source

Things we learned from `F:\coding\Clud\src` that could enhance AgentOrch:

- **Coordinator mode** (`coordinator/coordinatorMode.ts`) — Claude Code has a built-in multi-agent coordinator. AgentOrch could learn from its dispatch patterns.
- **autoDream** (`services/autoDream/`) — Background memory consolidation after sessions. AgentOrch agents could auto-summarize their work.
- **extractMemories** (`services/extractMemories/`) — Auto-extracts memories from conversations. Could give AgentOrch agents persistent cross-session memory.
- **StatusDetector → KAIROS-style proactive mode** — If an agent is idle for too long, proactively check for work instead of waiting for nudges.
