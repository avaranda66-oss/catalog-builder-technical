#!/usr/bin/env node

import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const testsDir = resolve(import.meta.dirname, '..', 'tests')
const entries = (await readdir(testsDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /\.test\.(?:mjs|cjs|js)$/.test(entry.name))
  .map((entry) => entry.name)
  .sort()

if (entries.length === 0) {
  console.log('Nenhum teste encontrado.')
} else {
  for (const entry of entries) {
    await import(new URL(`../tests/${entry}`, import.meta.url))
  }
}

