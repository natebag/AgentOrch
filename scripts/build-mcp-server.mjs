import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/mcp-server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'out/mcp-server/index.js',
  format: 'cjs',
  external: ['@modelcontextprotocol/sdk']
})
