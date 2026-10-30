#!/usr/bin/env node
/**
 * 发布体检查：确认索引里每个城市包的直链**仍然可用且字节数一致**。
 *
 * 只发 HEAD 请求，不下载内容——370 个包几十秒跑完，零存储成本。
 * 任何包丢了、被替换了、或仓库转私有导致 404/403，都会让这个脚本退出码非 0
 * （配合 verify-releases.yml 的每周定时，能第一时间发现而不是等用户下载失败）。
 *
 * 用法：
 *   node scripts/verify-releases.mjs            # 全量校验
 *   node scripts/verify-releases.mjs 20         # 只抽查前 20 个
 *   node scripts/verify-releases.mjs 0 --verbose
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LIMIT = parseInt(process.argv[2] || '0', 10)
const VERBOSE = process.argv.includes('--verbose')
const CONCURRENCY = 12

const idx = JSON.parse(readFileSync(resolve(ROOT, 'tiles/cities-index.json'), 'utf8'))
let cities = idx.cities.filter((c) => c.ready)
if (LIMIT > 0) cities = cities.slice(0, LIMIT)
console.log(`体检 ${cities.length} 个城市包（索引声称合计 ${(idx.totalBytes / 1024 ** 3).toFixed(2)} GB）`)

const check = async (c) => {
  const url = c.url
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { method: 'HEAD', redirect: 'follow' })
      if (!r.ok) {
        if (i === 3) return { adcode: c.adcode, name: c.name, ok: false, why: `HTTP ${r.status}` }
        await new Promise((s) => setTimeout(s, 1200 * i))
        continue
      }
      const len = r.headers.get('content-length')
      const got = len ? parseInt(len, 10) : -1
      if (got !== c.bytes) {
        return { adcode: c.adcode, name: c.name, ok: false, why: `字节数不符 ${got} != ${c.bytes}` }
      }
      return { adcode: c.adcode, name: c.name, ok: true, bytes: got }
    } catch (e) {
      if (i === 3) return { adcode: c.adcode, name: c.name, ok: false, why: String(e.message) }
      await new Promise((s) => setTimeout(s, 1200 * i))
    }
  }
}

const results = []
let cursor = 0
const worker = async () => {
  while (cursor < cities.length) {
    const c = cities[cursor++]
    const r = await check(c)
    results.push(r)
    if (VERBOSE || !r.ok) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}(${r.adcode}) ${r.ok ? r.bytes + ' B' : r.why}`)
    if (results.length % 50 === 0) console.log(`  进度 ${results.length}/${cities.length}`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

const bad = results.filter((r) => !r.ok)
const okBytes = results.filter((r) => r.ok).reduce((a, r) => a + r.bytes, 0)
console.log(`\n结果：正常 ${results.length - bad.length} / ${results.length}，异常 ${bad.length}，累计 ${(okBytes / 1024 ** 3).toFixed(2)} GB`)
if (bad.length) {
  console.log('异常清单：')
  for (const b of bad) console.log(`  ${b.name}(${b.adcode}) — ${b.why}`)
  process.exit(1)
}
