# CBE Thermal Comfort Tool — v1 重写计划

## Context

现仓库 `main repo/comfort-tool` 是 Svelte 5 应用，301 个文件 / 49k 行，分层过多已不可维护
（`declarations/` + `catalog/` + `state/modelRegistry/` + `engines/` 四层互相引用，
`state/modelRegistry/builder.ts` 单文件 1274 行）。ADR-0001 已达成共识：**不复用代码，
只借鉴已验证的行为**，按新架构重写，目标 2026-10-01 交付 v1。

计算逻辑外移到 fork 的 `jsthermalcomfort`（`typescript` 分支），应用只剩"声明模型 + 渲染"，
铁律是"**新增一个模型 = 一个声明文件 + 一行注册，其他文件零改动**"。

工具链不需要重搭：`refactor-draft` 分支已经是 ADR 要的 Vite 8 / TS 6 / Svelte 5.56 /
Tailwind 4 / Vitest 4 / sv-router 0.18，且 `jsthermalcomfort` 已用 `file:` 软链到 fork
（`node_modules/jsthermalcomfort` → `../../forked repo/jsthermalcomfort`）。
不可维护的是 `src/`，不是 `package.json`。

### 已拍板

| 决定 | 结论 |
|---|---|
| 起点 | 同仓库新分支 + `git rm -r src tests docs`，保留构建配置与品牌资源 |
| v1 模型范围 | ADR §7：PMV (ISO 7730) + Adaptive (ASHRAE 55)，UTCI 作架构验收 |
| 库分支 | fork 的 `typescript`（`for-new-CBE` 和 `Feature/export-model-metadata` 都是 TS 重写之前从 `main` 拉的，已废弃） |
| 输入范围/默认值/枚举 | 按 ADR §4.1.5 加进库。库侧工作用下方独立 prompt 另开对话做 |
| 湿空气图几何 | `correctKnownDefects: false` — 复现 CBE 旧工具已发布的图 |

### 库现状盘点（`typescript` @ d57c456，已逐个验证运行时导出）

**已有，直接可用：**

| ADR 条款 | 库里的实现 |
|---|---|
| §4.1.4 ModelResult | `io.pmvPpdIso/pmvPpdAshrae/adaptiveAshrae/adaptiveEn` → `.toMeasures()` → `Measure{quantity,value,unit,category,intervals}` |
| §4.1.3 Band | `reference.{isoThermalSensation, ashraeThermalSensation, adaptiveAshraeOffsets, adaptiveEnOffsets, enCategoryPmvLimits}`，`IntervalScale.classify/labelFor` |
| §4.1.1 Quantity（部分） | `io.quantities` — 12 个量，带 `key/kind/label/siUnit/ipUnit`（**只有单位符号字符串，没有换算函数**） |
| **§4.7 边界求根 + §5 `core/compute/zoneBoundary.ts`** | **`charts.psychrometricZone`（CBE 原版移植，`rhStep`/`saturationStep`/`epsilon`/`correctKnownDefects` 可配）+ `bisect`/`secant`** |
| §4.4 Adaptive 实渲染 | `charts.adaptiveAshraeZone` / `adaptiveEnZone` |
| 模型元数据（部分） | `pmv_ppd_iso.{label,description,tsv}`、`pmv_ppd_ashrae.{label,description,tsv,compliance,COMPLIANCE_LIMIT}`、`adaptive_*.{label,description,offsets}` |
| 输入计算器原料 | `clo_dynamic`、`v_relative`、`running_mean_outdoor_temperature`、`met_typical_tasks`、`clo_individual_garments` |

> **`core/compute/zoneBoundary.ts`（ADR §5）不要写**，库已经有了，`rhStep: 5` 传参即可。

**缺口（→ 全部在下方库 prompt 里）：**
输入 min/max/默认值（`ValidationRule` 声明了 `min?/max?` 但全库无一 schema 设过，
8 个 schema 全模块私有）；`ModelDefinition` / `models` 注册表 / `standards` 字段 /
inputs 与 outputs 清单；标量 `toSi/fromSi`（只有按 key 名分派的 `units_converter`，
且 `t_running_mean` 不匹配、未知 key 静默不换算、`from_units:"IP"` 意为 IP→SI）；
枚举选项的运行时值（全是 `export type`，包括被误放进 `export type {}` 块的 `Standard` 常量）。

