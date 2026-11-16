# 银河背景素材

在 3D 深色能源网的“图层与图例”中，开启宇宙背景后可以选择“银河 · 蓝银星云”或“淡星空 · 深空”。默认使用银河，选择在本机保存。背景仅作为装饰，不表示天文观测数据。

最终项目素材：`public/textures/energy-galaxy-v1.webp`。原始生成素材保留在 `public/textures/energy-galaxy-v1.png`，使用无损 WebP 编码。旧淡星空素材保持可用。背景亮度在渲染中控制，切换时复用地图与已缓存的图片，不重建地球或电网。

生成方式：内置 image_gen 工具，未使用 API/CLI 回退。

最终提示词如下。

> Use case: stylized-concept. Asset type: premium photorealistic Milky Way background texture for a live interactive 3D Earth energy atlas, wide 2048x1152 landscape. Generate only deep space, no Earth and no other planets, no interface, no text, no watermark. A beautiful recognizable Milky Way ribbon of intricate fine stars and smoky silver-blue nebula dust gracefully curves from the lower-left edge up across the upper-left quarter toward the upper-right edge. Keep the central region predominantly dark because a large separate interactive globe will sit in front of it. The luminous galactic structure must be visible around the left and upper outer edges of the globe, while the upper-left text area and right-side controls should remain readable over it. Color palette near-black, midnight navy, faint cyan and silvery blue, very small traces of muted lavender. Realistic astrophotographic depth and detailed dark dust lanes, tiny stars of differing sizes, restrained natural bloom. Sophisticated, cinematic, calm and dimensional; appreciably more visible than a sparse starfield but never a bright colorful space wallpaper. No large central white glare, no lens flares, no orange clouds, no saturated purple, no illustrated orbit rings. This is decorative artwork, not astronomical data.
