const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function memoryStorage() {
  const items = new Map()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, String(value)) },
    removeItem: (key) => { items.delete(key) },
    clear: () => items.clear(),
    items,
  }
}

function installTsHook(options = {}) {
  const mocks = options.mockModules || {}
  const originalLoad = Module._load
  const originalTs = require.extensions['.ts']
  const originalTsx = require.extensions['.tsx']
  Module._load = function (specifier, parent, isMain) {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier]
    const absolute = parent && specifier.startsWith('.') ? path.resolve(path.dirname(parent.filename), specifier) : specifier
    if (Object.hasOwn(mocks, absolute)) return mocks[absolute]
    if (Object.hasOwn(mocks, `${absolute}.ts`)) return mocks[`${absolute}.ts`]
    return originalLoad.call(this, specifier, parent, isMain)
  }
  const compile = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename,
    }).outputText
    module._compile(output, filename)
  }
  require.extensions['.ts'] = compile
  require.extensions['.tsx'] = compile
  return () => {
    Module._load = originalLoad
    require.extensions['.ts'] = originalTs
    require.extensions['.tsx'] = originalTsx
  }
}

module.exports = { installTsHook, memoryStorage }