### 两处 ADR 需要修正

1. **`epsilon` 不是温度容差。** ADR §1/§2 写"温度容差 0.001 °C"；`comfort_zone.ts` 明确
   注释这是 **PMV 残差**，CBE 原版 `"ta precision"` 注释是错的。§7 验收 #3 要重新表述。
2. **§3 与 §4.6 冲突**：§3 说单位换算归库，§4.6 说"库永远以 SI 调用，不走 IP 路径"。
   按 §4.6 执行——**应用只用 SI 调库**，`Unit.toSi/fromSi` 仅用于显示层。

---

## 本计划的用法

每个 Phase 设计成**单独开一个新 Claude 对话**执行。开新对话时先说：
"读 `docs/adr-0001-architecture.md` 和 `CLAUDE.md`，然后执行 Phase N"。

> **Phase 0 里最重要的一步是重写 `CLAUDE.md` 和 `AGENTS.md`。**
> 它们现在逐条描述的是旧架构（`src/declarations/**`、`PointSession`、
> `defineModel(library, authoring)`、`state/modelRegistry` …）。不改掉，
> 后面每一个新对话都会被旧架构带偏——这是整个流程里最贵的坑。

---

## Phase 0 · 起点

**目标**：一个能 `npm run dev` 起来的空壳，加一套指向**新**架构的 AI 上下文文件。
**前置**：无。可与 Phase 1（库）并行或先后，互不依赖。

### 已由用户手动完成 ✅

```bash
git switch -c rewrite/v1                              # 现在在 rewrite/v1
git worktree add ../comfort-tool-old refactor-draft   # 旧代码并排可查
git rm -r src tests docs
git rm postcss.config.cjs "CBE Thermal Comfort Tool.iml"
npm rm flowbite flowbite-svelte flowbite-svelte-icons plotly.js-dist-min
npm i plotly.js-cartesian-dist-min@4 comlink@4
npx shadcn-svelte@latest init     # → components.json / src/lib/utils.ts / src/app.css
```

依赖现状已确认：`plotly.js-cartesian-dist-min@4`、`comlink@4`、`shadcn-svelte@1.6`、
`clsx` / `tailwind-merge` / `tailwind-variants` / `tw-animate-css` /
`@lucide/svelte` / `@fontsource-variable/geist`、`sv-router@0.18`、
`jsthermalcomfort` 仍软链到 fork。`npm run check` / `npm run lint` 当前通过
（check 只报 "no svelte input files" 警告，因为 `src/` 还没有 `.svelte`）。

> ADR §2 写的是 pnpm。npm 已经能用且软链已生效，pnpm 是偏好不是需求。
> 想换只在这一步换（`rm package-lock.json && pnpm import && pnpm i`），
> 中途换会同时动 lockfile 和 `file:` 软链语义。

### 0.1–0.4 已完成 ✅

- `svelte.config.js` 去掉 init 追加的 SvelteKit 片段（现在与 HEAD 一致）
- `$lib` 统一指向 `src/`（`tsconfig.json` + `vite.config.js`）；`components.json` 的
  `ui` 别名改为 `$lib/ui/primitives`、`utils` 改为 `$lib/ui/primitives/cn`；
  `src/lib/` 已删除，不再有第二套别名
- **`src/app.css` 补全**：init 只写了 `@apply` 区块，缺 `@import "tailwindcss"` 和
  全部颜色 token（`shadcn-svelte/tailwind.css` 只含 keyframes 与 custom variant，
  不含 token），构建报 `Cannot apply unknown utility class 'border-border'`。
  已从 shadcn registry 的 neutral base color 生成完整 `:root` / `.dark` / `@theme inline`
