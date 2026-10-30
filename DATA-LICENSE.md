# 数据许可与署名

本仓库的 `.pmtiles` 瓦片包是由 [Protomaps](https://protomaps.com/) 全球日构建档案
按行政区外接矩形切出的，属于 **OpenStreetMap 派生数据**。

## 必须遵守的许可

| 项 | 内容 |
|---|---|
| 数据来源 | OpenStreetMap contributors |
| 许可 | **ODbL 1.0**（Open Database License）— https://opendatacommons.org/licenses/odbl/1-0/ |
| 瓦片格式/工具 | PMTiles（BSD-3-Clause，Protomaps）与 go-pmtiles |
| 必须署名 | 任何展示这些瓦片的界面都必须显著标注 **© OpenStreetMap contributors** |

## 使用要求（摘录，非法律意见）

1. **署名**：地图上需常显 `© OpenStreetMap` 或 `© OpenStreetMap contributors`，
   链接指向 https://www.openstreetmap.org/copyright
2. **相同方式共享**：若对外分发基于本数据的衍生数据库，需以 ODbL 兼容方式共享
3. **保留开放**：不得对衍生数据库施加额外技术限制

## 本仓库不做的事

- 不直接分发 `tile.openstreetmap.org` 的栅格瓦片（OSMF 的 Tile Usage Policy 明确禁止离线与批量下载）
- 不包含任何来源不明或授权不清的数据

## 生成方式

`build-city-tiles.yml` 通过 `pmtiles extract` 从 `https://build.protomaps.com/<date>.pmtiles`
按 bbox 切出子集，命令与参数在 workflow 中可见，可复现。
