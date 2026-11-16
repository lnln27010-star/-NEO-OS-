# 园区 BIM 查看器交付说明 · 2026.10

当前园区入口使用 `src/scene/BimCampusViewport.tsx` 中的查看器。它把可选取的 IFC 派生建筑、合成场地设备与四个相机视点放在同一画布中，用于测试建筑检查与模型预览。它不对应真实业主项目，也不代表 NVIDIA DSX 官方产品或完整生产部署。

## 入口与交互

`src/scene/index.ts` 将 `CampusViewport` 导出指向新的 BIM 查看器。`src/App.tsx` 仅在园区层启用 `is-bim-workspace` 样式；省域、全国和机房编辑器仍有各自的工作区。640–1023px 屏幕提供紧凑桌面预览，宽度不足 640px 时显示桌面使用提示；完整编辑仍建议使用至少 1024px 的屏幕。

- Northbridge 测试场景提供园区鸟瞰、建筑近景、BIM 剖切和机房通道四个相机预设。拖动旋转，滚轮缩放；预设切换直接更新相机位置、目标点和视角。
- 测试场景的配置面板可切换屋面、钢结构、IFC 机电构件和合成设备阵列的可见性。BIM 剖切预设关闭屋面，并隐藏测试模型中指定一侧外墙；它没有任意剖切平面工具。
- 点击建筑构件会高亮并显示类型、Express ID 和源 IFC GlobalId。构件目录另提供原生下拉框选择，显示各 IFC 类型数量。
- 左侧工具提供配置面板开关、构件目录开关、恢复总览和进入现有机房编辑器。配置与目录都可关闭。
- 本地模型入口接受自包含 `.glb` 文件，先检查扩展名和 GLB 文件头，再使用浏览器对象 URL 加载。IFC 文件需要先通过离线脚本转换。
- 导入 GLB 时按 `Box3` 包围盒水平居中、将底部放在地面，保留原始比例。相机根据包围盒尺寸、当前横纵视角计算取景距离，并调整近、远裁剪面；底部“适配导入模型”按钮可重新取景。该行为是几何包围盒适配，未验证所有异常尺度或复杂 GLB 的显示结果。
- 导入模式隐藏测试场景的四个预设、场地/数据厅标签和图层开关，并禁用 IFC 构件目录。模型不套用 Northbridge 的标高校正与合成设备阵列。视口标题、顶部面包屑和底部状态栏使用本地文件名，命令栏切换为本地 GLB 与自动适配说明。
- 若导入模型没有 IFC 元数据，面板明确显示未提供 IFC GlobalId。分配给网格的本地序号不能充当源 IFC 身份。恢复测试场景后重新使用 Northbridge 模型。
- “恢复测试场景”清除测试 GLB 加载缓存，重新挂载模型加载边界并重新请求构件目录，同时清除本地模型身份与选中状态，回到测试总览。一次目录读取失败不会阻止后续重试。

本地文件通过浏览器预览，当前实现没有把文件上传到业务服务器的流程。GLB 格式检查只用于加载入口，不构成完整格式校验、来源认证或工程审查。

## 模型来源与资产边界

