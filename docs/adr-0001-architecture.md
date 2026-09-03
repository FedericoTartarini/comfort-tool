# ADR-0001 · CBE Thermal Comfort Tool 重写：技术栈与架构基线

- 状态：已达成共识（2026-09-03）
- 适用范围：v1（目标 2026-10-01），以及其后的长期维护
- 取代：原型仓库 `main repo/comfort-tool`（Svelte 5，约 49k 行）。原型因分层过多不可维护，**不复用代码，只借鉴已验证的行为**。
- 配套：计算库 `jsthermalcomfort` fork 的 `typescript` 分支（TypeScript，软链消费其构建产物，与本项目并行开发）。第 4 节同时给出库的公开接口契约。
- 修订 2026-09-03：按 §3 的判据收缩库 / 应用边界（§3、§4.1、§4.3、§5）；`epsilon` 改为 PMV 残差（§1、§2、§4.7）。第二轮：限值在库里做 source 不做 mirror、所属标准进库（§4.1.2）、封闭集合改为 `as const` 对象集合（§4.0、§4.2）、operative 模式用 `t_o` 量与 `psychrometricZone.trFollowsDb`（§4.1.4、§4.4、§4.5）、物理量名字只来自 `Quantity.label`（§6）。

---

## 1. 背景与约束

| 项 | 事实 |
|---|---|
| 团队 | v1 由 1 人开发（React 19 / Svelte 5 熟悉程度相当）；1 名强 Python 背景研究员做审查；3 年后的维护者很可能是 Python 背景研究员 + 开源社区 |
| 工作方式 | AI 大量写代码，人只做架构与审查 |
| 时间 | 2026-10-01 前交付 v1；v1 功能全集，分阶段实现，不按周排计划 |
| 后端 | 无。纯静态 SPA，先部署 Netlify |
| 计算库 | fork `jsthermalcomfort` 的 `typescript` 分支，从 `pythermalcomfort` 移植；库只含模型及其**通用**属性（名称、简介、分级尺度、适用范围），不含任何仅为本工具存在的字段；应用只以 SI 调库；**不做适配器**，前端直接按第 4 节接口开发 |
| 交互 | 改一个输入图立刻跟着变；Standard / Explore 无计算按钮；Time-series 有 |
| 参考精度 | 旧工具舒适区为边界求根：RH 每 10% 一条线、PMV 残差 0.001（`static/js/psychchart.js` 注释写作 "ta precision"，实为 PMV 残差） |
| 浏览器 | 现代浏览器完整体验；**很老的浏览器也要能打开链接并看到预填的输入** |
| 视觉 | 允许重新设计；保留三栏信息架构（左导航 / 中输入 / 右结果 + 图）；v1 无暗色 |
| 测试 | v1 前只对纯函数写单测；UI / e2e / 视觉测试 v1 后 |
| 统计 | Google Analytics 一行脚本，按路径记录 |
| 开源 | 公开、MIT、接受 PR |
| 精度显示 | 全项目统一：最多两位小数，末尾零不显示 |

---

## 2. 决策一览

