# ADR-0001 · CBE Thermal Comfort Tool 重写：技术栈与架构基线

- 状态：已达成共识（2026-09-03）
- 适用范围：v1（目标 2026-10-01），以及其后的长期维护
- 取代：原型仓库 `main repo/comfort-tool`（Svelte 5，约 49k 行）。原型因分层过多不可维护，**不复用代码，只借鉴已验证的行为**。
- 配套：计算库 `@cbe/thermalcomfort`（TypeScript，独立仓库 + npm，与本项目并行开发）。第 4 节同时给出库的公开接口契约。

---

## 1. 背景与约束

| 项 | 事实 |
|---|---|
| 团队 | v1 由 1 人开发（React 19 / Svelte 5 熟悉程度相当）；1 名强 Python 背景研究员做审查；3 年后的维护者很可能是 Python 背景研究员 + 开源社区 |
| 工作方式 | AI 大量写代码，人只做架构与审查 |
| 时间 | 2026-10-01 前交付 v1；v1 功能全集，分阶段实现，不按周排计划 |
| 后端 | 无。纯静态 SPA，先部署 Netlify |
| 计算库 | 新建 TypeScript 库，从 `pythermalcomfort` 移植，先做 1–2 个模型；库只含 comfort 模型及其全部属性；SI 单位；**不做适配器**，前端直接按第 4 节接口开发 |
| 交互 | 改一个输入图立刻跟着变；Standard / Explore 无计算按钮；Time-series 有 |
| 参考精度 | 旧工具舒适区为边界求根：RH 每 10% 一条线、温度容差 0.001 °C（`static/js/psychchart.js`） |
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
| 精度 | Standard 合规区：**边界求根**（RH 每 5%、温度容差 0.001 °C、割线法退二分法、饱和线每 0.5 °C）；Explore 场图：**100×100 网格**，所有模型统一 | 与旧工具同源且更细；PHS 约 2.4 s 时保留旧图 | 全部网格；自适应细化 |
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

| 归库（`@cbe/thermalcomfort`） | 归应用 |
|---|---|
| 物理量类型系统：单位、SI↔IP 换算、物理量定义（key、种类、标签、描述） | 显示格式化（两位小数、去尾零）、输入顺序、表示组（湿度 / 温度）的状态与切换 |
| 所有模型及其全部属性：名称、简介、所属标准、输入（物理量、硬范围、默认值）、枚举选项、输出（物理量、默认区间） | 图表数学：区域边界求根、网格扫描、所有可视化几何与规格 |
| 统一的输出格式（第 4.1.4 节）；合规判定 = 应用对输出区间的解析 | 切模型规则、分享链接、Explore 阈值编辑、单位切换、UI |
| 输入计算器（服装组合、动态预测服装、太阳得热、球温…）及其对模型的适用性 | Time-series 行编辑器与会话 |
| 批量求值；有状态模型的顺序模拟 | — |
| 湿空气函数（露点 / 湿球 / 含湿量 / 水蒸气压 ↔ RH、操作温度） | — |
| 超范围返回结果 + warnings，不抛异常；无 DOM / `node-fetch` 依赖，可在 Worker 运行 | — |

约定：库的**模型函数**只在 Worker 内 import；库的**湿空气函数与物理量定义**允许主线程 import。

---

## 4. 核心契约

### 4.0 三条贯穿全项目的规则

1. **一处定义，处处引用。** 物理量、模型、工作区、图表类型、单位制等都是对象；代码中用点引用（`quantity.dryBulbTemperature`、`Workspace.explore`），不用字符串键，不用 `Record<string, …>` 字典。
2. **字符串只出现在两个边界。** 库内部的 `Quantity.key`（如 `"tdb"`）和分享链接的序列化。前者只被库和 `shareLink.ts` 读取；后者集中在 `shareLink.ts`。
3. **可擦除语法。** 不用 `enum`、`namespace`、构造函数参数属性；封闭集合用"带 `static readonly` 实例的普通类"（枚举类），行为写成方法而不是到处 `switch`。

