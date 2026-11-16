# 真实项目数据接入清单

要把当前原型替换成可审计的生产级场景，请按下面结构提供一个站点包。没有这些数据时，系统只能显示“合成示例”，不能把它包装成真实园区。

## 目录结构

```text
site-package/
  site.json                    # 坐标系、单位、站点版本、来源
  gis/
    boundary.geojson           # 用地红线/WGS84或明确EPSG
    roads.geojson
    utilities.geojson          # 电、冷却水、通信、排水
    terrain.tif                # DEM/高程
    orthophoto.tif             # 正射影像（可选）
  reality-capture/
    survey.e57                 # 地面/移动LiDAR（可选）
    aerial.laz                 # 倾斜摄影/无人机点云（可选）
    tileset.json               # 转换后的3D Tiles入口（可选）
  bim/
    campus.ifc                 # IFC4优先
    buildings.ifc
    mep.ifc
    source-revit/              # 如果授权允许，保留RVT/RFA
  assets/
    <vendor>_<model>/
      <model>.usd              # OpenUSD主接口
      layers/Properties.usda
      layers/ConnectionPoints.usd
      payloads/external.usd
      payloads/internal.usd
      data/<model>.json
  simulation/
    electrical/                # OpenDSS/pandapower/测量时序
    thermal/                   # OpenFOAM/Modelica/CFD场
    telemetry/                 # CSV/Parquet/MQTT/OPC UA导出
  licenses/
    source-register.csv
```

## 必填站点字段

```json
{
  "siteId": "CN-JS-NJ-001",
  "name": "真实站点名称",
  "coordinateReferenceSystem": "EPSG:4490",
  "units": "m",
  "upAxis": "Z",
  "origin": {"longitude": 118.767413, "latitude": 32.041544, "elevation": 0},
  "assetVersion": "2026.09.25",
  "sourceRegister": ["owner-bim-2026-09", "survey-e57-2026-08"]
}
```

## 设备验收

一个设备只有同时具备外观 payload、内部 payload、AIF 元数据和连接点，才允许在“生产级”筛选器中显示。至少检查：

- 原点在安装/落地点，单位为米，Z-up
- 外部几何不包含不可见内部重复网格
- 内部几何可按需加载，不能把剖切做成材质透明度假象
- 连接点有方向、命名和领域：`electrical`、`liq_supply`、`liq_return`、`fws`、`tcs`、`airvent`
- 资产版本、制造商、型号和数据来源可追溯
- 通过 NVIDIA Asset Validator 或等价的拓扑/法线/层级检查

## 仿真验收

仿真结果必须带：求解器、模型版本、网格/时间步、输入文件哈希、时间戳和可信度。前端只负责绑定连接点、播放时序和显示结果，不从柜子数量推导“真实温度”。

推荐输入：

- 电：OpenDSS/pandapower 网络、变压器/UPS/PDU 参数、回路拓扑、保护与测量时序
- 液冷：CDU 泵曲线、换热器曲线、管径/长度/阀门、供回水温度和流量
- 风冷：CRAH 风量、送回风温度、静压、风机转速、过滤器压降
- IT：机柜功率曲线、GPU 负载/功率爬升、液冷捕热比例

参考标准和工具：

- [NVIDIA AIF Pipeline Samples](https://github.com/NVIDIA-Omniverse/aif-pipeline-samples)
- [IfcOpenShell](https://github.com/IfcOpenShell/IfcOpenShell)
- [OGC 3D Tiles](https://www.ogc.org/standard/3dtiles/)
- [OpenDSS](https://opendss.epri.com/)
- [OpenFOAM](https://openfoam.org/)
- [Modelica Buildings](https://build.openmodelica.org/Documentation/Buildings.html)
- [FMI Standard](https://fmi-standard.org/)
