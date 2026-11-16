# 高德园区三维融合（2026-10-10）

园区层通过 AMap.GLCustomLayer 共享高德 WebGL1 上下文，使用独立 Three r142 渲染器；主 BIM 和运营场景仍使用项目当前 Three 版本。

之前屏幕点叠加的固定正交相机已移除。GL 图层每次绘制读取 customCoords.getCameraParams，同步相机位置、up、lookAt、fov、near/far。局部原点为设置中的 GCJ-02 经纬度，模型以米为单位，Y-up 转换为地图 Z-up。朝向、比例和离地偏移作用于整个园区根节点。

同一园区包含 Northbridge IFC 派生主楼、196×170m 地面、停车区、照明杆、冷却设备和管道、柴油机组、屋顶设备，复用 EngineeringSite 的测试模型。IFC 源屋顶/梁采用与 BIM 浏览器一致的测试标高校正。对象通过 BufferGeometry 和实例矩阵复制到独立渲染器，支持共享深度缓冲与周边地图楼块遮挡。园区 footprint 内的高德通用楼块隐藏，避免与替代模型相互穿插。

默认坐标是用户截图中标记的南京位置，用于演示模型落位，并非业主真实用地。园区内的设备也是自制测试资产。参数可在“坐标对齐设置”修改，保存到本机 localStorage（版本4）；高度为相对地图的偏移，不是测量海拔。

## 常州新南村外观更新

根据用户红框的“新南村 / 溪南村 / 北侧河道”线索，先用高德 JS PlaceSearch 找到罗溪镇溪南村参考点，再在地图中新南村空地选点，得到 GCJ-02 119.812300,31.892168。默认位置与全国地图数据中心标记同步迁移，localStorage升级为版本5。

主楼及屋顶调整为白色；增加白色竖向外墙细线、玻璃入口门厅和雨棚；外墙及屋顶应用世纪互联官网 LOGO（https://www.vnet.com/home/images/logo.png），本地路径 public/branding/vnet-logo.png。这是用户指定的外观效果设计，不代表真实世纪互联项目位置或建筑。

2026-10-10 构建通过，浏览器确认新南村空地、白色建筑、墙面/屋顶标识，旋转缩放后仍贴合地图，无控制台错误。实际截图 artifacts/amap-fusion/changzhou-vnet-white-campus.jpg。

验证：园区可见，45°/90°地图旋转与半级缩放同步；点击地图标记进入192柜BIM数据厅；园区返回后模型重新挂载。实际截图：artifacts/amap-fusion/campus-on-amap.jpg。最终外观仍以浏览器截图为准，单独构建通过不代表融合验收。