- `vite.config.js` 删 flowbite 死码，`manualChunks` 改指 `plotly.js-cartesian-dist-min`
- `tsconfig.json` 加 `erasableSyntaxOnly` + `verbatimModuleSyntax`
- `.nvmrc` → 24，`engines.node` → `>=24`
- `npm test` 加 `--passWithNoTests`（骨架期无测试文件；Phase 2 落地真测试后此标志无实际作用）
- `eslint.config.js` 整份重写为新架构边界
- `src/main.ts` / `src/App.svelte` / ADR §5 目录骨架已建
- `docs/adr-0001-architecture.md`、`REWRITE-PLAN.md`、`CLAUDE.md`、`AGENTS.md`、
  `README.md` 已改为指向新架构

**ESLint 边界规则已实测**（用会违规的探针文件验证，跑完即删）：

| 探针 | 结果 |
|---|---|
| `src/core/*.ts` import `svelte` | ✅ 报错 |
| `src/core/*.ts` 出现字面量 `"tdb"` | ✅ 报错 |
| `src/models/*.ts` import `jsthermalcomfort/models` | ✅ 报错 |
| `src/ui/charts/*.svelte` import 模型 | ✅ 报错 |
| `src/ui/outputs/*.svelte` 用 `class="p-4 flex"` | ✅ 报错 |
| `src/ui/layout/*.svelte` 用 `class="flex gap-2"` | ✅ 不报错（允许） |
| `src/workers/*.ts` import `jsthermalcomfort/models` | ✅ 不报错（允许） |

> **ESLint flat config 的坑（踩过一次）**：同名规则在后面的匹配块里是**替换**不是合并。
> 第一版把 `core/` 边界和 Tailwind 限制写成独立块，被后面匹配 `src/**/*.{ts,svelte}` 的
> `no-restricted-imports` / `no-restricted-syntax` 整块覆盖，**静默失效**，探针跑出来
> 5 条只报了 3 条。现在用片段数组组合，每个收窄的块都重复它仍然需要的片段。
> **以后加规则一律先写探针验证它真的会报错**，不要假设生效。

**完成判据（已达成）**：`npm run check` / `lint` / `build` / `test` 四个全过。
`src/App.svelte` 现在不带 Tailwind 工具类——它是业务组件，间距等 Phase 2 的
`ui/layout/` 落地后从 `Stack` / `Grid` / `Inline` 拿。

**尚未做**：`git add` + commit（按仓库规矩，git 写操作由你执行）。

---

## Phase 1 · 库合约（在 fork 仓库做，与应用解耦）

**目标**：库导出 ADR §4.1 的完整声明式合约，只覆盖 `pmv_ppd_iso` 和 `adaptive_ashrae`。
**在哪做**：`/Users/yehuihuang/SoftwareProjects/USYD/forked repo/jsthermalcomfort`，
从 `typescript` 开 `feat/model-definition`。
**注意**：应用消费的是构建产物 `lib/esm/`，不是 `src/`——库每改一次都要在 fork 里
`npm run build`，应用才看得到。

下面整段可以直接贴进一个新对话（cwd 设在 fork 仓库）：

````text
仓库：/Users/yehuihuang/SoftwareProjects/USYD/forked repo/jsthermalcomfort
分支：从 typescript (HEAD d57c456) 开 feat/model-definition
参考：/Users/yehuihuang/SoftwareProjects/USYD/main repo/comfort-tool/docs/adr-0001-architecture.md 第 4.1 节

背景：这个库要给一个正在重写的 Svelte 前端（CBE Thermal Comfort Tool）当唯一计算源。
前端的铁律是"新增一个模型 = 一个声明文件 + 一行注册"，所以模型的全部可声明信息必须
从库里读出来，前端不硬编码任何数字、标签或范围。现在缺的就是这一层。

【已有，不要重复造】
- src/io/quantity.ts        quantities（12 个量，key/kind/label/siUnit/ipUnit）、unitFor
- src/io/measure.ts         Measure / ComfortInterval
- src/io/classes_input.ts   BaseInputs / PmvPpdInputs / PmvPpdAshraeInputs / AdaptiveInputs
- src/io/classes_return.ts  *Outputs + .toMeasures()
- src/reference/            isoThermalSensation / ashraeThermalSensation /
                            adaptiveAshraeOffsets / adaptiveEnOffsets /
                            enCategoryPmvLimits / IntervalScale / LabeledInterval
