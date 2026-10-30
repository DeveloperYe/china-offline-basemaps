#!/usr/bin/env node
/**
 * 生成成品索引 tiles/cities-index.json
 *
 * 从本仓库的 Releases 汇总每个城市包的 bytes / sha256 / 下载直链（资产自带 digest，
 * 不需要下载回来算哈希），产出 App 可直接消费的索引。
 *
 * 用法：
 *   node scripts/gen-city-index.mjs                   # 默认 20261029
 *   node scripts/gen-city-index.mjs 20261029          # 指定切包源日期
 *   GITHUB_TOKEN=xxx node scripts/gen-city-index.mjs   # 建议带 token（避免限速）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = process.argv[2] || '20261029'
const REPO = process.env.REPO || 'DeveloperYe/china-offline-basemaps'
const TOKEN = process.env.GITHUB_TOKEN

const citiesJson = JSON.parse(readFileSync(resolve(ROOT, 'tiles/cities.json'), 'utf8'))
const { cities } = citiesJson

const api = async (path) => {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(`https://api.github.com${path}`, {
        headers: {
          'User-Agent': 'china-offline-basemaps',
          Accept: 'application/vnd.github+json',
          ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
        },
      })
      if (r.status === 404) return null
      if (r.ok) return await r.json()
      if (r.status === 403 || r.status === 429) {
        console.log(`  ! 限速 ${r.status}，等 20s`)
        await new Promise((s) => setTimeout(s, 20000))
        continue
      }
      console.log(`  ! ${r.status} ${path}`)
    } catch (e) {
      console.log(`  ! ${e.message}`)
    }
    await new Promise((s) => setTimeout(s, 1500))
  }
  return null
}

const byAdcode = new Map()
for (let page = 1; page <= 60; page++) {
  const list = await api(`/repos/${REPO}/releases?per_page=100&page=${page}`)
  if (!list || !list.length) break
  for (const rel of list) {
    const m = String(rel.tag_name).match(/^city-(\d{6})-(.+)$/)
    if (!m || m[2] !== SOURCE) continue
    const a = (rel.assets || [])[0]
    if (!a) continue
    byAdcode.set(m[1], {
      bytes: a.size,
      sha256: String(a.digest || '').replace(/^sha256:/, ''),
      url: a.browser_download_url,
      file: a.name,
      tag: rel.tag_name,
      createdAt: rel.created_at,
    })
  }
  if (list.length < 100) break
}
console.log(`已发布的城市包：${byAdcode.size} / 目标 ${cities.length}`)

const out = {
  generatedAt: new Date().toISOString(),
  source: SOURCE,
  repo: REPO,
  count: cities.length,
  ready: 0,
  totalBytes: 0,
  cities: cities.map((c) => {
    const p = byAdcode.get(c.adcode)
    return {
      adcode: c.adcode,
      name: c.name,
      province: c.province,
      provinceAdcode: c.provinceAdcode,
      kind: c.kind,
      bbox: c.bbox,
      bboxPadded: c.bboxPadded,
      center: c.center,
      tilesZ15: c.tilesZ15,
      file: p ? p.file : `${c.adcode}.pmtiles`,
      bytes: p ? p.bytes : 0,
      sha256: p ? p.sha256 : '',
      url: p ? p.url : '',
      ready: !!p,
    }
  }),
}
out.ready = out.cities.filter((c) => c.ready).length
out.totalBytes = out.cities.reduce((a, c) => a + c.bytes, 0)

writeFileSync(resolve(ROOT, 'tiles/cities-index.json'), JSON.stringify(out, null, 1))
console.log(`就绪 ${out.ready}/${out.count}，合计 ${(out.totalBytes / 1024 ** 3).toFixed(2)} GB`)
const missing = out.cities.filter((c) => !c.ready)
if (missing.length) {
  console.log(`未就绪 ${missing.length} 个：` + missing.slice(0, 20).map((c) => `${c.name}(${c.adcode})`).join(' '))
}