### 4.1 库的公开接口（契约）

#### 4.1.1 单位、物理量种类、物理量

```ts
export class Unit {
  readonly symbol: string;
  readonly step: number;                 // 该单位下输入框的增减步长（°C 0.1、°F 0.1、m/s 0.05、fpm 10…）
  toSi(value: number): number;
  fromSi(value: number): number;
}
export const unit = {
  celsius: Unit, fahrenheit: Unit, kelvin: Unit, fahrenheitDelta: Unit,
  metersPerSecond: Unit, feetPerMinute: Unit,
  percent: Unit, gramPerKilogram: Unit, grainPerPound: Unit,
  kilopascal: Unit, inchOfMercury: Unit,
  met: Unit, clo: Unit, minute: Unit, none: Unit,
} as const;

export class QuantityKind {              // 单位与换算只在这里定义一次
  readonly siUnit: Unit;
  readonly ipUnit: Unit;
}
export const kind = {
  temperature:        QuantityKind,      // celsius ↔ fahrenheit（有偏移）
  temperatureDelta:   QuantityKind,      // kelvin ↔ fahrenheitDelta（无偏移，必须与 temperature 分开）
  airSpeed:           QuantityKind,
  relativeHumidity:   QuantityKind,
  humidityRatio:      QuantityKind,
  pressure:           QuantityKind,
  metabolicRate:      QuantityKind,
  clothingInsulation: QuantityKind,
  index:              QuantityKind,      // pmv、tsv 等无量纲指数
  percentage:         QuantityKind,      // ppd
  duration:           QuantityKind,
} as const;

export class Quantity {                  // 角色无关：输入与输出共用
  readonly key: string;                  // "tdb"——库内部与序列化用，应用代码不直接写
  readonly kind: QuantityKind;
  readonly label: string;                // 短显示名："Air temperature"
  readonly description: string;          // 长说明
}
export const quantity = {
  dryBulbTemperature:            Quantity,   // tdb
  meanRadiantTemperature:        Quantity,   // tr
  operativeTemperature:          Quantity,   // top
  airSpeed:                      Quantity,   // v
  relativeAirSpeed:              Quantity,   // vr
  relativeHumidity:              Quantity,   // rh
  metabolicRate:                 Quantity,   // met
  clothingInsulation:            Quantity,   // clo
  runningMeanOutdoorTemperature: Quantity,   // t_running_mean
  atmosphericPressure:           Quantity,   // p_atm
  pmv: Quantity, ppd: Quantity, thermalSensation: Quantity,
  standardEffectiveTemperature:  Quantity,   // set
  comfortTemperature:            Quantity,   // tmp_cmf
  // 每加一个模型，缺什么量就在这里加一行；输入和输出都从这里引用
} as const;
```

应用**不重复声明物理量**，直接 `import { quantity, kind, unit } from '@cbe/thermalcomfort'`。

#### 4.1.2 值容器

```ts
export class QuantityValues {            // 以 Quantity 对象为键，没有字符串
  get(q: Quantity): number | undefined;
  set(q: Quantity, value: number): this;
  has(q: Quantity): boolean;
  entries(): Iterable<readonly [Quantity, number]>;
}
```

#### 4.1.3 输入、选项、输出规格

```ts
export class InputSpec  { readonly quantity: Quantity; readonly min: number; readonly max: number; readonly defaultValue: number; }
export class OptionValue { readonly id: string; readonly label: string; }                 // 例：AirSpeedControl.withLocalControl
export class OptionSpec<T extends OptionValue> { readonly id: string; readonly label: string; readonly values: readonly T[]; readonly defaultValue: T; }
export class Band       { readonly label: string; readonly min: number; readonly max: number; }   // ±Infinity 表示无界；下含上不含
export class OutputSpec { readonly quantity: Quantity; readonly bands: readonly Band[]; }         // bands 即 Explore 默认区间与合规解析依据
```

