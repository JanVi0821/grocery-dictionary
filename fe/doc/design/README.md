# Grocery Dictionary 前端设计规范

本文件是 Grocery Dictionary 前端唯一的产品级设计规范。已批准预览参考：`../../../.impeccable/mocks/homepage-mobile-v1.png`。所有视觉数值只以 `src/styles/theme.css` 为准；本文只描述语义、层级和使用规则，不重复颜色、间距、圆角、阴影、字号或动效数值。

## 产品模式与品牌论点

- **产品模式：** mobile-first 的 Operate 工具，服务在新西兰超市购物的非英语使用者。
- **品牌论点：** Friendly Supermarket Field Guide。界面像友好的超市随身图鉴：快速、可信、清楚、有一点温度，但不装饰化。
- **核心任务：** 用户先扫描，再判断，再行动；品牌表达让信息更好读，而不是抢占决策空间。

## Scan-first 信息层级

1. **扫描入口优先：** 首页和主要路径先提供扫码动作，其次才是搜索、历史或说明。
2. **关键判断优先：** 产品详情先呈现名称、风险、饮食匹配和翻译摘要，再进入完整原文。
3. **状态优先：** 权限、加载、未找到、缺失资料必须直接告诉用户发生了什么、下一步做什么。
4. **长内容分层：** 成分、过敏原、营养和来源信息使用清晰标题、分组和可扫描列表，不堆叠成泛用卡片墙。

## 视觉系统

`src/styles/theme.css` 是所有视觉值的唯一来源。新增或修改可复用视觉值时，只改该文件。

### 色彩 token 角色

- `--color-brand-teal`：品牌主识别，承载信任、导航重点和主动作语气。
- `--color-brand-butter`：友好提示和轻量强调，不用于危险状态。
- `--color-brand-coral`：品牌温度和插画式点缀，不用于过敏原或风险危险。
- `--color-background`：页面底色，保证超市强光下可读。
- `--color-foreground`：主体文字。
- `--color-surface`：主要内容承载面。
- `--color-surface-muted`：次级区域、解释和翻译辅助层。
- `--color-border`：分隔、输入框、列表边界。
- `--color-primary` / `--color-primary-foreground`：主操作和其文字。
- `--color-accent` / `--color-accent-foreground`：非危险强调和提示。
- `--color-danger*`：过敏原、不可食用、阻断性风险。
- `--color-warning*`：需要确认、可能冲突、资料不完整但不阻断。
- `--color-success*`：可食用、匹配、完成。
- `--color-missing*`：资料缺失、未知、无法判断。

### 字体与语言策略

- `--font-sans`：多语言无衬线栈，优先 Atkinson Hyperlegible Next，再接本地化 Noto Sans 家族和系统字体。
- `--text-display*`：首页和状态页的大标题。
- `--text-body*`：默认阅读文本，适合成分和翻译说明。
- `--text-label*`：按钮、标签、状态胶囊和扫描辅助说明。

本地语言名称使用原生文字系统；不要把所有语言压成英文转写。缺字时允许字体回退，但布局必须保持可读。

### 层、条码与图形语言

- 页面使用清楚的底层、内容层、控制层，而不是玻璃或漂浮装饰。
- 条码 motif 只作为扫描和产品识别语义，不做满屏背景纹理。
- 形状以友好的圆角、胶囊标签、清晰控件为主；圆角来自 `--radius-page`、`--radius-control`、`--radius-pill`。
- 间距来自 `--spacing-page-x`、`--spacing-section`、`--spacing-touch`，优先保证拇指操作和信息分组。
- 内容宽度来自 `--container-content`、`--container-reading`：前者约束页面壳、页头和主要内容；后者约束成分、翻译、解释等长文阅读。
- 阴影来自 `--shadow-control`、`--shadow-raised`，只用于控件反馈和必要层级。

## 内容宽度与全宽区域

- 普通页头、主内容、表单、商品详情和桌面工具布局必须使用居中页面壳：`mx-auto w-full max-w-content px-page-x`。
- 长文内容使用 `w-full max-w-reading`，并保持对齐在 content shell 内。
- 移动端在页面 padding 内保持全宽；宽屏上内容在 container token 处停止增长，而不是横跨整个视口。
- full-bleed 只允许用于有意图的背景色带、相机/扫码取景区和其他明确沉浸区域；其内部可读内容和控件仍必须回到 `max-w-content`。
- 网格和桌面双栏布局必须放在 `max-w-content` 内。