| 领域 | 决策 | 主要理由 | 已否决的替代 |
|---|---|---|---|
| 框架 | **Svelte 5（纯 runes）+ Vite 8 + TypeScript 6** | 单人开发且两框架熟悉度相当，React 唯一决定性优势（审查者只懂 React）不成立；代码更少、`$state / $derived` 天然匹配实时联动；原型可作疑难点参考；官方 Svelte MCP + autofixer 已可用 | React 19；SvelteKit（无后端，且 Kit 3 正在 RC 迁移） |
| 路由 | **sv-router 0.18**，全部用法封在 `routes/navigation.ts` | 类型化路由、维护中、原型已用；0.x 风险定点隔离 | 手写；`@keenmate/svelte-spa-router` |
| UI | **shadcn-svelte + Bits UI + Tailwind 4**；工具类**只允许**出现在 `ui/primitives/`（CLI 生成，不手改）和 `ui/layout/`（`Stack / Grid / Inline`，gap 变 props）；其他目录出现工具类即 lint 报错 | 现成控件 + 一致间距（Mantine 手感），AI 输出最稳，代码归项目所有 | Carbon Components Svelte（IBM 视觉、0.x）；Bits UI + 手写 CSS |
| 状态 | `.svelte.ts` 中的 runes class，**不引状态库**；地址栏只反映路径，分享载荷仅在 Export Link 时生成 | 简单可读；原型做法 | 地址栏实时同步 |
| 图表 | **plotly.js 4.0**（`plotly.js-cartesian-dist-min`，按需动态 import；原生 TS 类型）；自写 `PlotlyChart.svelte` 用 `{@attach}`；图表组件只接收"图表规格"，不知道模型 | 放大缩小等交互；4.0 原生导出类型 | 3.x；`svelte-plotly.js`（无 Svelte 5 版本） |
| 计算 | 单个 Web Worker + **Comlink**；主线程按序号丢弃过期结果；库的模型函数只在 Worker 内调用 | 可读性优先 | 手写 postMessage 协议；Worker 池 |
| 精度 | Standard 合规区：**边界求根**（RH 每 5%、PMV 残差 0.001、割线法退二分法、饱和线每 0.5 °C）；Explore 场图：**100×100 网格**，所有模型统一 | 与旧工具同源且更细；PHS 约 2.4 s 时保留旧图 | 全部网格；自适应细化 |
| 表单 | 不引表单库、不引 Zod；`bind:value` + 库给的范围校验 | 库已提供硬范围 | — |
| 校验 | 超出硬范围：标红、不计算、保留上一个有效值 | 库只提供这一套范围 | 两级范围 |
| 链接 | **`?share=v1.<Base64URL(JSON)>`**；Time-series 为 `?share=v1z.<Base64URL(deflate)>`（`fflate`）；版本前缀 + `migrate()`；解析失败回退默认并提示 | 不压缩使 ES5 摘要页可解 | `?s=`（缩写违反命名规则）；`#share=`；兼容旧 Berkeley 链接（不需要） |
| 浏览器 | 完整应用下限 Chrome 87 / Firefox 83 / Safari 14（Svelte 5 硬下限）；`index.html` 内嵌 ES5 特征检测，更老浏览器渲染**只读摘要页**；Tailwind 4 下限 2023，2020–2023 浏览器"可用但样式不完美" | 满足"很老浏览器能打开并预填" | Tailwind 3.4；polyfill 插件 |
| 统计 | gtag 一行；路径变化时手动发 `page_view`；`page_location` 去掉查询串 | 不把分享载荷发给 Google | Consent 横幅 |
| 工程 | pnpm、TS `strict` + `erasableSyntaxOnly` + `verbatimModuleSyntax`、ESLint flat + Prettier、Node 24、GitHub Actions（typecheck + lint + build）、Netlify PR 预览、UI 文案集中在一个字典模块（v1 仅英文） | — | TypeScript `enum`（不可擦除语法） |

### 2.1 plotly.js 4.0 需要注意的变更

- 颜色库换为 culori：不再接受小数 `rgb()` 与 `hsv()`；`rgb()` 第四个参数现在是 alpha。项目统一用十六进制颜色 + `rgba()`。
- Chart Studio 相关 `config` 属性删除，"Upload to Cloud" 按钮默认显示：`config.showSendToCloud = false`，并精简 modebar。
- MathJax v2 不再支持（本项目不用）。
- hover / click 事件返回真实数据值。
- 4.0 原生导出 TypeScript 类型，不再安装 `@types/plotly.js`。

---

## 3. 系统边界：库 vs 应用

**判据（2026-09-03 共识）：pythermalcomfort 会不会带这个东西。** `jsthermalcomfort` 是它的移植，受众是研究者和任意工具。凡是"另一个设计完全不同的工具用同一个模型也需要一模一样的值"，归库；凡是换一个工具就可能不同的，归应用。

| 归库（`jsthermalcomfort`，fork `typescript` 分支） | 归应用 |
|---|---|
| 物理量定义 `io.quantities`：key、kind、label、SI/IP 单位**符号** | 显示单位与 SI↔IP 换算（°C↔°F、m/s↔fpm）、输入步长、显示格式化（两位小数、去尾零） |
| 模型函数与 `io` 包装；挂在模型函数上的名称、简介、**所属标准**（`model.standard`）、分级尺度（`tsv`、`offsets`）、**适用范围**（标准规定的 min/max，`reference/` 数据，唯一来源） | 输入顺序、默认值、选项及其文案、结果表列（`table`）、表示组（湿度 / 温度）的状态与切换 |
| 统一输出 `Measure { quantity, value, unit, category, intervals }`（§4.1.3） | 合规判定 = 对 `Measure.category` / `intervals` 的解析；Explore 的可编辑 Band |
| 舒适区几何：`charts.psychrometricZone`（边界求根，含 operative 模式的 `trFollowsDb`）、`charts.adaptiveAshraeZone` | 网格扫描、`ChartSpec`、图例、颜色、视口裁剪、所有 Plotly 规格 |
| 输入计算器的算式（`clo_dynamic`、`v_relative`、`running_mean_outdoor_temperature`、太阳得热、球温…） | 哪个模型提供哪个计算器按钮（声明文件） |
| 湿空气函数（露点 / 湿球 / 含湿量 / 水蒸气压 ↔ RH、操作温度） | 标准的路径段（`core/standard.ts`，以库的 `reference.standards` 对象为键）、切模型规则、分享链接、单位切换、UI |
| 有状态模型的顺序模拟（PHS，v1 后） | Time-series 行编辑器与会话 |
| 超范围返回结果 + warnings，不抛异常；无 DOM / `node-fetch` 依赖，可在 Worker 运行 | — |