- src/charts/               psychrometricZone / adaptiveAshraeZone / adaptiveEnZone /
                            bisect / secant
- 模型函数属性              pmv_ppd_iso.{label,description,tsv}、
                            pmv_ppd_ashrae.{label,description,tsv,compliance,COMPLIANCE_LIMIT}、
                            adaptive_{ashrae,en}.{label,description,offsets}

【要新增：ADR §4.1 合约，新建 src/io/model.ts，并从 src/io/index.ts 与 src/index.ts 导出】

1. Unit —— readonly symbol: string; readonly step: number;
   toSi(v: number): number; fromSi(v: number): number;
   导出 unit 常量集：celsius / fahrenheit / kelvin / fahrenheitDelta /
   metersPerSecond / feetPerMinute / percent / met / clo / none。
   step 是输入框增量：°C 0.1、°F 0.1、m/s 0.05、fpm 10、% 1、met 0.1、clo 0.1。
   注意 temperature 有偏移、temperatureDelta 无偏移，两者必须分开。
   不要复用 units_converter：它按 key 名分派、未知 key 静默不换算、
   t_running_mean 不匹配任何分支、且 from_units:"IP" 的含义是 IP→SI。

2. QuantityKind —— readonly siUnit: Unit; readonly ipUnit: Unit;
   导出 kind 常量集，至少覆盖：temperature / temperatureDelta / airSpeed /
   relativeHumidity / metabolicRate / clothingInsulation / index / percentage。
   现有 src/io/quantity.ts 的 QuantityKind 是字符串联合、Quantity 带的是单位符号
   字符串。请让新的 Quantity.kind 指向这个对象，并保留 siUnit/ipUnit 字符串字段
   不动（README 和现有测试依赖它们），不要做破坏性改名。

3. InputSpec  { quantity: Quantity; min: number; max: number; defaultValue: number }
   OptionValue { id: string; label: string }
   OptionSpec  { id: string; label: string; values: readonly OptionValue[]; defaultValue: OptionValue }
   Band        { label: string; min: number; max: number }   // ±Infinity 表无界
   OutputSpec  { quantity: Quantity; bands: readonly Band[] }
   Standard    { id: string; name: string }，带 static readonly ashrae55 / iso7730 /
               en16798 / iso7933。
   注意：src/utilities/utilities.ts:74 已有一个运行时 Standard 常量，但
   src/utilities/index.ts:19 把它放进了 export type {} 块，所以只有类型逃出去了。
   顺手修掉这个导出 bug，并让新的 Standard 与它的 id 对齐（check_standard_compliance 吃它）。

4. ModelDefinition
   { id, name, description, standards: readonly Standard[],
     inputs: readonly InputSpec[], options: readonly OptionSpec[],
     outputs: readonly OutputSpec[], complianceOutput?: OutputSpec,
     evaluate(values: ReadonlyMap<Quantity, number>, options: OptionValues): ModelResult }
   ModelResult { values: ReadonlyMap<Quantity, number>; warnings: readonly string[] }
   evaluate 内部就是包一层现成的 io.pmvPpdIso / io.adaptiveAshrae，永远以 SI 调用
   （units: "SI"），warnings 来自现有的 warning 通道。
   导出注册表：export const models = { pmvIso, adaptiveAshrae } as const;

5. 只做 pmv_ppd_iso 和 adaptive_ashrae 两个模型。其余六个先不管。

【范围数字的来源】
- 适用性限值现在硬编码在 src/utilities/utilities.ts 的私有分支函数里：
  ISO 约 140-212 / 269-296 行（tdb 10..30、tr 10..40、v/vr 0..1、met 0..4、clo 0..2），
  ASHRAE 约 140-212 行（tdb/tr 10..40、v/vr 0..2、met 1..4、clo 0..1.5）。
  把这些提成可导出的数据，InputSpec.min/max 从它们来，不要再抄一遍数字。
