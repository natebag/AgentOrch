# AgentOrch + OpenClaude Integration Plan

## What Is OpenClaude?

**Source:** https://gitlawb.com/node/repos/z6MkqDnb/openclaude

A fork of Claude Code that replaces the Anthropic-only API layer with an **OpenAI-compatible shim** (`openaiShim.ts`). This means Claude Code's entire tool system — bash execution, file ops, grep/glob, agents, MCP, task management, streaming — works with ANY LLM provider.

Supports 200+ models: GPT-4o, DeepSeek, Gemini (via OpenRouter), Ollama (local), Mistral, Groq, Together AI, Azure OpenAI.

## Why This Matters for AgentOrch

AgentOrch currently spawns agents by CLI type (`claude`, `codex`, `kimi`, `gemini`, `grok`). Each CLI has its own tool system, its own quirks, its own MCP integration approach. OpenClaude unifies this:

**Before (current):**
```
Agent "Researcher" → claude CLI → Anthropic tools
Agent "Coder"      → codex CLI  → OpenAI tools (different format)
Agent "Reviewer"   → kimi CLI   → Kimi tools (different again)
```

**After (with OpenClaude):**
```
Agent "Researcher" → OpenClaude → GPT-4o      → SAME Claude Code tools
Agent "Coder"      → OpenClaude → DeepSeek    → SAME Claude Code tools
Agent "Reviewer"   → OpenClaude → Claude Opus → SAME Claude Code tools
Agent "Local"      → OpenClaude → Ollama      → SAME Claude Code tools
```

Every agent gets the SAME tool system (CC's full suite) regardless of backing model. The MCP server we built works identically across all of them. No more per-CLI quirks.

## Key Benefits

1. **Cost optimization** — Use cheap models (DeepSeek, Haiku) for simple tasks, expensive ones (Opus, GPT-4o) for complex
2. **Unified MCP** — Our AgentOrch MCP server works identically for every agent since they all speak the same tool protocol
3. **Model redundancy** — If one provider is down or rate-limited, swap to another with zero code changes
4. **Local models** — Ollama support means agents can run on-device for sensitive/offline work
5. **No CLI fragmentation** — Stop maintaining separate launch commands for claude/codex/kimi/gemini/grok

## Integration Plan

### Phase 1: Setup OpenClaude as a CLI option
1. Clone OpenClaude repo
2. Build it locally (`npm install && npm run build` or equivalent)
3. Add `"openclaude"` as a new CLI type in `src/shared/types.ts`
4. Add launch logic in `src/main/cli-launch.ts`:
   ```ts
   if (cliBase === 'openclaude') {
     // Set the model via env var (OpenClaude reads OPENAI_MODEL or similar)
     const parts = [`openclaude`]
     if (config.model) parts[0] += ` --model ${config.model}`
     if (config.autoMode) parts[0] += ' --dangerously-skip-permissions'
     return parts
   }
   ```
5. Add model provider config to the spawn dialog — user picks model + provider per agent

### Phase 2: MCP Config for OpenClaude agents
- OpenClaude should support `--mcp-config` the same way Claude does (it's a CC fork)
- The existing `writeAgentMcpConfig()` in `src/main/mcp/config-writer.ts` should work as-is
- Test: spawn an OpenClaude agent, verify it can call `get_messages()`, `send_message()`, etc.

### Phase 3: Multi-model workspace presets
- Create presets like "Cost-Optimized Team":
  - Orchestrator: Claude Opus (smart, expensive, makes decisions)
  - Researcher: GPT-4o (good at web search, broad knowledge)
  - Coder: DeepSeek (cheap, fast, good at code)
  - Reviewer: Claude Sonnet (balanced, good at review)
- Save as preset in `src/main/presets/preset-manager.ts`

### Phase 4: Dynamic model switching
- Add an MCP tool `switch_model` that lets agents request a model change mid-task
- Hub routes the request, updates the agent's OpenClaude config
- Use case: agent starts with cheap model, escalates to expensive one when it hits a hard problem

## Files to Modify

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `'openclaude'` to the `cli` union type |
| `src/main/cli-launch.ts` | Add OpenClaude launch command builder |
| `src/main/mcp/config-writer.ts` | Verify OpenClaude reads same MCP config format |
| `src/renderer/components/SpawnDialog.tsx` | Add OpenClaude option + model provider picker |
| `src/main/presets/preset-manager.ts` | Add multi-model preset templates |

## Environment Variables (OpenClaude)

```env
OPENAI_API_KEY=sk-...          # For GPT-4o
OPENAI_BASE_URL=https://...    # For custom providers (OpenRouter, Together, etc.)
OPENAI_MODEL=gpt-4o            # Model selection
# OR for local:
OPENAI_BASE_URL=http://localhost:11434/v1  # Ollama
OPENAI_MODEL=llama3                         # Local model
```

## Quick Test (manual)

1. Install OpenClaude globally
2. Set env vars for a model provider
3. Run: `openclaude --mcp-config /tmp/agentorch-test-mcp.json`
4. Verify all AgentOrch MCP tools work (send_message, get_agents, etc.)
5. If it works → add to AgentOrch CLI options

## Reference

- AgentOrch bug/improvement list: `whatsnext.md` (same folder)
- Claude Code source analysis: `F:\coding\Clud\src`
- Claude Code internals memory: `~/.claude/projects/F--coding-Clud/memory/`