两条明写的例外：

- **单位换算写在应用里。** "应用永不实现公式"针对的是舒适度公式与阈值；°C↔°F 一类的显示换算是表现层问题，而且应用的 IP 显示单位（fpm）与库的 IP 调用单位（fps）本来就不同。应用只以 SI 调库，库的 `ipUnit` 字符串和 `units_converter` 是它自己的调用约定，应用不读。
- **库不带任何"仅为本工具存在"的字段。** 没有 `step`、`defaultValue`、`OptionSpec`、路由路径段、`ModelDefinition` 注册表。这些都是应用声明文件或 `core/` 的内容（§4.2 / §4.3）。

约定：库的**模型函数**（`jsthermalcomfort` 根、`jsthermalcomfort/models`）只在 `src/models/`（绑定 `run`、读元数据）与 `src/workers/`（实际调用）里 import，lint 拦。`io` / `psychrometrics` / `reference` / `charts` 子路径随处可 import，因为 `io.quantities` 是物理量的唯一定义；`io` 的模型包装只在 worker 里**调用**，这一条靠约定不靠 lint。

---

## 4. 核心契约

### 4.0 三条贯穿全项目的规则

1. **一处定义，处处引用。** 物理量、模型、工作区、图表类型、单位制等都是对象；代码中用点引用（`io.quantities.tdb`、`workspace.explore`），不用字符串键，不用 `Record<string, …>` 字典。`Quantity.kind` 是库导出的字符串联合类型，应用把它当作带类型的判别值（`core/units.ts` 按 kind 查显示单位表，`satisfies Record<QuantityKind, …>` 保证穷尽），不算字符串键。
2. **字符串只出现在两个边界。** 库内部的 `Quantity.key`（如 `"tdb"`）和分享链接的序列化。前者只被库、`core/libraryInputs.ts`（用 `Quantity.key` 拼库的 init 对象，是库边界）和 `shareLink.ts` 读取；后者集中在 `shareLink.ts`。
3. **可擦除语法。** 不用 `enum`、`namespace`、构造函数参数属性。封闭集合用 `as const` 的普通对象集合加从中派生的联合类型，和库的 `quantities` 同一种写法；行为写成普通函数，不用类层级，也不到处 `switch`。

### 4.1 库的公开接口（契约）

库已有四层：`models` / `reference` / `io` / `charts`。下面只列应用依赖的部分。**Phase 1 补四样：适用范围数据（source，不是 mirror）、所属标准、两个缺的物理量、`psychrometricZone` 的 `trFollowsDb`。** 其余都已存在。

#### 4.1.1 物理量（`jsthermalcomfort/io`，已存在）

```ts
export type QuantityKind = "temperature" | "airSpeed" | "percentage" | "metabolicRate"
                         | "clothingInsulation" | "thermalSensation" | "pressure";   // pressure 为 p_atm 新增
export interface Quantity { readonly key: string; readonly kind: QuantityKind; readonly label: string;
                            readonly siUnit: string; readonly ipUnit: string; }        // 单位只是符号字符串
export const quantities = { tdb, tr, v, vr, rh, met, clo, wme, t_running_mean, pmv, ppd, tmp_cmf,
                            /* Phase 1 补 */ t_o, p_atm } as const;
```

应用**不重复声明物理量**，`import { io } from 'jsthermalcomfort'` 后点引用 `io.quantities.tdb`。`siUnit` / `ipUnit` 是库自己的调用约定，应用只读 `label` 与 `kind`，显示单位在 `core/units.ts` 按 kind 查。每加一个模型，缺什么量就在库里加一行。

#### 4.1.2 参考数据（`jsthermalcomfort/reference`）

- 分级尺度，已存在：`isoThermalSensation` / `ashraeThermalSensation`（`IntervalScale`，`classify()` / `labelFor()`）、`adaptiveAshraeOffsets` / `adaptiveEnOffsets`、`enCategoryPmvLimits`。
- **适用范围，Phase 1 新增**：每个标准一张表，按 `Quantity` 对象键控，`readonly { quantity, min, max }[]`。**表是唯一来源**：compliance 函数从表里读 min/max，warning 文案从表里模板化，不再各存一份。挂到模型函数上：`pmv_ppd_iso.limits`、`adaptive_ashrae.limits`（含 `t_running_mean` 10..33.5），与 `label` / `tsv` 同一个模式。
- **所属标准，Phase 1 新增**：`reference.standards = { iso7730, ashrae55, en16798 }`，每个是 `{ id, name }` 普通对象；`pmv_ppd_iso.standard = standards.iso7730`。没有 `standard` 的模型（UTCI）只出现在 Explore。库里已有的 `utilities.Standard` 是 compliance 分派键（含 `FAN_HEATWAVES`、`ANKLE_DRAFT`），不是这个，名字要分开。

