# 中国离线底图包（China Offline Basemaps）

中国 **370 个行政区单元**的离线矢量瓦片包（Protomaps PMTiles，z0–15），供移动端离线地图使用。
每个城市一个 GitHub Release，索引在 [`tiles/cities-index.json`](tiles/cities-index.json)。

- 数据：© OpenStreetMap contributors，**ODbL 授权**（详见 [DATA-LICENSE.md](DATA-LICENSE.md)）
- 切包源：Protomaps 日构建 `20261029`（**日构建只保留约 5 天**，所以包必须长期留在这里）
- 规模：370 个单元，合计约 **11.6 GB**

## 覆盖范围

| 类别 | 数量 |
|---|---|
| 地级市 | 333 |
| 直辖市（北京/天津/上海/重庆，各为一份） | 4 |
| 特别行政区（香港/澳门） | 2 |
| 台湾 | 1 |
| 省直辖县级单位（如河南济源、湖北仙桃等） | 30 |

完整清单见 [`tiles/cities.json`](tiles/cities.json)（370 条），省级汇总见 [`tiles/provinces.json`](tiles/provinces.json)。

## 怎么下载

一个城市一个 Release：

```
tag:   city-<adcode>-<source>           例：city-370200-20261029
asset: <adcode>.pmtiles                 例：370200.pmtiles
直链:  https://github.com/DeveloperYe/china-offline-basemaps/releases/download/city-<adcode>-<source>/<adcode>.pmtiles
```

按 adcode 下载并校验（国内建议走加速节点）：

```powershell
$adcode = '310000'   # 上海
$url = "https://github.com/DeveloperYe/china-offline-basemaps/releases/download/city-$adcode-20261029/$adcode.pmtiles"
C:\Windows\System32\curl.exe -L --max-time 600 -o "$adcode.pmtiles" "https://v6.gh-proxy.org/$url"
(Get-FileHash "$adcode.pmtiles" -Algorithm SHA256).Hash   # 与索引里的 sha256 比对
```

## 索引字段（`tiles/cities-index.json`）

| 字段 | 说明 |
|---|---|
| `adcode` | 行政区划代码（6 位），同时是包文件名 |
| `name` / `province` / `provinceAdcode` | 城市名 / 所属省名 / 所属省 adcode |
| `kind` | `city` / `municipality` / `sar` / `province` |
| `bbox` | 行政区外接矩形 `[w, s, e, n]` |
| `bboxPadded` | 外扩 0.02° 后的 bbox（**切包用这个**，跑步常在边界活动） |
| `center` | 地图初始中心 `[lng, lat]` |
| `file` / `bytes` / `sha256` / `url` | 包文件名 / 字节数 / 摘要 / 下载直链 |
| `ready` | 是否已发布（当前 370/370） |

顶层另有 `source`、`count`、`ready`、`totalBytes`。

## 技术特性与取舍

- **按城市切，不按省切**：省级包会超 Release 单文件 2 GB 上限（内蒙古 z15 上界约 4.7 GB、
  新疆约 3.3 GB）；按城市每个 1–94 MB 天然合规，且单城失败不影响其余。
- **z0 瓦片就等于整个地球**：PMTiles 是整块粒度，低缩放瓦片天然横跨极远，所以缩小看是
  "全球粗略图"，放大出城则空白——这是瓦片坐标的必然结果，不是缺数据。
- **相邻城市有少量重叠**：各城市按自己的行政区外接矩形独立切包，互不影响。
- **三沙市**包 78 MB 但覆盖南海大片海域（150 万瓦片），实际跑动用不到，可按需不下载。

## 流水线

| workflow | 用途 |
|---|---|
| `build-city-tiles.yml` | 从 Protomaps 源按 bbox 切包并发布（**矩阵上限 256**，全量需用 `offset`/`limit` 分片） |
| `mirror-releases.yml` | 从另一个仓库镜像已切好的包（GitHub 没有跨仓库移动 Release 的 API，只能重发布） |

脚本：

```bash
node scripts/gen-city-list.mjs              # 重新生成 tiles/cities.json（数据源：阿里 DataV 行政区边界）
GITHUB_TOKEN=xxx node scripts/gen-city-index.mjs 20261029   # 重新汇总索引（含 bytes/sha256/url）
```

## 已知问题

- 切包源为 Protomaps 日构建，**只保留约 5 天**：过期后无法按同一天重切，需用新日期切等价包，
  届时标签里的 `source` 会变，索引需重新生成。

## 用法示例（uni-app / MapLibre）

```js
const idx = await fetch('https://raw.githubusercontent.com/DeveloperYe/china-offline-basemaps/main/tiles/cities-index.json').then(r => r.json())
const city = idx.cities.find(c => c.adcode === '370200')
// 下载 city.url 到本地 → 校验 city.sha256 → 交给 maplibre-gl + pmtiles 的 Protocol 建图
// 地图初始 center 用 city.center，bounds 用 city.bboxPadded
```
