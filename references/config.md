# 配置与项目生成

从 `assets/examples/seahorse.json` 复制结构。它是真实可运行的示例，包含本次海马的25个控制点、清理后的图集和五个阶段，不是其他生物的默认形态。

## 字段

| 字段 | 含义 |
|---|---|
| `id` | 小写字母开头的kebab-case项目ID，最长64字符 |
| `canvas.width / height` | 输出像素；内置HUD设计坐标为900×1200，支持3:4等比例输出，如1080×1440 |
| `duration / fps` | 秒数与帧率，默认10与60；帧率可用24/25/30/50/60 |
| `growth.start / end` | 连续生长区间，默认0.55至duration−1.2，之后保持最终形态 |
| `title.lines` | 1–3行英文大标题；长文本需要截图检查 |
| `title.zh / taxon / archive` | 中文副标题、分类/学名行、档案名；不确定学名留空，不虚构 |
| `palette` | background、ink、muted、rule、accent、cold，六位hex颜色 |
| `atlas.file` | 带alpha的PNG路径，相对配置文件目录 |
| `atlas.columns / rows` | 图集列数与行数；可以有未使用的备用格 |
| `atlas.cellWidth / cellHeight` | 真实单格原始像素，必须与总尺寸严格吻合 |
| `hero.anchor` | 所有阶段对齐到的屏幕点，使用900×1200设计坐标 |
| `hero.pixelsPerUnit` | 原图1像素映射到设计画布的倍率 |
| `morph.alphaThreshold` | alpha覆盖阈值1–254，默认96；半透明生物需要检查并按素材调整 |
| `morph.edgeSoftness` | 轮廓抗锯齿宽度，大于0且不超过8，默认1.25；不是模糊整个生物 |
| `landmarkNames` | 各阶段共有的语义控制点名字，至少6个，不重复 |
| `stages` | 2–8个姿态；数量不能靠复制同一图来充数 |
| `metrics` | 两组读数，见下面说明 |
| `annotations` | 最多4个跟随形变的解剖标注 |
| `footer.en / zh` | 默认明确标记概念序列、示意数据 |

## 阶段字段

```json
{
  "id": "S01",
  "zh": "幼体期",
  "en": "JUVENILE",
  "cell": 0,
  "scale": 0.6,
  "anchor": [181, 624],
  "accent": "#a5c6d2",
  "metrics": {"size": 0.18, "structure": 0.12},
  "points": [[85,205], [117,180], [135,153], [122,124], [168,94], [206,105]],
  "visibleRect": [0, 0, 362, 688]
}
```

上面仅展示字段结构，六个示例点不能直接替代完整海马配置。`points`的数量和顺序必须与`landmarkNames`完全一致，坐标在单格内且互不重合。`cell`从0开始按行计数。阶段id可保留来源档案编号；底部序列始终按当前所选阶段的顺序显示01至N。如希望阶段牌也连续，重设各阶段id。`visibleRect`可选，表示格子内[x0,y0,x1,y1]的有效范围；仅用于隔开邻格漏入或确定安全裁切，**不要对所有新图沿用海马前排裁掉5%的经验值**。

`scale`与anchor共同决定阶段尺寸，不能只替换图片而保留海马缩放。对于横向生物，调整hero位置与倍率，为左右标注留空间。成年体的头顶不得越过标题分隔线，尾/触手不得进入底部序列条。

## 指标

```json
[
  {"key":"size","label":"REL. SIZE","unit":"INDEX","digits":2,"max":1},
  {"key":"structure","label":"STRUCTURE","unit":"INDEX","digits":2,"max":1}
]
```

阶段的metrics以key对应数值。digits为0–3，max控制进度条满量程；省略max时取所有阶段最大绝对值。默认是无量纲概念指数。用户给出实测数据时才采用对应单位，并保留来源及含义，不能将生成的数字标为真实身长/年龄。

## 解剖引线

```json
{
  "point": "mouth",
  "en": "MOUTH",
  "zh": "口部",
  "label": [52, 652],
  "align": "left",
  "lineStart": [178, 690],
  "elbow": [220, 690]
}
```

`point`必须是已有的landmark名字。所有布局点使用900×1200设计坐标；label是文字区域上方角点，右对齐时是其右上角。折线起点/折点固定，终点从形变后的控制点计算。新生物重新选择标签位置，避免线穿过文字或遮挡眼睛。

## 生成器行为

```sh
python3 "$BIO_SKILL_DIR/scripts/create_project.py" --config work/specimen/config.json --validate-only
python3 "$BIO_SKILL_DIR/scripts/create_project.py" --config work/specimen/config.json --out work/specimen/project
```

`--validate-only`检查图集存在/尺寸/透明通道、时序、点数与坐标、标注绑定等，不能证明alpha已清干净或形变好看。输出目录已有内容时停止，保留用户工作。

生成的`config.json`是便携配方，图集路径改为项目内的`assets/atlas.png`。index.html内嵌其执行副本，不在渲染时fetch配置。修改配方后重建到新的同级目录，再验证和选用，避免配置与HTML执行副本不一致。

模板资源包含本地GSAP、Inter、JetBrains Mono、Noto Sans CJK，以及浏览器WebGL网格/距离场渲染器。第三方声明位于`assets/template/THIRD_PARTY.md`，复制到生成项目。素材准备需要图像生成工具，已有素材的验证和渲染不需要任何图像API凭据。

## 已知的打包与检查提示

Noto Sans CJK文件大于HyperFrames的2MB内联上限，渲染会从项目本地assets加载它。源项目必须连同完整assets一起打包，不能只交付单个HTML并称其自包含。单场景HUD可能出现子合成结构建议，档案辅助小字可能低于手机字号建议；检查实际画面，保证关键阶段名和数值可读，不能仅凭无阻塞错误宣称视觉已通过。