#### 4.1.4 统一输出格式与合规

- 每个模型的 `evaluate()` 返回 `ModelResult { values: QuantityValues; warnings: readonly Warning[] }`。
- 所有输出都是数值物理量。分类结果（如 Adaptive 的可接受等级、ISO 7730 的 A/B/C 类）编码为**整数值输出 + 带标签的 `bands`**。
- **合规判定不是独立对象**，而是应用对输出的解析：结果表的 Compliance / Zone 列 = 该输出落入的 `Band.label`。模型定义用 `complianceOutput` 指出由哪个输出承担合规列。

#### 4.1.5 模型、输入计算器、标准

```ts
export class Standard { readonly id: string; readonly name: string; static readonly ashrae55: Standard; static readonly iso7730: Standard; static readonly en16798: Standard; static readonly iso7933: Standard; }

export class InputCalculator {           // 额外的计算功能：自带小输入，算出一个值，写入某个输入量
  readonly id: string;
  readonly title: string;                // "Dynamic predictive clothing"、"Solar gain on occupants"、"Globe temperature"、"Clothing ensemble"
  readonly writes: Quantity;             // 例：quantity.clothingInsulation
  readonly inputs: readonly InputSpec[];
  compute(values: QuantityValues): number;
}

export class ModelDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly standards: readonly Standard[];
  readonly inputs: readonly InputSpec[];
  readonly options: readonly OptionSpec<OptionValue>[];    // 有无局部控制、姿势、是否适应、是否计入活动产生的风速…
  readonly outputs: readonly OutputSpec[];
  readonly complianceOutput?: OutputSpec;
  readonly inputCalculators: readonly InputCalculator[];   // 适用性由物理决定，归库
  readonly sequentialSimulation?: SequentialSimulation;   // 有状态模型（PHS）的顺序模拟；无则逐行独立
  evaluate(values: QuantityValues, options: OptionValues): ModelResult;
  evaluateMany(values: readonly QuantityValues[], options: OptionValues): readonly ModelResult[];
}
export const models = { pmvIso: ModelDefinition, adaptiveAshrae: ModelDefinition, utci: ModelDefinition, ankleDraft: ModelDefinition, /* … */ } as const;
export const psychrometrics = { /* 以 Quantity 为参数的换算函数 */ };
```

说明：

- 旧工具输入面板那组按钮的归属：`Create custom ensemble / Dynamic predictive clothing / Solar gain / Globe temp / Set pressure` → 输入计算器；`Relative air speed / Local control` → 模型选项；`Local discomfort`（踝部吹风、垂直温差）只产生输出、不改输入 → 作为普通小模型进入库，在 Explore 中可用；`Reset / Save / Reload / Share / SI-IP / Documentation` → 应用动作。
- 输入计算器语义为**一次性 Apply**：用户填计算器自己的小输入，点 Apply，结果写入目标输入；计算器不进会话状态、不进分享链接（链接只带结果值）。需要重算时再点一次。

### 4.2 应用侧枚举类

```ts
// src/core/workspace.ts
export class Workspace {
  readonly id: string; readonly pathSegment: string; readonly title: string;
  static readonly standard   = new Workspace('standard',    'standard',    'Standard');
  static readonly explore    = new Workspace('explore',     'explore',     'Explore');
  static readonly timeSeries = new Workspace('time-series', 'time-series', 'Time-series');
  static readonly all = [Workspace.standard, Workspace.explore, Workspace.timeSeries] as const;
  isAvailableFor(model: RegisteredModel): boolean {
    if (this === Workspace.explore) return true;                       // 所有模型都有 Explore（至少 dynamic chart）
    if (this === Workspace.standard) return model.definition.standards.length > 0;
    return model.timeSeries;
  }
  static fromId(id: string): Workspace | undefined;                    // 仅 shareLink / navigation 使用
}
// 同一写法：ChartType.psychrometric / .dynamic；HumidityMode.rh / .humidityRatio / .dewPoint / .wetBulb / .vaporPressure；
//          TemperatureMode.separate / .operative；UnitSystem.si / .ip；EntryGroup.humidity / .temperature
```