#### 4.1.3 统一输入输出（`jsthermalcomfort/io`，已存在）

```ts
io.pmvPpdIso({ tdb, tr, vr, rh, met, clo, units: "SI" })   // → PmvPpdIsoOutputs
  .toMeasures()   // Measure[]：{ quantity, value, unit, category?, intervals }
  .warnings       // readonly string[]
```

- 输入对象的字段名就是 `Quantity.key`，所以 `Map<Quantity, number>` → init 是一行 `Object.fromEntries`，在应用的 `core/libraryInputs.ts` 里做。
- 分类结果不是独立输出：`Measure.category` 是该值落入的尺度标签（PMV 的 tsv），`Measure.intervals` 是评估出的舒适区间及是否满足（Adaptive 的 80% / 90%）。**合规判定 = 应用对这两个字段的解析**，结果表 Compliance 列直接显示它们。
- 模型函数上挂着 `label` / `description` / `standard` / `tsv` 或 `offsets` / `limits`，声明文件从这里读，不写文案、不抄数字。

#### 4.1.4 图表几何（`jsthermalcomfort/charts`，已存在）

`psychrometricZone({ tr, vr, met, clo, pmvLimit, rhStep, saturationStep, epsilon, correctKnownDefects, trFollowsDb })` 返回 `polygon` 顶点；`adaptiveAshraeZone()` 返回各等级的上下边界。全部 SI、不裁剪、不着色。`epsilon` 是 PMV 残差，不是温度容差。`trFollowsDb`（Phase 1 新增）让求解时 `tr = db` 沿 x 轴跟随，这是 operative 模式湿空气图的几何，旧工具的 psychtop 图就是这样算的；不加它，operative 模式的合规区是错的。

#### 4.1.5 库里没有、也不该有的东西

`Unit` / `step` / `toSi` / `fromSi`、`defaultValue`、`OptionSpec` / `OptionValue`、标准的路由路径段、`InputSpec` / `OutputSpec` / `Band`、`ModelDefinition` 与 `models` 注册表、`QuantityValues`、`InputCalculator` 的适用性、`evaluateMany`。它们要么是表现层决策（§4.2 / §4.3），要么是库已有类型的重复。

旧工具输入面板那组按钮的归属：`Create custom ensemble / Dynamic predictive clothing / Solar gain / Globe temp / Set pressure` → 应用侧输入计算器，算式调库；`Relative air speed / Local control` → 声明文件里的选项；`Local discomfort`（踝部吹风、垂直温差）只产生输出、不改输入 → 作为普通小模型进入库，在 Explore 中可用；`Reset / Save / Reload / Share / SI-IP / Documentation` → 应用动作。输入计算器语义为**一次性 Apply**：用户填计算器自己的小输入，点 Apply，结果写入目标输入；计算器不进会话状态、不进分享链接。

### 4.2 应用侧封闭集合

与库的 `quantities` 同一种写法：`as const` 对象集合 + 派生联合类型 + 普通函数。不用类。

```ts
// src/core/workspace.ts
export interface Workspace { readonly id: string; readonly pathSegment: string; readonly title: string; }
export const workspace = {
  standard:   { id: 'standard',    pathSegment: 'standard',    title: 'Standard' },
  explore:    { id: 'explore',     pathSegment: 'explore',     title: 'Explore' },
  timeSeries: { id: 'time-series', pathSegment: 'time-series', title: 'Time-series' },
} as const satisfies Record<string, Workspace>;
export function isWorkspaceAvailable(target: Workspace, model: RegisteredModel): boolean {
  if (target === workspace.explore) return true;                            // 所有模型都有 Explore（至少 dynamic chart）
  if (target === workspace.standard) return model.model.standard !== undefined;   // 库的 model.standard
  return model.timeSeries;
}
export function workspaceFromId(id: string): Workspace | undefined;        // 仅 shareLink / navigation 使用
// 同一写法：chartType.psychrometric / .dynamic；humidityMode.rh / .humidityRatio / .dewPoint / .wetBulb / .vaporPressure；
//          unitSystem.si / .ip；entryGroup.humidity / .temperature

// src/core/entryModes.ts — 温度表示决定面板显示哪些量、哪个量是温度轴；标签一律来自 Quantity.label
const q = io.quantities;
export const temperatureMode = {
  separate:  { id: 'separate',  panel: [q.tdb, q.tr], axis: q.tdb },
  operative: { id: 'operative', panel: [q.t_o],       axis: q.t_o },
} as const;

// src/core/standard.ts — 只加应用特有的路径段；标准本身是库的 reference.standards 对象
export const standardPath = [
  { standard: reference.standards.ashrae55, pathSegment: 'ashrae-55' },
  { standard: reference.standards.iso7730,  pathSegment: 'iso-7730' },
  { standard: reference.standards.en16798,  pathSegment: 'en-16798' },
] as const;
export function pathSegmentFor(standard: StandardRef): string;
export function standardFromPath(segment: string): StandardRef | undefined;

// src/core/units.ts — 显示单位。换算公式写在这里（§3 例外）；按 Quantity.kind 查表，satisfies Record<QuantityKind, …> 保证穷尽
export interface DisplayUnit { readonly symbol: string; readonly step: number; toSi(v: number): number; fromSi(v: number): number; }
export function displayUnitFor(quantity: Quantity, unitSystem: UnitSystem): DisplayUnit;
// temperature → °C 0.1 / °F 0.1；airSpeed → m/s 0.05 / fpm 10；percentage → % 1；metabolicRate → met 0.1；
// clothingInsulation → clo 0.1；thermalSensation → 无单位 0.1；pressure → kPa 0.1 / inHg 0.01
```

