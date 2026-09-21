/**
 * [INPUT]: 依赖浏览器原生 Array iterator 与 Symbol.iterator
 * [OUTPUT]: 为缺少 Iterator Helpers 的 WebKit 补齐 Iterator、filter、toArray、join
 * [POS]: 桌面 WebView 的最早期兼容层；主文档与 PDF worker 共用，供官方文档预览包消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

(() => {
  const root = globalThis
  const iteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))

  if (typeof root.Iterator !== 'function') {
    const Iterator = function Iterator() {}
    Iterator.prototype = iteratorPrototype
    Object.defineProperty(root, 'Iterator', { configurable: true, writable: true, value: Iterator })
  }

  const define = (name, implementation) => {
    if (typeof iteratorPrototype[name] !== 'function') {
      Object.defineProperty(iteratorPrototype, name, {
        configurable: true,
        writable: true,
        value: implementation,
      })
    }
  }

  define('join', function join(separator) {
    return [...this].join(separator)
  })
  define('toArray', function toArray() {
    return [...this]
  })
  define('filter', function filter(predicate) {
    const source = this
    return (function* filtered() {
      let index = 0
      for (const value of source) if (predicate(value, index++)) yield value
    })()
  })
})()