- adaptive 的 running-mean 限值 10.0..33.5 现在是 src/io/classes_return.ts:378 的
  裸字面量。导出成 adaptive_ashrae.t_running_mean_limits = { min: 10, max: 33.5 }
  （旧的 Feature/export-model-metadata 分支就是这么做的，TS 重写时丢了）。
- defaultValue 库里没有先例，用 CBE 旧工具的默认值：
  tdb 25、tr 25、v 0.1、rh 50、met 1.1、clo 0.5、t_running_mean 20。

【顺手修的两个小缺口】
- adaptiveAshraeOffsets / adaptiveEnOffsets 现在只有 label（"80%"、"Category I"），
  旧分支还带 id（"80"、"cat_i"）与结果字段名 tmp_cmf_80_low 对齐。把 id 加回来，
  否则消费方只能对 "80%" 做字符串处理。
- src/utilities/index.ts 补齐 valid_range 的值导出（现在只在模块里导出，barrel 没有）。

【不要做】
- InputCalculator、sequentialSimulation、evaluateMany、QuantityValues 包装类——
  这两个模型一个都用不上，等 solar gain / PHS 落地再加。evaluate 直接收
  ReadonlyMap<Quantity, number>，消费方本来就用 SvelteMap 存。
- 不要改任何模型函数的签名或返回值。tests/baseline.test.ts 逐字节钉住了它们。
- 不要用 enum / namespace / 构造函数参数属性（ADR §4.0 第 3 条）。
  封闭集合用"带 static readonly 实例的普通类"。

【完成判据】
- npm run typecheck / lint / test 全过，tests/baseline.test.ts 零改动通过
- npm run build 成功
- 写一个 tests/model_definition.test.ts：遍历 models，断言每个模型的
  inputs 都有有限的 min/max/defaultValue、outputs 非空、standards 非空，
  且 evaluate 的结果与直接调用 io.pmvPpdIso 的数值逐位相同
- 一个 20 行脚本能做到：import { models } → 读 inputs 的 min/max/defaultValue →
  evaluate → 拿到 ModelResult → 调 charts.psychrometricZone，全程不需要前端存在
````

---

## Phase 2 · 骨架与第一个能用的画面

**目标**：Standard 页面，单槽位，PMV (ISO 7730)，输入面板 → 结果表，SI/IP 都能用。没有图表。
**前置**：Phase 0 和 Phase 1 都完成，且 fork 已 `npm run build`。

按顺序建：

1. `src/core/` 枚举类（ADR §4.2）：`workspace.ts`、`chartType.ts`、`unitSystem.ts`、
   `entryModes.ts`。全部是"带 `static readonly` 实例的普通类" + `fromId()`。
2. `src/core/modelDeclaration.ts`：`defineModel` + `RegisteredModel`。
3. `src/models/pmvIso.ts`（ADR §4.3 的形状）+ `src/models/index.ts`（一行注册）。
4. `src/core/numberFormat.ts`：最多两位小数、去尾零（`26.0→26`、`78.80→78.8`）。全项目唯一。
5. `src/core/libraryInputs.ts`：`toLibraryInputs(slot, model, environment)`——把表示制
   （5 种湿度、operative 模式）折算成库要的 SI 输入。纯函数，先写测试。
6. `src/state/session.svelte.ts`：ADR §4.5 的 `Session` / `InputSlot`（先只用 slot 0）。
7. `src/ui/inputs/` 输入面板 + `src/ui/outputs/ResultTable.svelte`（ADR §4.3 的三段：
   Input / Compliance / 模型 `table` 列出的输出）。
8. `src/routes/navigation.ts`（sv-router 唯一使用处）+ `/standard/ashrae-55/pmv-iso/`。
9. SI/IP 切换：存储永远 SI，只有显示文本换算，步长来自当前显示单位的 `Unit.step`。

**完成判据**
- 改一个输入立刻出数，无计算按钮
- SI → IP → SI 往返后存储值不变，显示不超两位小数、无尾零
- 超出硬范围描红、不计算、保留上一个有效值
- `core/` 里没有 `import` 任何 `svelte` / `state` / `ui`（lint 规则拦住）
- `numberFormat` 和 `toLibraryInputs` 有单测