### 4.3 模型声明（应用侧，一个对象字面量，一个文件）

```ts
// src/models/pmvIso.ts
import { io, pmv_ppd_iso } from 'jsthermalcomfort';   // 声明文件可以引用库模型：绑定 run、读元数据。调用只在 worker
const q = io.quantities;
export const pmvIso = defineModel({
  run: io.pmvPpdIso,                                   // 库的 io 包装，worker 调它
  model: pmv_ppd_iso,                                  // label / description / standard / tsv / limits 从这里读
  inputs: [                                            // 顺序 + 默认值（CBE 旧工具的起始值），一张表
    [q.tdb, 25], [q.tr, 25], [q.v, 0.1], [q.rh, 50], [q.met, 1.1], [q.clo, 0.5],
  ],
  entryGroups: [EntryGroup.humidity, EntryGroup.temperature],
  charts: [
    DynamicChart.withDefaultAxes(q.tdb, q.v),          // 每个模型必有
    PsychrometricChart.withZone(q.pmv),
  ],
  table: [q.pmv, q.ppd],                               // 必填：结果表列，也是 Explore 可选输出
  timeSeries: true,
});
// src/models/index.ts
export const registeredModels = [pmvIso, adaptiveAshrae, utci] as const;   // 注册只此一行
```

规则：所有模型默认拥有 Explore 能力；Standard 能力由库的 `model.standard` 是否存在决定，应用不再声明；Time-series 能力由 `timeSeries` 决定。**新增模型 = 库补齐该模型的 quantities / limits / standard + 一个声明文件 + 一行注册，其他零改动。** 选项（如 `airspeed_control`）在需要时加进声明文件，v1 的两个模型没有选项。面板标签、表头、轴标签一律来自 `Quantity.label`，声明文件里没有任何物理量名字。

结果表（`table`）：

- 只有一种表样式（原型的设计）：表头大写小号字；列多时横向滚动；Compare 开启时每个槽位一行，Baseline 决定差值高亮相对于哪一行。
- 列的构成固定为三段：**Input**（槽位名，按槽位颜色着色，总是第一列）→ **Compliance**（仅当模型的 `Measure` 带 `category` 或 `intervals` 时出现，显示落入的标签，着色为通过 / 不通过）→ **模型文件 `table` 列出的库输出**，按声明顺序，数值按 §4.6 格式化并跟随单位制。
- `table` 必填；未列出的输出不显示，也不进 Explore 的输出选择。

### 4.4 图表类型（封闭集合，v1）

| 类型 | 定义 |
|---|---|
| `chartType.psychrometric` | x = `temperatureMode.axis`（separate 下 `tdb`，operative 下 `t_o`），轴标签来自 `Quantity.label`；y = 含湿量；RH 等值线；合规区多边形（`psychrometricZone`，operative 下 `trFollowsDb: true`）；三个槽位标记点 |
| `chartType.dynamic` | x / y 可选物理量（operative 下提供 `t_o`，不提供 `tdb` / `tr`）；分带等值面（100×100 网格）；标记点；**每个模型默认获得**。Adaptive 用它渲染：锁定轴 `t_running_mean × t_o`，输出为可接受等级的区间 |

参数曲线图（SET 输出、热损失）、时序折线图在需要时先加入图表库再被模型引用。`PlotlyChart.svelte` 只接收 `ChartSpec`（traces / layout / shapes 的受限子集），不 import 任何模型。

图例（Legend）规则：

