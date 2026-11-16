# 能源地图与园区统一外观

顶部“深色 / 浅色”控制能源地图与园区的共同主题，默认深色并在本机保存偏好。2D / 3D 是独立的投影选择，切换主题不重置电价、图层、相机中心或仿真工况。

全球能源网的两种投影均包含高德道路底图。“高德底图”开关可独立控制显示。深色版本只重绘高德道路瓦片的颜色，保留电网、设施、热区和选择高亮独立渲染；不会对整个视口套颜色滤镜。原有 GCJ-02 / WGS-84 接入边界说明仍然适用。

3D 深色模式在球面之下渲染低亮度宇宙背景。它是装饰素材，默认开启，可在“图层与图例”中关闭。背景只占地图之外的天空区域，不覆盖地表设施。

园区新增“地理园区 / 三维仿真”入口。地理园区继续使用高德 JS API 和既有坐标对齐参数。三维仿真沿用原来的 IFC 建筑、机房、设备选择、剖切、GLB 导入和运营工况。场景增加银灰金属材质、地面纹理、冷色主光与暖色补光，以及建筑轮廓与路径灯。照明为视觉表现，不作为照度计算或现场实况。

## 星空素材

项目文件：`public/textures/energy-space-v1.png`。

使用内置 image_gen 工具生成，未使用 API/CLI 回退。原图保留在 `C:/Users/EDY/.codex/generated_images/01a12b61-5c21-7103-ba28-b714b77649e0/exec-cc3e0c5c-af6c-4c84-93af-d1f3575a7dbf.png`。

最终提示词如下。

> Use case: stylized-concept. Asset type: subtle wide background texture for an interactive black 3D Earth energy atlas, 2048x1152 landscape. Generate ONLY the deep space backdrop, with no Earth, no planets, no UI, no text, no watermark. Very dark near-black photographic space, sparse tiny natural stars, a very faint smoky charcoal-blue Milky Way dust filament near the upper left fading into black across the frame. Restrained, realistic, sophisticated, quiet, low contrast, almost 90 percent black negative space. Stars are small white and a few icy blue points, no large flare, no saturated purple or colorful clouds. The foreground interactive Earth and colored infrastructure must remain the visual focus; this is a decorative background, not astronomical data.

## 验证

- `npm run build`：TypeScript 与生产构建。
- `node scripts/test-energy-globe.mjs`：深浅主题、投影、高德底图和星空开关，以及电价边界与容量柱。
- `node scripts/test-operations.mjs`：192 柜运营模型、故障时间、状态、容量与暂停/回放。
- 浏览器实测：深浅 2D、3D 星空与底图、园区入口、BIM 鸟瞰/近景、主题切换、价格详情。