---

## Phase 3 · 图表

**目标**：湿空气图 + dynamic chart 都能画，Explore 的 100×100 网格不卡界面。
**前置**：Phase 2。

1. `src/core/charts/chartSpec.ts`：`ChartSpec { traces, layout, shapes, legend }`，
   `LegendEntry { label, swatch, color }`。
2. `src/ui/charts/PlotlyChart.svelte`：`{@attach}` 挂载，**只吃 `ChartSpec`，不 import 任何模型**。
3. `src/ui/charts/ChartLegend.svelte`：**整张图只有一个图例，统一在图下方**；
   Plotly 自带图例关掉（`layout.showlegend = false`）。导出图片时用同一份 `legend` 数据
   生成 Plotly 横向底部图例，保证屏幕与导出一致。
4. `src/core/charts/psychrometricChart.ts`：调 `charts.psychrometricZone`，
   `rhStep: 5`、`correctKnownDefects: false`（已拍板：复现旧图）。
   **不要自己写求根**。
5. `src/core/charts/dynamicChart.ts`：x/y 可选物理量，100×100 网格。
6. `src/workers/compute.worker.ts` + Comlink，主线程按 stamp 丢弃过期结果。
   触发点：ADR §4.7 自己的数据说 PMV 含冷却效应 43 µs/次 → 100×100 = 0.43 s，
   这一步之前先同步跑，实测卡了再接 Worker——先有能画出来的图，再谈异步。
7. plotly 4.0 三件事：`config.showSendToCloud = false` 并精简 modebar；
   颜色统一十六进制 + `rgba()`（culori 不再接受小数 `rgb()`）；不装 `@types/plotly.js`。

**完成判据**
- PMV 湿空气图舒适区顶点与旧工具（`../comfort-tool-old/`）同输入下差 ≤ 0.01 °C
- 任一图只有图下方一个图例，Plotly 内置图例不出现
- 缩放/平移可用；网格计算 > 300 ms 时显示"计算中"并保留旧图

---

## Phase 4 · 第二个模型 ← 架构验收，不过就不往下走

**目标**：加 Adaptive (ASHRAE 55)。
**前置**：Phase 3。库侧需要 `models.adaptiveAshrae`（Phase 1 已含）。

只允许动两个文件：新建 `src/models/adaptiveAshrae.ts`，在 `src/models/index.ts` 加一行。
Adaptive 用 `ChartType.dynamic` 实渲染，锁定轴
`runningMeanOutdoorTemperature × operativeTemperature`，输出是可接受等级区间
（`charts.adaptiveAshraeZone`）。

**完成判据（这是全计划最硬的一条）**
`git diff --stat` 只有 `src/models/adaptiveAshrae.ts` 和 `src/models/index.ts`。
**动到第三个文件就停下来改架构**——第四周改比第十周改便宜一个数量级。

---

## Phase 5 · Compare / Explore / 分享导出

**目标**：ADR §7 第一阶段功能圈闭。
**前置**：Phase 4 通过。

1. Compare 三槽位 + baseline：`ResultTable` 每槽位一行，baseline 决定差值高亮相对谁；
   槽位色贯穿输入面板、表、图上的标记点。
2. 跨模型切换弹窗（ADR §4.5）：同物理量参数保留，超出新模型硬范围才弹
   "Boundary Range Warning"（表格 Input / Current / Allowed range，
   按钮 "Yes, switch and adjust" / "No, stay here"），无越界不弹。
3. Explore 阈值编辑器：有序 `Band` 列表，含下不含上，缺口不着色，
   Add band / Reset / 删除，按（模型，输出）保存并进链接；颜色由应用按区间位置
   从固定色板分配、可编辑。**没有 "show zones" 开关**——合规区与带总是绘制。
4. `src/core/shareLink.ts`：`?share=v1.<Base64URL(JSON)>`，schema 见 ADR §4.8。
   **全项目只有这个文件读写字符串 id**（`Quantity.key`、各枚举类的 `.id` / `fromId()`）。
   解析失败退默认并提示，不白屏。
   跳过：`migrate()`（v1 没有可迁移的来源，等 v2 再写）、`v1z.` deflate + `fflate`
   （跟 Time-series 一起，见下）。