### 4.3 模型声明（应用侧，一个对象字面量，一个文件）

```ts
// src/models/pmvIso.ts
export const pmvIso = defineModel({
  definition: models.pmvIso,                                   // 名称、简介、输入范围、默认区间、选项、计算器全部来自库
  inputOrder: [quantity.dryBulbTemperature, quantity.meanRadiantTemperature, quantity.airSpeed,
               quantity.relativeHumidity, quantity.metabolicRate, quantity.clothingInsulation],
  entryGroups: [EntryGroup.humidity, EntryGroup.temperature],
  charts: [
    DynamicChart.withDefaultAxes(quantity.dryBulbTemperature, quantity.airSpeed),   // 每个模型必有
    PsychrometricChart.withZone(quantity.pmv),
  ],
  table: [quantity.pmv, quantity.ppd, quantity.thermalSensation, quantity.standardEffectiveTemperature],  // 结果表显示哪些库输出、按什么顺序
  timeSeries: true,
});
// src/models/index.ts
export const registeredModels = [pmvIso, adaptiveAshrae, utci] as const;   // 注册只此一行
```

规则：所有模型默认拥有 Explore 能力；Standard 能力由 `definition.standards` 非空决定；Time-series 能力由 `timeSeries` 决定。**新增轻模型 = 升库版本 + 一个声明文件 + 一行注册，其他零改动。**

结果表（`table`）：

- 只有一种表样式（原型的设计）：表头大写小号字；列多时横向滚动；Compare 开启时每个槽位一行，Baseline 决定差值高亮相对于哪一行。
- 列的构成固定为三段：**Input**（槽位名，按槽位颜色着色，总是第一列）→ **Compliance**（仅当模型有 `complianceOutput` 时出现，显示其 `Band.label`，着色为通过 / 不通过）→ **模型文件 `table` 列出的库输出**，按声明顺序，数值按 §4.6 格式化并跟随单位制。
- 未声明 `table` 时默认列出库输出顺序的全部输出。

### 4.4 图表类型（封闭集合，v1）

| 类型 | 定义 |
|---|---|
| `ChartType.psychrometric` | x = 干球温度或操作温度，y = 含湿量；RH 等值线；合规区多边形（边界求根）；三个槽位标记点 |
| `ChartType.dynamic` | x / y 可选物理量；分带等值面（100×100 网格）；标记点；**每个模型默认获得**。Adaptive 用它渲染：锁定轴 `runningMeanOutdoorTemperature × operativeTemperature`，输出为可接受等级的区间 |

参数曲线图（SET 输出、热损失）、时序折线图在需要时先加入图表库再被模型引用。`PlotlyChart.svelte` 只接收 `ChartSpec`（traces / layout / shapes 的受限子集），不 import 任何模型。

图例（Legend）规则：

- **整张图只有一个图例，统一出现在图的下方**。Plotly 自带图例关闭（`layout.showlegend = false`），不允许出现原型那样"图内一个、图下一个"的两套图例。
- 图例条目是 `ChartSpec` 的一部分：`ChartSpec.legend: readonly LegendEntry[]`，`LegendEntry { label, swatch: Swatch.fill | Swatch.line | Swatch.marker, color }`。由图表类型的规格生成函数产出，`ChartLegend.svelte` 只负责渲染，不知道模型。
- 导出图片时用同一份 `legend` 条目生成 Plotly 的横向底部图例（仅导出布局启用），保证屏幕与导出一致。

### 4.5 会话状态