## 页面与状态

### Home

- 第一屏必须明确“扫描商品”是主路径。
- 支持搜索或最近记录，但不得与扫码入口竞争。
- 用品牌色建立亲切感，避免营销型 hero 和泛用功能卡片网格。

### Scanner

- 取景区域是主内容；说明文案短、靠近动作。
- 识别、失败、手动输入和权限引导必须可见。
- 运动效果只服务于扫描反馈，不做持续闪烁或干扰读码。

### Product detail

- 原生语言商品名和用户语言解释优先。
- 过敏原、饮食匹配、缺失资料使用语义状态 token、文字和图标共同表达。
- 长文使用 translated/original page-tab 模式；翻译和原文切换清楚、可键盘操作。

### Permission denied

- 直接说明需要相机权限以及如何恢复。
- 提供手动输入条码或搜索作为替代路径。
- 不责备用户，不隐藏下一步。

### Loading

- 告诉用户正在扫描、查询或翻译哪一类任务。
- 骨架和进度反馈保持安静，不使用大面积品牌动画。

### Not found

- 明确说明未找到商品或资料不足。
- 提供重新扫描、手动搜索、提交缺失资料的路径。
- 使用 missing 语义，不伪装成错误或健康评分。

## 多语言规则

- 显示语言名称用原生名称，不使用国旗代表语言。
- 翻译页签遵循“Translated / Original”模式，并清楚标注当前视图。
- fallback 必须可见：缺少翻译、缺少原文或机器翻译不确定时，要说明原因和可用替代内容。
- 不把品牌图形、颜色或 emoji 当作语言标识。

## 过敏原与饮食语义

- 品牌 coral 永远不是危险色。
- danger、warning、success、missing 必须使用对应语义 token，并同时提供文字和图标或结构提示。
- 颜色不是唯一线索；状态标签必须能被读屏和色弱用户理解。
- 不生成虚假的健康评分、营养结论或医学承诺。

## 可访问性

- 以超市强光和单手操作为默认使用场景。
- 触控目标不得小于 `--spacing-touch` 表达的最小目标。
- 所有可交互元素需要键盘路径和清晰 `:focus-visible`。
- 文本、状态、控件必须满足对比要求；禁用态也要可辨认。
- 遵守 reduced motion；关闭非必要动效，保留必要状态反馈。
- 颜色不能作为唯一提示，必须配合文字、图标、位置或形状。

## 动效规则

- 动效短、克制、任务导向：扫码反馈、状态切换、控件响应。
- 使用 `--ease-page`、`--duration-short`、`--duration-base`。
- reduced motion 下移除位移和循环，只保留必要的即时状态变化。
- 禁止：大面积入场动画、循环闪烁、视差、弹跳装饰、加载时的品牌表演、影响扫码稳定性的运动。

## 明确反模式

- 不使用国旗表示语言。
- 不使用 glassmorphism、霓虹、渐变文字、泛用卡片网格、假健康分、装饰性 grocery 插画。
- 不把 coral 用作过敏原危险。
- 不硬编码品牌色、圆角、间距、阴影、字体比例或动效值。
- 不让品牌表达压过扫描、翻译和风险判断。

## 实施与验收清单

- 已先阅读本规范和 `src/styles/theme.css`。
- 所有新视觉值只进入 `src/styles/theme.css`。
- UI 使用 Tailwind utilities，并由 theme token 支撑。
- 普通页面壳、长文内容、网格、双栏和 full-bleed 内部内容符合内容宽度规则。
- 扫描优先层级在移动端第一眼可见。
- 桌面端保持 Operate 工具布局，不扩展成营销页。
- 多语言名称、fallback、translated/original 页签符合规则。
- 过敏原和饮食状态使用语义 token、文字、图标或结构提示。
- 移动端和桌面端都完成视觉验证。
- 键盘、焦点、对比、触控目标、reduced motion 已检查。
- 未引入本文列出的反模式。
