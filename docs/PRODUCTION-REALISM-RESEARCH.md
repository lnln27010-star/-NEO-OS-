# DSX 生产级真实感调研与落地规范

日期：2026-09-25

这份文档把“像 NVIDIA Omniverse DSX”拆成可验收的资产、坐标、材质和仿真输入。它明确区分已经拥有的数据、公开可获得的数据，以及必须由真实项目提供的数据。

## 1. DSX 的真实感来源

DSX 的真实感不是来自更亮的灯光或更多几何，而是来自一条可追溯的资产链：

```text
厂商 CAD / 现场扫描
        ↓
CAD → OpenUSD
        ↓
Scene Optimizer（米制、Z-up、清理、减面、内外拆分）
        ↓
Asset Validator（拓扑、法线、层级、材质绑定）
        ↓
aif:core + aif:spec 元数据
        ↓
电力 / 液冷 / 风量连接点
        ↓
外观 payload → 剖切 → 内部 payload → 仿真时序
```

NVIDIA 官方 DSX 文档的两个示例资产是 NVIDIA DGX GB300 NVL72 机柜和 Vertiv XDU2300 CDU。GB300 的公开示例参数包含 72 GPU、136 kW TDP、240 kW 最大直流功率、116 kW 液冷和 19.3 kW 风冷；XDU2300 则包含冷却曲线、泵流量、管口、连接点和电气额定值。这里的关键不是照抄两个型号，而是照抄“几何、语义、连接点、仿真输入分离”的方法。

参考：