- **整张图只有一个图例，统一出现在图的下方**。Plotly 自带图例关闭（`layout.showlegend = false`），不允许出现原型那样"图内一个、图下一个"的两套图例。
- 图例条目是 `ChartSpec` 的一部分：`ChartSpec.legend: readonly LegendEntry[]`，`LegendEntry { label, swatch: Swatch.fill | Swatch.line | Swatch.marker, color }`。由图表类型的规格生成函数产出，`ChartLegend.svelte` 只负责渲染，不知道模型。
- 导出图片时用同一份 `legend` 条目生成 Plotly 的横向底部图例（仅导出布局启用），保证屏幕与导出一致。

### 4.5 会话状态

```ts
class Session {                                        // Standard + Explore 共用；Time-series 另有独立会话
  workspace: Workspace; standard?: StandardRef; model: RegisteredModel;   // StandardRef 是库的 reference.standards 成员
  unitSystem: UnitSystem;                              // 仅显示层
  compare: { enabled: boolean; activeSlot: Slot; baselineSlot: Slot };
  slots: readonly [InputSlot, InputSlot, InputSlot];
  chartByModel: Map<RegisteredModel, ChartState>;      // 每模型记住自己的图表设置
  environment: { atmosphericPressure: number };        // "Set pressure"；影响湿度换算
}
class InputSlot {
  values: SvelteMap<Quantity, number>;                 // 规范 SI；跨模型超集包（切回时自动恢复）；不含 rh；operative 下存 t_o，separate 下存 tdb / tr
  humidity: { mode: HumidityMode; value: number };     // 用户输入的量是真值
  temperature: { mode: TemperatureMode };
  options: SvelteMap<OptionSpec, OptionValue>;         // OptionSpec 是应用类型，由声明文件给出；v1 两个模型没有选项
}
class ChartState {
  type: ChartType; axes: { x: Quantity; y: Quantity }; output: Quantity;
  bandsByOutput: Map<Quantity, Band[]>;                // Explore 阈值；默认由库的 IntervalScale（如 pmv 的 tsv）派生，无尺度的输出由声明文件给默认 Band
}                                                      // 无 "show zones" 开关：合规区与分带总是绘制
class Outputs { perSlot: readonly (ModelResult | null)[]; grid: GridResult | null; stamp: number; }   // 派生，永不持久化
```

规则：

- **用户输入的量是真值。** 湿度以 `humidity` 存原值，`rh` 由纯函数 `toLibraryInputs(slot, model, environment)` 在送 Worker 前用当前 `tdb` 与气压派生（改 `tdb` 时露点不变、RH 变，与旧工具一致）；切换表示时把当前值换算到新表示。`temperatureMode.operative` 下槽位存的是 `t_o`，`toLibraryInputs` 展开成 `tdb = tr = t_o`；切模式时换算：separate → operative 用库的 `psychrometrics.t_o(tdb, tr, v)`，operative → separate 令 `tdb = tr = t_o`。
- `toLibraryInputs` 还负责 `v → vr`：PMV 面板显示的是 `v`，库要 `vr`。是否套 `v_relative(v, met)` 是模型行为，由声明文件指定，对照旧工具确定。
- Outputs 完全由 Inputs + Chart 派生，由 `state/compute.svelte.ts` 监听并写入；瞬态 UI 状态不进 Session。
- 切模型：同物理量参数保留；超出新模型硬范围的参数弹窗（标题 "Boundary Range Warning"，表格 Input / Current / Allowed range，按钮 "Yes, switch and adjust" / "No, stay here"）；无越界不弹窗；三个槽位同样处理。
- Explore 阈值：有序 `Band` 列表，下含上不含，缺口不着色；编辑器含 Add band / Reset / 删除；按（模型，输出）保存并进链接；颜色由应用按区间位置从固定色板分配，可编辑。

### 4.6 单位与数值显示

- **存储永远是 SI**，库永远以 SI 调用（即使库支持 IP 也不走那条路，保证单一路径）。
- 切换到 IP：输入框显示 `displayUnitFor(quantity, unitSystem.ip).fromSi(si)`；用户在 IP 下编辑：解析 → `toSi` → 存储。存储值保留全精度，只有显示文本被格式化；因此 SI ↔ IP 来回切换不会漂移。
- 范围、默认值、图表轴标签同样在显示边界换算。
- 步长取自**当前显示单位**的 `DisplayUnit.step`。
- 换算公式写在 `core/units.ts`，是 §3 明写的例外；库的 `units_converter` 不用。
- 全项目一个格式化函数：最多两位小数、去掉末尾零（`26.0 → 26`，`0.51 → 0.51`，`78.80 → 78.8`）。

### 4.7 计算流水线

`Session 变化 → toLibraryInputs → compute.worker（Comlink）→ model.run / charts.psychrometricZone / 网格扫描 → Outputs（带 stamp，过期丢弃）→ ChartSpec → PlotlyChart`