```ts
class Session {                                        // Standard + Explore 共用；Time-series 另有独立会话
  workspace: Workspace; standard?: Standard; model: RegisteredModel;
  unitSystem: UnitSystem;                              // 仅显示层
  compare: { enabled: boolean; activeSlot: Slot; baselineSlot: Slot };
  slots: readonly [InputSlot, InputSlot, InputSlot];
  chartByModel: Map<RegisteredModel, ChartState>;      // 每模型记住自己的图表设置
  environment: { atmosphericPressure: number };        // "Set pressure"；影响湿度换算
}
class InputSlot {
  values: SvelteMap<Quantity, number>;                 // 规范 SI；跨模型超集包（切回时自动恢复）；不含 rh
  humidity: { mode: HumidityMode; value: number };     // 用户输入的量是真值
  temperature: { mode: TemperatureMode };
  options: SvelteMap<OptionSpec<OptionValue>, OptionValue>;
}
class ChartState {
  type: ChartType; axes: { x: Quantity; y: Quantity }; output: Quantity;
  bandsByOutput: Map<Quantity, Band[]>;                // Explore 阈值；默认取库的 OutputSpec.bands
}                                                      // 无 "show zones" 开关：合规区与分带总是绘制
class Outputs { perSlot: readonly (ModelResult | null)[]; grid: GridResult | null; stamp: number; }   // 派生，永不持久化
```

规则：

- **用户输入的量是真值。** 湿度以 `humidity` 存原值，`rh` 由纯函数 `toLibraryInputs(slot, model, environment)` 在送 Worker 前用当前 `tdb` 与气压派生（改 `tdb` 时露点不变、RH 变，与旧工具一致）；切换表示时把当前值换算到新表示。`TemperatureMode.operative` 下 `tdb = tr = 输入值`。
- Outputs 完全由 Inputs + Chart 派生，由 `state/compute.svelte.ts` 监听并写入；瞬态 UI 状态不进 Session。
- 切模型：同物理量参数保留；超出新模型硬范围的参数弹窗（标题 "Boundary Range Warning"，表格 Input / Current / Allowed range，按钮 "Yes, switch and adjust" / "No, stay here"）；无越界不弹窗；三个槽位同样处理。
- Explore 阈值：有序 `Band` 列表，下含上不含，缺口不着色；编辑器含 Add band / Reset / 删除；按（模型，输出）保存并进链接；颜色由应用按区间位置从固定色板分配，可编辑。

### 4.6 单位与数值显示

- **存储永远是 SI**，库永远以 SI 调用（即使库支持 IP 也不走那条路，保证单一路径）。
- 切换到 IP：输入框显示 `kind.ipUnit.fromSi(si)`；用户在 IP 下编辑：解析 → `toSi` → 存储。存储值保留全精度，只有显示文本被格式化；因此 SI ↔ IP 来回切换不会漂移。
- 范围、默认值、图表轴标签同样在显示边界换算。
- 步长取自**当前显示单位**的 `Unit.step`。
- 全项目一个格式化函数：最多两位小数、去掉末尾零（`26.0 → 26`，`0.51 → 0.51`，`78.80 → 78.8`）。

### 4.7 计算流水线

`Session 变化 → toLibraryInputs → compute.worker（Comlink）→ evaluate / solveZoneBoundary / evaluateGrid → Outputs（带 stamp，过期丢弃）→ ChartSpec → PlotlyChart`

- 区域边界：RH 每 5% 一条线（21 条）、温度容差 0.001 °C、割线法失败退二分法、饱和线每 0.5 °C。
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

- 只带当前模型的图表设置与当前模型声明的物理量；所有 id 来自各类的 `.id` / `Quantity.key`，解码经各类 `fromId()`；这是应用里唯一把对象转成字符串又转回来的文件。
- Time-series 路由使用 `?share=v1z.<Base64URL(deflate(JSON))>` 并含 `rows`；ES5 摘要页只解 `v1.`，对 `v1z.` 显示"时序数据省略"。
- 解析失败回退默认并提示，不白屏；schema 变更时写 `migrate(v_old → v_new)`。