- [NVIDIA DSX SimReady Assets](https://docs.omniverse.nvidia.com/dsx/latest/simready-assets.html)
- [NVIDIA AIF Pipeline Samples](https://nvidia-omniverse.github.io/aif-pipeline-samples/)
- [AIF Pipeline Samples GitHub](https://github.com/NVIDIA-Omniverse/aif-pipeline-samples)
- [DSX Content Pack / NGC](https://catalog.ngc.nvidia.com/orgs/nvidia/teams/omniverse/resources/dsx_dataset)

NGC 内容包当前按 NVIDIA Sample Data License for Evaluation 提供，约 35 GB，不能直接当作本项目的商业生产资产再分发；它适合作为视觉、层级、材质和联调基准，正式项目仍应使用自有或已授权的 BIM/厂商资产。

## 2. 本项目必须接收的真实输入

### 2.1 场地与省区

最低真实输入：

- WGS84/EPSG:4326 场址点、红线、道路、围墙、建筑轮廓、地坪高程
- 1:2000 或更高精度地形/正射影像
- 现场测绘点云：E57、LAS/LAZ，或带坐标的摄影测量点云
- 建筑与机电 BIM：IFC4、RVT/RFA、DWG/DXF 或原生 CAD
- 供电、给排水、冷却水和通信管线的 GIS/BIM 图层

中国公开发布要把“工程真实”与“公开地图合规”分开：内部工程样机可以使用 WGS84、OSM/GeoFabrik 和开放边界数据；对外发布应以自然资源部门标准地图为依据并重新审核。江苏官方标准地图服务是最终制图依据，OSM/GeoFabrik 只作为内部道路和周边建筑补充。

推荐格式链：

```text
官方标准地图 / WGS84 GeoJSON
OSM PBF / GeoPackage
E57 / LAS / LAZ
IFC4 / RVT / DWG
        ↓
PDAL + mapshaper + IFC/BIM ETL
        ↓
3D Tiles（地理场景、点云、城市建筑）
OpenUSD（工程装配、设备和连接点）
glTF/GLB（浏览器预览缓存）
```

OGC 3D Tiles 的设计目标就是流式渲染摄影测量、3D 建筑、BIM/CAD、实例化对象和点云；它适合省区/城市/场地的大场景，不应把所有点云一次性塞进 React Three Fiber。

参考：

- [OGC 3D Tiles Standard](https://www.ogc.org/standard/3dtiles/)
- [PDAL 点云处理](https://pdal.io/en/latest/)
- [江苏省自然资源厅标准地图服务](https://zrzy.jiangsu.gov.cn/jsbzdt/index.html)
- [Geofabrik 江苏 OSM 下载](https://download.geofabrik.de/asia/china/jiangsu.html)
- [OpenStreetMap 许可](https://www.openstreetmap.org/copyright)

### 2.2 设备资产

真实设备不能以当前的 Box/Cylinder 资产作为最终模型。每个设备至少要提供：

```text
<model>.usd 或 <model>.glb
layers/<model>_Properties.usda
layers/<model>_ConnectionPoints.usd
payloads/external.usd
payloads/internal.usd
data/<model>.json
```

通用元数据采用 `aif:core`：制造商、型号、尺寸、重量、安装净距、服务净距、资产版本、单位、坐标原点、数据来源。设备专属字段采用 `aif:spec`：

- GB300/AI 机柜：GPU 数量、TDP、最大功率、液冷/风冷热分配、液流曲线、压降曲线、功率爬升/下降速率
- CDU：FWS/TCS 供回水、泵曲线、换热能力、管口尺寸、过滤器、阀门、额定电气
- CRAH：显热/总冷量、风量、风机功率、压降、盘管排数、管径、送回风参数
- UPS：额定功率、输入输出电压/频率/相数、THDi、功率因数、过载、效率、电池和旁路
- PDU/RPP/变压器：相别、额定电压、电流、断路器、保护曲线、母线连接点

已经放入项目的 NVIDIA AIF 参考结构：

- [Generic_CDU.usda](../public/data/aif-reference/Generic_CDU/Generic_CDU.usda)
- [Generic_CDU_Properties.usda](../public/data/aif-reference/Generic_CDU/layers/Generic_CDU_Properties.usda)
- [Generic_CDU_ConnectionPoints.usd](../public/data/aif-reference/Generic_CDU/layers/Generic_CDU_ConnectionPoints.usd)
- [AIF 参考资产说明](../public/data/aif-reference/README.md)

这套 USD 资产的外部 payload 默认加载，内部 payload 可按剖切/相机/仿真需要选择加载；这正是当前项目要替换“整块塑料设备”的目标行为。

## 3. 电、热、液冷数据链

OpenUSD 只保存静态工程语义和连接点，运行时数据另行注入。统一时序消息如下：

```json
{
  "timestamp": "2026-09-25T10:00:00+08:00",
  "assetId": "R-A04",
  "electrical": {
    "voltage": 400,
    "current": 184,
    "activePower": 84.0,
    "reactivePower": 18.2,
    "powerFactor": 0.977,
    "frequency": 50,
    "breakerState": "closed"
  },
  "thermal": {
    "inletTemp": 24.0,
    "outletTemp": 31.5,
    "flowRate": 91,
    "pressure": 160,
    "coolingCapacity": 116,
    "heatCaptureRatio": 0.87
  },
  "airflow": {
    "supplyTemp": 18.0,
    "returnTemp": 29.0,
    "cfm": 38000,
    "fanSpeed": 0.72
  }
}
```

可落地的求解器组合：

- [OpenDSS / EPRI](https://opendss.epri.com/)：潮流、短路、谐波、动态和准静态时间序列
- [pandapower](https://pandapower.readthedocs.io/en/latest/)：Python 电网计算和网络模型
- [OpenFOAM](https://www.openfoam.com/)：液冷/风冷 CFD 与共轭传热
- [Modelica Buildings](https://build.openmodelica.org/Documentation/Buildings.html)：建筑、冷站和控制系统
- FMI 3.0 FMU：把建筑控制、泵/阀/换热器模型封装给运行时

前端层不再根据 `instances × load` 伪造“峰值温度”。它只能显示求解器或现场时序返回的结果，并保留来源、时间戳、模型版本和可信度。

## 4. 真实样式验收标准

省区：

- 真实地理坐标和投影，不用手工画中国形状
- 行政边界、地形、道路、建筑和点云分层加载
- 点击站点后相机沿真实坐标下钻到场址

园区：

- 外观来自 BIM/点云/摄影测量，不使用规则盒子代替建筑
- 屋面设备、风冷/液冷设备、变电站、围墙、道路、停车和门岗有真实尺寸和材质
- 远景加载外部 payload，近景再加载内部 payload
- 工程线路默认隐藏，只有选择供电/冷却/通信专题时才显示

机房：

- 机柜外观、门板孔阵、母线、桥架、CDU、CRAH、PDU、RPP 来自同一资产版本
- 内部剖切显示真实管口、阀门、电缆和风道，不用发光色块代替设备
- 热、电结果以独立分析层叠加，不改变原始材质

数据可信度：

- 每个模型显示来源、版本、单位、坐标系、更新时间
- 每个仿真结果显示求解器、网格/模型版本和时间戳
- 缺少真实数据时必须显示“待导入真实资产/数据”，不能继续伪装成已建项目

## 5. 当前项目与生产目标的差距

当前代码已经具备层级导航、真实地球纹理、江苏离线 GeoJSON、机房交互和仿真面板，但园区仍是参数化示例，设备仍主要是程序化几何，仿真仍是交互演示。下一阶段应该优先接入一套真实场址 BIM/点云和一套真实设备资产，而不是继续给盒子加颜色。

首个可验收切片建议：南京真实场址一栋数据楼 + 一套 GB300/XDU2300 或同等级设备资产 + 一条供电和一条液冷回路 + 一份 OpenDSS/CFD 时序。完成这一切片后再扩展到全省多站点。
