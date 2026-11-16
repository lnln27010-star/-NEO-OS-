# 全球能源网 3D 数据来源

地球地形轮廓来自 Natural Earth 公共领域数据。`earth-land.geojson` 使用 1:50m 陆地面，`earth-borders.geojson` 使用 1:110m 国界线。这些全球概览轮廓用于地球视觉呈现，省级电价仍绑定项目原有 `china-provinces.geojson`。

- https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_land.geojson
- https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_boundary_lines_land.geojson
- https://www.naturalearthdata.com/about/terms-of-use/

输电线路、近景变电站与发电厂继续读取 OpenInfraMap 的 OpenStreetMap 矢量瓦片（ODbL）。频率未填报时采用普通交流线路配色；仅显式频率为 0 的记录标记为直流。

- https://openinframap.org/
- https://www.openstreetmap.org/copyright

远景电厂点位 `energy-plants.geojson` 来自 WRI Global Power Plant Database v1.3（2021）历史设施档案，CC BY 4.0，包含 34,936 个经纬度与容量有效的记录。它不是实时监测，也不等于今日在运清单。UI 图例和资产详情明确显示档案版本。缩放至 6 级后切换到 OSM 近景设施点位，避免重复点。

- https://github.com/wri/global-power-plant-database
- https://raw.githubusercontent.com/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv
- https://creativecommons.org/licenses/by/4.0/

再生成方式：下载上述 CSV 到本地，然后运行 `node scripts/build-energy-plant-snapshot.mjs <CSV路径>`。转换不创建合成点位。

容量柱由设施记录中的 MW 装机容量推导。柱高为开方映射并限幅，用于比较和可读性，不代表建筑物高度或实时出力。远景最多展示 400 根容量柱，区域视图最多 1,200 根，按已加载记录容量排序；点位层继续展示其余设施。地球旋转时裁剪背面柱体。

代理购电、峰平谷价格、现货价格、日期聚合与 24 时曲线继续使用项目原有 JSON 数据。没有另行制造电价或实时功率数据。
