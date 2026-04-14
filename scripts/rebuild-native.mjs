#!/usr/bin/env node
/**
 * Post-install native module rebuild for Electron.
 *
 * Problem: better-sqlite3 and node-pty ship prebuilt binaries for the
 * current Node.js ABI, but Electron uses a DIFFERENT Node version
 * internally. A plain `npm install` downloads Node prebuilds → Electron
 * fails to load them with NODE_MODULE_VERSION mismatch errors.
 *
 * Solution: after `npm install` completes, run `prebuild-install` inside
 * each native module with `--runtime=electron --target=<electron version>`
 * so the Electron-compatible prebuilt binary is downloaded and replaces
 * the Node one.
 *
 * No build tools (MSVC/Xcode) are required — this only downloads pre-
 * compiled binaries from the module's GitHub releases.
 *
 * If a module doesn't have an Electron prebuild for the target version,
 * this script logs a warning but doesn't fail the install. The user will
 * see a friendly error dialog at app startup with instructions.
 */
import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import path from 'path'

const MODULES = ['better-sqlite3', 'node-pty']
const ROOT = process.cwd()

// Read the Electron version from package.json so this doesn't drift
// when we bump Electron.
function getElectronVersion() {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
  const raw = pkg.devDependencies?.electron || pkg.dependencies?.electron
  if (!raw) return null
  // Strip any range prefix like ^ or ~ or >=
  return raw.replace(/^[^\d]*/, '')
}

function rebuildModule(moduleName, electronVersion) {
  const modulePath = path.join(ROOT, 'node_modules', moduleName)
  if (!existsSync(modulePath)) {
    console.log(`  [skip] ${moduleName} not installed`)
    return
  }

  // node-pty ships N-API prebuilds that are ABI-independent — skip it.
  // Only better-sqlite3 actually needs the Electron-specific rebuild.
  const prebuildsDir = path.join(modulePath, 'prebuilds')
  if (existsSync(prebuildsDir)) {
    console.log(`  [skip] ${moduleName} uses ABI-independent N-API prebuilds`)
    return
  }

  try {
    console.log(`  [rebuild] ${moduleName} for Electron ${electronVersion}...`)
    execSync(
      `npx prebuild-install --runtime=electron --target=${electronVersion}`,
      { cwd: modulePath, stdio: 'inherit' }
    )
    console.log(`  [ok] ${moduleName}`)
  } catch {
    console.warn(
      `  [warn] Could not fetch Electron prebuild for ${moduleName}.\n` +
      `         App may hit NODE_MODULE_VERSION mismatch at startup.\n` +
      `         If that happens, run: npm run rebuild:native`
    )
  }
}

const electronVersion = getElectronVersion()
if (!electronVersion) {
  console.log('[rebuild-native] electron dependency not found in package.json — skipping')
  process.exit(0)
}

console.log(`[rebuild-native] Ensuring native modules match Electron ${electronVersion}...`)
for (const name of MODULES) {
  rebuildModule(name, electronVersion)
}
console.log('[rebuild-native] Done.')
