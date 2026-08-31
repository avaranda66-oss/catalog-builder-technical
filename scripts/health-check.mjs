#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const checks = []

async function fileExists(relativePath) {
  try {
    await access(resolve(root, relativePath), constants.F_OK)
    return true
  } catch {
    return false
  }
}

function commandVersion(command, args = ['--version']) {
  try {
    return { value: execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), blocked: false }
  } catch (error) {
    return { value: null, blocked: ['EPERM', 'EACCES', 'EINVAL'].includes(error?.code) }
  }
}

function add(name, ok, detail) {
  checks.push({ name, ok, detail })
}

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const nodeCheck = commandVersion(process.execPath)
const npmCheck = commandVersion(process.platform === 'win32' ? 'npm.cmd' : 'npm')
const gitCheck = commandVersion(process.platform === 'win32' ? 'git.exe' : 'git')
add('node', nodeCheck.blocked ? null : Boolean(nodeCheck.value), nodeCheck.blocked ? 'spawn bloqueado pelo ambiente' : (nodeCheck.value || process.version))
add('npm', npmCheck.blocked ? null : Boolean(npmCheck.value), npmCheck.blocked ? 'spawn bloqueado pelo ambiente' : npmCheck.value)
add('git', gitCheck.blocked ? null : Boolean(gitCheck.value), gitCheck.blocked ? 'spawn bloqueado pelo ambiente' : gitCheck.value)
add('aiox constitution', await fileExists('.aiox-core/constitution.md'), '.aiox-core/constitution.md')
add('aiox configuration', await fileExists('.aiox-core/core-config.yaml'), '.aiox-core/core-config.yaml')
add('aiox master skill', await fileExists('.codex/skills/aiox-master/SKILL.md'), '.codex/skills/aiox-master/SKILL.md')
add('briefing', await fileExists('docs/briefing.md'), 'docs/briefing.md')
add('prd', await fileExists('docs/prd.md'), 'docs/prd.md')
add('architecture', await fileExists('docs/architecture.md'), 'docs/architecture.md')
add('visual spec', await fileExists('docs/frontend/frontend-spec.md'), 'docs/frontend/frontend-spec.md')
add('story', await fileExists('docs/stories/1.1-fundacao-baseline.story.md'), 'docs/stories/1.1-fundacao-baseline.story.md')
add('next package', Boolean(packageJson.dependencies?.next), packageJson.dependencies?.next ?? 'missing')
add('supabase package', Boolean(packageJson.dependencies?.['@supabase/supabase-js']), packageJson.dependencies?.['@supabase/supabase-js'] ?? 'missing')

let branch = 'unavailable'
try {
  branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim() || 'detached'
} catch (error) {
  branch = error?.code === 'EPERM' ? 'unavailable-in-sandbox' : 'unavailable'
}

const failed = checks.filter((check) => check.ok === false)
const warnings = checks.filter((check) => check.ok === null)
console.log(JSON.stringify({
  project: 'catalog-builder',
  root,
  branch,
  baseline: 'HEAD-1e93d6d',
  checks,
  ok: failed.length === 0,
  failed: failed.map((check) => check.name),
  warnings: warnings.map((check) => check.name),
}, null, 2))

process.exitCode = failed.length === 0 ? 0 : 1