5. Export Link + 导出图片：可编辑标题 + 输入摘要 + 工具名/版本/日期页脚，PNG + SVG。

**完成判据**
- 任一状态 Export Link → 新标签打开 → 状态完全一致（三槽位、单位、图表类型、阈值、数字）
- 禁用 `Proxy` 的环境下打开分享链接不崩

---

## Phase 6 · UTCI 验收 + v1 收尾

**目标**：ADR §7 验收 #1，然后收口。
**前置**：Phase 5。

1. 库侧：把 `utci` 从 `main` 分支的 JS 移植进 `typescript` 的 TS
   （多项式，无状态，是 8 个已移植模型之外最便宜的一个），补上 `ModelDefinition`。
2. 应用侧：**只加 `src/models/utci.ts` + 一行注册**，其他文件零改动，且只出现在
   Explore 导航（`standards` 为空）。
3. 跑完 ADR §7 的八条验收（第 3 条按上面的修正表述：比对顶点几何，
   不是"温度容差 0.001 °C"）。
4. gtag 一行，路由变化时手动发 `page_view`，`page_location` 去掉查询串
   （不把分享载荷发给 Google）。
5. 合并回 `main`，删 `git worktree`。

**v1 之后**：其余 5 个模型（heat_index / humidex / wind_chill / PHS / adaptive_en，
每个 = 库移植 + 一个声明文件 + 一行注册）→ Time-series + PHS + `v1z.` 压缩
→ ES5 摘要页（依赖 share schema 冻结，所以排在最后）→ UI/e2e/视觉测试。

---

## 关键约束（每个新对话都要带上）

**导入方向（做成 ESLint 规则，Phase 0 配）**
- `src/core/**` 不得 import `svelte` / `src/state` / `src/ui`——纯 TS，可在 node 里跑
- `src/ui/charts/PlotlyChart.svelte` 不得 import 任何模型，只吃 `ChartSpec`
- Tailwind 工具类**只允许**出现在 `src/ui/primitives/`（shadcn CLI 生成，不改）
  和 `src/ui/layout/`（`Stack`/`Grid`/`Inline`，gap 走 props）；其他目录出现即报错

**唯一入口**
- 库的**模型函数**只在 `src/workers/compute.worker.ts` 里 import；
  库的**湿空气函数与物理量定义**允许主线程 import
- 字符串 id 只出现在两处：库内部的 `Quantity.key`，和 `src/core/shareLink.ts`
- 单位换算只在 `src/core/units.ts`（消费库的 `Unit.toSi/fromSi`）；存储永远 SI
- 数值格式化只在 `src/core/numberFormat.ts`

**语法**
- 只用 runes；ESLint 禁 `export let` / `$:` / `on:` / `<slot>` / `<svelte:component>`
- 禁 `enum` / `namespace` / 构造函数参数属性（`erasableSyntaxOnly`）
- 封闭集合用带 `static readonly` 实例的普通类，行为做成方法而不是到处 `switch`
- 生成的 `.svelte` 过一遍 `svelte-autofixer`（Svelte MCP 已装）

**别写的东西**（库已有或用不上）
`core/compute/zoneBoundary.ts`、任何自己实现的求根、任何抄下来的分级阈值数字、
`InputCalculator`、`sequentialSimulation`、`evaluateMany`、`migrate()`、`fflate`。

## 验证

每个 Phase 结束跑：

```bash
npm run check && npm run lint && npm run build && npm test
```

行为对照（Phase 3 起）：

```bash
cd ../comfort-tool-old && npm i && npm run dev   # 旧工具跑在另一个端口
```

同输入下逐项对比：结果表数值、湿空气图舒适区顶点（≤ 0.01 °C）、
Adaptive 区间边界、SI/IP 往返。

Phase 4 的架构验收用 `git diff --stat` 判定，Phase 6 的 UTCI 验收同样。
两次都不通过就停下来改架构，不要绕过去。
