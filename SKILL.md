---
name: bio-growth-animation
description: 制作黑底科学档案风的生物生长动画，包含原创阶段素材、连续形变、解剖标注与 MP4 导出。适用于“换一种生物做类似海马生长动画”、标本演化动效或生长序列；明显变态发育须按形态连续的阶段分段设计。
---

# 生物生长动画

将生物阶段图制作成持续生长的科学档案短片。复用的是**连续形变与界面系统**；新生物的图像、阶段名称、解剖控制点和引线位置必须重新设计，不能只改海马标题。

默认：10秒、3:4竖版900×1200、60fps、黑底、无配音、概念数据。用户给出其他时长、视觉参考或交付形式时按其要求调整。内置HUD模板支持3:4及同比例分辨率，支持2–8阶段；其他纵横比需要实际修改布局，不能直接拉伸画面。

## 工作流

1. **确定生长序列。** 使用请求里已有的生物和视觉方向。阶段需有可对应的姿态；普通体型增长可直接连续形变，蛙/蝶等长出或失去肢体的变态发育先读[素材与形态指导](references/assets-and-anatomy.md)，按拓扑连续的区间分段。概念图不冒充实测发育数据；知识讲解中的阶段和事实要先核实。
2. **制作并检查素材。** 新素材使用可用的内置 imagegen，背景设为透明；完整提示词与背景清理策略见[素材与形态指导](references/assets-and-anatomy.md)。采用同一镜头、朝向与光照。先看真实输出，再读取实际尺寸、确定格子边界；灰底、雾状矩形和相邻格漏入都应在动画前处理。不要默认为提示词里的尺寸已实现。
3. **填写配置。** 读[配置说明](references/config.md)，从 `assets/examples/seahorse.json` 复制结构，但为新生物重新标定语义控制点。设置标题、阶段、尺寸锚点、两组指标、标注与配色。图集路径相对配置文件；所有控制点使用单格原始像素。关键姿态要有连续的头/躯干/附肢对应关系。
4. **生成项目。** 以当前技能目录作为 `BIO_SKILL_DIR`，在工作目录调用：

   ```sh
   python3 "$BIO_SKILL_DIR/scripts/create_project.py" --config work/specimen/config.json --validate-only
   python3 "$BIO_SKILL_DIR/scripts/create_project.py" --config work/specimen/config.json --out work/specimen/project
   ```

   输出目录必须不存在或为空，脚本不会覆盖已有项目。它复制本地GSAP、字体、形变渲染器，内嵌配置并生成HyperFrames项目；现有素材的渲染不调用图像API。项目使用Python3生成，视频验证/导出需要Node.js 22+、FFmpeg和可用的Chrome/WebGL。HyperFrames CLI固定在已验证版本，首次运行可能需要下载依赖。
5. **看过渡，不能只看阶段端点。** 在生成项目中运行 `npm run check -- --snapshots`，查看首个可见帧、**每两个姿态之间的中间帧**、成熟体与最终保持帧。需要定点截图时运行 `npx hyperframes snapshot --at <逗号分隔的时间>`。复查第一张截图，防止异步初始化造成首帧未绑定时间轴。确认没有网格翻折、眼睛重影、尾圈破洞、图集裁断、标题遮挡或引线脱离身体。
6. **完成导出。** 用户要成片时按已授权范围导出，避免重复询问已给出的制作要求：

   ```sh
   npm run render -- --quality delivery --output renders/growth.mp4
   ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,duration,nb_frames -of json renders/growth.mp4
   ```

   查看导出视频的过渡中间帧。交付MP4、配置/项目源文件和素材提示词；用户可见文件放到当前工作区约定的outputs目录，临时图、日志和检查帧留在work。不要发布或上传到外部服务，除非用户要求。

已有HyperFrames相关技能时沿用其运行时与CLI约定；这里的模板负责生长动画的具体生成，不重新收集对话里已经确定的偏好。

## 平滑性必须保留的实现

- 主体只有一个连续生长进度；眼、吻/口、躯干、附肢与卷尾等控制点随同一进度变化。不能退回0.3秒换图来代替平滑生长，单纯提高fps也不能修复换图感。
- 共享三角网格把邻接纹理扭到共同形状；Catmull-Rom控制空间轨迹，距离场插值收拢轮廓，减少透明度叠化的双重边缘。复杂拓扑变化不能靠增加控制点硬撑。
- 标注线直接读取形变后的控制点；数值直接格式化当前进度，保留小数位。不要固定初始 `stroke-dasharray` 后继续拉长引线。
- 单一paused GSAP时间轴驱动属性setter；不依赖被seek抑制的onUpdate回调，不使用真实时钟。图像decode及网格构建完成后再注册时间轴，并调用可用的 `__hfForceTimelineRebind()`。
- 内置轮廓插值会对透明图的alpha取阈值：对半透明水母/薄翅必须检查触手和薄边是否丢失，按实际素材调 `morph.alphaThreshold`；不承诺保持物理透明材质。

## 快速验证与调用示例

技能自带原海马素材和已验证配置，用于回归检查，不能冒充新生物素材：

```sh
python3 "$BIO_SKILL_DIR/scripts/create_project.py" --config "$BIO_SKILL_DIR/assets/examples/seahorse.json" --out work/growth-smoke
```

典型请求：“用这个skill做一段水母从小到大的生长动画，10秒、青蓝色、60fps。”

维护生成器时可运行 `python3 scripts/test_create_project.py` 和 `node scripts/test_renderer.mjs`；它们不调用图像API或进行渲染。

用户只想修改现有短片时，保留其素材与版式，调整对应配置或运行时；不要重新生成整套图像。内置生成器支持从项目 `config.json` 重建到新的同级目录，验证后再选用新结果。
