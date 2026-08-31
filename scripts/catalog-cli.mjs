#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validateDocument, validateProduct } from '../lib/domain/contracts.ts'

function usage() {
  console.error('Uso: npm run catalog:validate -- validate-product <arquivo.json>')
  console.error('     npm run catalog:validate -- validate-document <arquivo.json>')
}

const [command, inputPath] = process.argv.slice(2)
if (!command || !inputPath || !['validate-product', 'validate-document'].includes(command)) {
  usage()
  process.exitCode = 2
} else {
  try {
    const value = JSON.parse(await readFile(resolve(process.cwd(), inputPath), 'utf8'))
    const result = command === 'validate-product' ? validateProduct(value) : validateDocument(value)
    console.log(JSON.stringify({ command, valid: result.success, errors: result.errors ?? [] }, null, 2))
    process.exitCode = result.success ? 0 : 1
  } catch (error) {
    console.error(JSON.stringify({ command, valid: false, errors: [error instanceof Error ? error.message : String(error)] }, null, 2))
    process.exitCode = 1
  }
}

