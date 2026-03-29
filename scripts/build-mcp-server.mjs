import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/mcp-server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'out/mcp-server/index.js',
  format: 'cjs'
  // No externals — bundle everything so the server is fully self-contained.
  // This way it works regardless of what directory codex/kimi spawns it from.
})