- 区域边界：RH 每 5% 一条线（21 条）、PMV 残差 `epsilon` 0.001、割线法失败退二分法、饱和线每 0.5 °C。
- 网格：100×100；缓存 key = 模型 + 输出 + 非轴参数（拖动轴参数不重算）；计算期间保留旧图，>300 ms 显示"计算中"。
- 库基准（原型 fork，V8）：PMV 静风 1.7 µs/次；PMV 含冷却效应 43 µs；UTCI 0.5 µs；PHS(480 min) 244 µs → 100×100 分别约 20 ms / 0.43 s / 5 ms / 2.4 s。

### 4.8 分享链接 schema v1

`?share=v1.<Base64URL(JSON)>`

```json
{ "workspace": "explore", "standard": null, "model": "pmv_ppd_iso",
  "unitSystem": "SI",
  "compare": { "enabled": true, "active": 0, "baseline": 0 },
  "environment": { "p_atm": 101.325 },
  "slots": [
    { "values": { "tdb": 26, "tr": 25, "v": 0.1, "met": 1.0, "clo": 0.51 },
      "humidity": { "mode": "rh", "value": 50 }, "temperature": { "mode": "separate" },
      "options": { "airspeed_control": "with_local_control" } },
    null, null ],
  "chart": { "type": "dynamic", "axes": { "x": "tdb", "y": "v" }, "output": "pmv",
             "bands": [ { "label": "Cold", "min": null, "max": -2.5, "color": "#1f5fa8" } ] } }
```

- 只带当前模型的图表设置与当前模型声明的物理量；所有 id 来自各集合对象的 `.id` / `Quantity.key`，解码经各集合的 `xxxFromId()` 函数；这是应用里唯一把对象转成字符串又转回来的文件。
- Time-series 路由使用 `?share=v1z.<Base64URL(deflate(JSON))>` 并含 `rows`；ES5 摘要页只解 `v1.`，对 `v1z.` 显示"时序数据省略"。
- 解析失败回退默认并提示，不白屏；schema 变更时写 `migrate(v_old → v_new)`。

### 4.9 Time-series（非第一阶段）

输入为"第 N 段 + 持续分钟数"的表格编辑器（逐行加），与 Compare 槽位概念隔离；无状态模型逐行求值、有状态模型（PHS）调用库的 `sequentialSimulation`；上限 200 行；有显式"计算"按钮；独立会话。

---

## 5. 目录结构与边界

```
src/
  core/                 纯 TS；ESLint 禁止 import svelte / state / ui
    workspace.ts  chartType.ts  unitSystem.ts  entryModes.ts   封闭集合（as const 对象 + 普通函数）
    standard.ts           库 reference.standards 对象 → 路径段
    modelDeclaration.ts   defineModel + RegisteredModel
    libraryInputs.ts      toLibraryInputs(slot, model, environment)：表示组 → 库输入（Map → init，v → vr，t_o → tdb = tr）
    numberFormat.ts       两位小数、去尾零
    units.ts              显示单位：符号、步长、SI↔IP 换算（§3 例外）
    shareLink.ts          encode / decode（migrate 等 v2）
    charts/   chartSpec.ts（含 LegendEntry）  psychrometricChart.ts（调 charts.psychrometricZone）  dynamicChart.ts（100×100 网格）
  models/               每模型一个声明文件 + index.ts；主线程里唯一可引用库模型函数的目录
  state/                session.svelte.ts  compute.svelte.ts  timeSeriesSession.svelte.ts
  workers/              compute.worker.ts（唯一调用库模型函数的地方）
  ui/
    primitives/         shadcn-svelte 生成；允许 Tailwind；不手改
    layout/             Stack.svelte  Grid.svelte  Inline.svelte；允许 Tailwind
    inputs/  outputs/（ResultTable.svelte）  charts/（PlotlyChart.svelte  ChartLegend.svelte）  dialogs/   业务组件；禁止工具类
  routes/               页面组合；navigation.ts（sv-router 唯一使用处）
  text/                 UI 文案字典（v1 仅英文）
  app.css               Tailwind @theme 令牌（有限的 spacing / font 阶梯）
index.html              内嵌 ES5 特征检测 + 只读摘要页
```

---

## 6. 编码规范

