#!/usr/bin/env node
/**
 * 生成中国地级市清单 tiles/cities.json + tiles/provinces.json
 *
 * 数据源：阿里 DataV 行政区边界（area_v3），逐省取 {adcode}_full.json 求外接矩形。
 * 清洗规则：
 *   - 直辖市/港澳台整块作为一个单元，不展开下辖区县（否则会冒出"黄浦区""渝中区"）；
 *   - 丢弃无名要素（海域/九段线残片，曾出现 267 万瓦片的伪条目）；
 *   - 丢弃 adcode 不是 6 位数字的伪要素（如 100000_JD）。
 *
 * 用法：node scripts/gen-city-list.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'tiles')
mkdirSync(OUT_DIR, { recursive: true })

const PAD = 0.02 // bbox 四周外扩（跑步常在行政区边界活动）
const MUNICIPAL = new Set(['110000', '120000', '310000', '500000'])
const SAR = new Set(['810000', '820000'])

const get = async (url, tries = 3) => {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'china-offline-basemaps' } })
      if (r.ok) return await r.json()
      console.log(`  ! ${r.status} ${url}`)
    } catch (e) {
      console.log(`  ! ${e.message} ${url}`)
    }
    await new Promise((s) => setTimeout(s, 800))
  }
  return null
}

const bboxOf = (feature) => {
  let w = 180, s = 90, e = -180, n = -90
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      const [lng, lat] = c
      if (lng < w) w = lng
      if (lng > e) e = lng
      if (lat < s) s = lat
      if (lat > n) n = lat
      return
    }
    for (const x of c) walk(x)
  }
  const geom = feature && (feature.geometry || feature)
  if (geom && geom.coordinates) walk(geom.coordinates)
  if (w > e || s > n) return null
  return [w, s, e, n]
}

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z)
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}
const tileCount = (b, z) =>
  (lon2x(b[2], z) - lon2x(b[0], z) + 1) * (lat2y(b[1], z) - lat2y(b[3], z) + 1)

console.log('取全国省级列表…')
const country = await get('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json')
if (!country) throw new Error('取不到全国省级列表（geo.datav.aliyun.com 不可达？）')

const provinces = country.features
  .map((f) => ({ adcode: String(f.properties.adcode), name: String(f.properties.name || '').trim(), f }))
  .filter((p) => /^\d{6}$/.test(p.adcode) && p.name)
console.log(`  省级/直辖市 ${provinces.length} 个`)

const cities = []
const provincesOut = []

for (const p of provinces) {
  const pb = bboxOf(p.f)
  provincesOut.push({ adcode: p.adcode, name: p.name, bbox: pb, tilesZ15: pb ? tileCount(pb, 15) : 0 })

  const full = await get(`https://geo.datav.aliyun.com/areas_v3/bound/${p.adcode}_full.json`)
  const asWhole = MUNICIPAL.has(p.adcode) || SAR.has(p.adcode) || p.adcode === '710000'

  if (asWhole || !full || !full.features || !full.features.length) {
    if (pb) {
      cities.push({
        adcode: p.adcode,
        name: p.name,
        province: p.name,
        provinceAdcode: p.adcode,
        kind: MUNICIPAL.has(p.adcode) ? 'municipality' : SAR.has(p.adcode) ? 'sar' : 'province',
        bbox: pb.map((v) => Math.round(v * 10000) / 10000),
      })
    }
    console.log(`  ${p.name}: 整块一份`)
    continue
  }

  let added = 0
  for (const f of full.features) {
    const name = String(f.properties.name || '').trim()
    const adcode = String(f.properties.adcode)
    if (!name) continue
    if (/九段线|南海诸岛$/.test(name)) continue
    if (!/^\d{6}$/.test(adcode)) continue
    const b = bboxOf(f)
    if (!b) continue
    cities.push({
      adcode,
      name,
      province: p.name,
      provinceAdcode: p.adcode,
      kind: 'city',
      bbox: b.map((v) => Math.round(v * 10000) / 10000),
    })
    added++
  }
  console.log(`  ${p.name}: ${added} 项`)
}

for (const c of cities) {
  const [w, s, e, n] = c.bbox
  c.bboxPadded = [
    Math.max(-180, +(w - PAD).toFixed(4)),
    Math.max(-90, +(s - PAD).toFixed(4)),
    Math.min(180, +(e + PAD).toFixed(4)),
    Math.min(90, +(n + PAD).toFixed(4)),
  ]
  c.center = [+((w + e) / 2).toFixed(4), +((s + n) / 2).toFixed(4)]
  c.tilesZ15 = tileCount(c.bboxPadded, 15)
}

writeFileSync(
  resolve(OUT_DIR, 'cities.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), count: cities.length, cities }, null, 1)
)
writeFileSync(
  resolve(OUT_DIR, 'provinces.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), count: provincesOut.length, provinces: provincesOut }, null, 1)
)

console.log(`\n单元合计 ${cities.length} 个，z15 瓦片总计 ${cities.reduce((a, c) => a + c.tilesZ15, 0).toLocaleString()}`)