建筑来源为 MassingCloud/masslibrary 的 [data-center 合成样本](https://github.com/MassingCloud/masslibrary/tree/main/samples/data-center)，随附样本许可为 [CC0 1.0](https://raw.githubusercontent.com/MassingCloud/masslibrary/main/LICENSE-SAMPLES)。仓库内来源记录见 `public/models/northbridge/README.md`。Northbridge Data Hall 是合成测试数据，不是现场测绘、业主竣工模型或已建中国园区。

| 资产 | 当前用途与边界 |
| --- | --- |
| `public/data/northbridge_data_hall/geometry/northbridge_data_hall.ifc` | 原始 IFC 输入，用于离线转换与源哈希核对 |
| `public/models/northbridge/building.glb` | 使用 web-ifc 0.0.78 三角化得到的建筑几何，保留源构件元数据 |
| `public/models/northbridge/elements.json` | 源文件 SHA-256、单位、轴向、构件目录、原始包围盒与转换统计 |
| `src/scene/EngineeringSite.tsx` | 本地编写的机柜、冷却机组、发电机、管路、车辆与场地细节 |
| `public/textures/industrial-workshop.hdr` | 场景环境光资源；来源说明见 `public/textures/README.md` |

合成数据厅生成 **8 排 × 24 柜，共 192 个机柜**，以实例化几何组织柜体、面板、端口、导轨、指示灯和上方管线。柜号为 R-A01 至 R-H24。这些机柜及场地设备不属于 IFC 导出的 854 个构件，也不是厂商 CAD、NVIDIA 资产或与遥测绑定的实际设备。合成几何没有等同于源 IFC GlobalId 的身份保证。

## 转换结果与可追溯性

当前 `elements.json` 记录单位为米、Y 轴向上，共 **854 个导出构件及 854 个唯一 GlobalId**。有 **8 个几何片段**没有可渲染的顶点或三角形，转换脚本跳过了这些片段；此数字不代表 8 个完整构件丢失。

每个导出 GLB 节点的 `extras` 与目录条目保存 `expressId`、`globalId`、`name`、`type` 和原始包围盒。脚本应用 IFC 放置变换后输出坐标，关闭自动移到原点的选项，便于回溯源数据。查看器再对测试建筑应用 X = −48m、Z = +30.5m 的场景居中位移。

当前源文件 SHA-256 为 `d044d32503892f287c3370465e1e882ec5537ac1a60dafd13bc55de83f49e905`。当前 GLB 为 2,836,844 字节。更换输入或转换依赖后应以重新生成的报告为准。

配置面板的 96 × 61 × 8.5m 表示测试建筑包络。原始目录的全部构件范围还包括基础等外伸部分，不能把该面板值当作全部几何的精确包围盒。

## 测试标高校正

源样本中屋面、钢梁及部分机电构件位于地面附近。为使测试数据厅可阅读，`BimCampusViewport.tsx` 的 `testElevation()` 仅在查看器实例矩阵上增加以下 Y 位移。

| IFC 类型或条件 | 显示位移 |
| --- | ---: |
| `IfcRoof` | +8.5m |
| `IfcBeam` | +8.05m |
| `IfcDuctSegment` | +6.35m |
| `IfcAirTerminal`、`IfcSensor`、`IfcFireSuppressionTerminal` | +6.1m |
| `IfcCableCarrierSegment` | +5.25m |
| `IfcPipeSegment`，名称为 `Pipe` 且原始 `minY < 0` | +5.6m |

查看器同时隐藏 `IfcCovering` 和 `IfcStructuralSurfaceMember`，以避开样本中 2.7m 高覆盖层与零厚度结构表面对室内预览的遮挡。BIM 剖切另外隐藏满足 `bounds.max[2] > −0.2` 的外墙。以上都是对已知合成样本的显示规则，不能视为对任意 IFC 项目的通用修复。

**这些位移属于测试展示校正，未经测量或工程师校审。** 原始 IFC、导出的 GLB、GlobalId 和目录中的原始包围盒不被修改。目录包围盒因此不包含查看器显示位移；使用者不能直接从屏幕位置推定源模型工程标高。

屋面另外使用仅影响显示的处理。IFC 屋面材质启用多边形偏移并关闭接收阴影，以减少重叠和自阴影条纹；合成屋顶细立缝只在“建筑近景”预设且屋面可见时显示，并且不投射或接收阴影。它不是随相机距离连续变化的 LOD，也不改变源屋面几何或工程属性。

## 重建与校验

在项目根目录、安装锁定依赖后运行以下命令。重建会覆盖默认派生目录中的 `building.glb` 和 `elements.json`，保留源 IFC。

```powershell
npm ci
npm run assets:ifc
node scripts/test-ifc-model.mjs
npm run build
```

`npm run assets:ifc` 调用 `scripts/convert-ifc.mjs`。需要为其他源文件生成单独派生目录时，可传入源路径和目标目录，避免替换 Northbridge 示例。

```powershell
node scripts/convert-ifc.mjs path/to/source.ifc public/models/another-model
```

默认校验脚本 `node scripts/test-ifc-model.mjs` 固定检查 Northbridge 派生资产。它核对 GLB 标识、版本与长度，核对节点数量与 GlobalId 唯一性，核对源文件 SHA-256，检查坐标包围盒为有限值、索引在顶点范围内，并确认合成标记、米制单位与关键 IFC 类型存在。它会报告未输出的几何片段数量。

本次文档核对时该脚本通过，输出 854 个唯一 GlobalId、有效几何与索引、匹配的源 SHA-256 和 2,836,844 字节 GLB。该结果证明派生资产满足脚本覆盖的完整性条件，不证明 BIM 语义全部保留、实际标高正确、屏幕显示无缺陷或工程计算成立。

本轮交互复核另验证了目录请求失败后的恢复路径。临时移走 `elements.json` 触发读取失败，再恢复文件并点击“恢复测试场景”，界面重新取得目录并显示 854 个构件。该结果覆盖本地资源恢复后的重试，不代表所有网络故障或损坏 GLB 都已验证。

## 当前能力范围

该园区查看器交付建筑与场地几何预览、视点切换、预定义图层控制、IFC 构件身份检查和本地 GLB 加载。现有机房编辑器通过导航入口单独打开，其设备编辑与计算结果没有映射或集成到本查看器的 854 个 IFC 构件或 192 个合成机柜。

当前查看器没有接入 OpenUSD/Omniverse、DSX 生产工具链、现场遥测、Redfish、CFD、电气求解器、碰撞审查或基于本建筑的容量计算。视觉材质、阴影与设备指示灯不能作为真实状态或仿真结果。生产使用仍需要业主模型、许可与工程语义映射，以及各专业独立验证。

视觉增量规则见 `DESIGN.md` 的“Campus BIM Viewer Increment · 2026.10”；该节仅适用于园区 BIM 表面，不替换既有机房编辑器的设计令牌。