- **命名**：组件 `PascalCase.svelte`；模块 `camelCase.ts`；函数动词开头；统一用词 `dynamic chart`、`chart type`、`model`、`session`、`slot`、`workspace`；禁止 `engine / manager / helper / utils` 作文件名；物理量 key 逐字用库命名，其余不用缩写。**物理量的显示名字永远来自 `Quantity.label`**，应用不写；旧工具的 "Air temperature" 是错误术语，不沿用，正确的是库里的 "Dry-bulb air temperature"，要改拼写只改库一处。
- **类型优先**：封闭集合用 `as const` 对象集合；物理量、模型、标准全部从库 import 并点引用；类型从数据派生（`as const`、`satisfies`）；不用魔法字符串与松散字典；改一个名字只改一处。
- **粒度**：一个概念一个文件，100–400 行为常态；普通函数 + 数据对象优先于类层级；不为"以后可能"预留抽象；不把逻辑拆成大量微小方法。
- **Svelte 护栏**：只用 runes；ESLint 禁用 `export let`、`$:`、`on:`、`<slot>`、`<svelte:component>`；第三方库对接用 `{@attach}`；跨组件共享状态用带 `$state` 字段的 class；`$effect` 只做外部同步。
- **TypeScript 护栏**：`strict`、`erasableSyntaxOnly`、`verbatimModuleSyntax`；不用 `enum`、`namespace`、构造函数参数属性。
- **AI 工作流**：每个会话启用 Svelte MCP；生成的 `.svelte` 必须过 `svelte-autofixer`；PR 必过 typecheck + lint + build。

---

## 7. 第一阶段范围与验收标准

范围：**PMV (ISO 7730)** 与 **Adaptive (ASHRAE 55)** 两个模型；Standard + Explore；Compare 三槽位；SI/IP；切模型弹窗；Explore 阈值编辑器；Export Link；简单导出（可编辑标题 + 输入摘要 + 工具名/版本/日期页脚，PNG + SVG）。

验收：

1. 以 **UTCI** 作第三个模型接入：只新增一个声明文件 + 一行注册，其他文件零改动，且只出现在 Explore 导航（库里不挂 `standard`）。
2. 任一状态 Export Link → 新标签打开 → 状态完全一致（三槽位、单位、图表类型、阈值、气压）。
3. PMV 湿空气图合规区顶点与旧工具同输入下的顶点差 ≤ 0.01 °C。
4. 切换到范围不兼容的模型时弹窗内容与设计稿一致；无越界不弹窗。
5. 在禁用 `Proxy` 的环境下打开分享链接，摘要页列出全部输入值。
6. SI → IP → SI 来回切换后存储值不变；所有数值显示不超过两位小数且无末尾零。
7. 结果表列完全由模型声明的 `table` 决定（`table` 必填，UTCI 也声明）；任一图表只有图下方一个图例，Plotly 内置图例不出现。
8. lint 通过：无工具类越界、无 legacy 语法、`core/` 无越界 import、无 `enum`。
9. 单测覆盖：`shareLink` 编解码与迁移、`toLibraryInputs`（5 种湿度表示、operative 模式）、`numberFormat` 与单位换算、切模型继承与夹紧规则。

---

## 8. 已知风险与缓解

| 风险 | 缓解 |
|---|---|
| 库与应用并行开发，接口漂移 | 第 4.1 节即契约；库以 `0.x` 滚动发版，应用锁版本；接口改动先改本文 |
| sv-router 0.x API 变动 | 全部用法封在 `routes/navigation.ts` |
| Tailwind 4 在 2020–2023 浏览器样式不完美 | 接受；功能完整；更老浏览器有摘要页 |
| plotly 4.0 刚发布 | 只用 cartesian 子集；颜色统一十六进制 + `rgba()`；关闭云端按钮 |
| PHS 网格约 2.4 s | 保留旧图 + 计算中提示 |
| LLM 对 Svelte 5 输出退化到 Svelte 4 语法 | lint 禁用 + autofixer 强制 |
| 单人开发 | 架构先行，第一阶段用两个模型 + UTCI 验收坐实"加模型只改一处" |

---

## 9. 参考

- Svelte 5 浏览器支持下限：https://svelte.dev/docs/svelte/browser-support
- Tailwind 4 兼容性：https://tailwindcss.com/docs/compatibility
- shadcn-svelte 与 Tailwind 4 / Svelte 5：https://shadcn-svelte.com/docs/migration/tailwind-v4
- SvelteKit 3 RC（选择不用 Kit 的依据）：https://svelte.dev/blog/sveltekit-3-release-candidate
- plotly.js 4.0 迁移指南：https://plotly.com/javascript/guides/migrating-to-v4/
- TypeScript `erasableSyntaxOnly`：https://www.totaltypescript.com/erasable-syntax-only
- 现有计算库（基准测试对象）：https://www.npmjs.com/package/jsthermalcomfort
- 旧工具源码（边界求根精度出处 `static/js/psychchart.js`）：https://github.com/CenterForTheBuiltEnvironment/comfort_tool
- Bits UI：https://www.npmjs.com/package/bits-ui · sv-router：https://www.npmjs.com/package/sv-router · Comlink：https://www.npmjs.com/package/comlink · plotly cartesian 包：https://www.npmjs.com/package/plotly.js-cartesian-dist-min