### 4.9 Time-series（非第一阶段）

输入为"第 N 段 + 持续分钟数"的表格编辑器（逐行加），与 Compare 槽位概念隔离；无状态模型逐行求值、有状态模型（PHS）调用库的 `sequentialSimulation`；上限 200 行；有显式"计算"按钮；独立会话。

---

## 5. 目录结构与边界

```
src/
  core/                 纯 TS；ESLint 禁止 import svelte / state / ui
    workspace.ts  chartType.ts  unitSystem.ts  entryModes.ts      枚举类
    modelDeclaration.ts   defineModel + RegisteredModel
    libraryInputs.ts      toLibraryInputs(slot, model, environment)：表示组 → 库输入
    numberFormat.ts       两位小数、去尾零；SI/IP 显示换算
    shareLink.ts          encode / decode / migrate
    compute/  zoneBoundary.ts  grid.ts                            接收 evaluate 回调的纯算法
    charts/   chartSpec.ts（含 LegendEntry）  psychrometricChart.ts  dynamicChart.ts
  models/               每模型一个声明文件 + index.ts
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

- **命名**：组件 `PascalCase.svelte`；模块 `camelCase.ts`；函数动词开头；统一用词 `dynamic chart`、`chart type`、`model`、`session`、`slot`、`workspace`；禁止 `engine / manager / helper / utils` 作文件名；物理量 key 逐字用库命名，其余不用缩写。
- **类型优先**：封闭集合用枚举类；物理量、模型、标准全部从库 import 并点引用；类型从数据派生（`as const`、`satisfies`）；不用魔法字符串与松散字典；改一个名字只改一处。
- **粒度**：一个概念一个文件，100–400 行为常态；普通函数 + 数据对象优先于类层级；不为"以后可能"预留抽象；不把逻辑拆成大量微小方法。
- **Svelte 护栏**：只用 runes；ESLint 禁用 `export let`、`$:`、`on:`、`<slot>`、`<svelte:component>`；第三方库对接用 `{@attach}`；跨组件共享状态用带 `$state` 字段的 class；`$effect` 只做外部同步。
- **TypeScript 护栏**：`strict`、`erasableSyntaxOnly`、`verbatimModuleSyntax`；不用 `enum`、`namespace`、构造函数参数属性。
- **AI 工作流**：每个会话启用 Svelte MCP；生成的 `.svelte` 必须过 `svelte-autofixer`；PR 必过 typecheck + lint + build。

---

## 7. 第一阶段范围与验收标准

范围：**PMV (ISO 7730)** 与 **Adaptive (ASHRAE 55)** 两个模型；Standard + Explore；Compare 三槽位；SI/IP；切模型弹窗；Explore 阈值编辑器；Export Link；简单导出（可编辑标题 + 输入摘要 + 工具名/版本/日期页脚，PNG + SVG）。

验收：

1. 以 **UTCI** 作第三个模型接入：只新增一个声明文件 + 一行注册，其他文件零改动，且只出现在 Explore 导航。
2. 任一状态 Export Link → 新标签打开 → 状态完全一致（三槽位、单位、图表类型、阈值、气压）。
3. PMV 湿空气图合规区顶点与旧工具同输入下的顶点差 ≤ 0.01 °C。
4. 切换到范围不兼容的模型时弹窗内容与设计稿一致；无越界不弹窗。
5. 在禁用 `Proxy` 的环境下打开分享链接，摘要页列出全部输入值。
6. SI → IP → SI 来回切换后存储值不变；所有数值显示不超过两位小数且无末尾零。
7. 结果表列完全由模型声明的 `table` 决定（UTCI 不声明时走默认列）；任一图表只有图下方一个图例，Plotly 内置图例不出现。
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
