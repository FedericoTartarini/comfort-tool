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
| 库 / 应用边界（2026-09-03） | 判据"pythermalcomfort 会不会带"（ADR §3）。适用范围 → 库 `reference/`；步长、单位换算、默认值、选项文案、路由路径段、`ModelDefinition` → 应用。库侧工作用下方独立 prompt 另开对话做 |
| 第二轮（2026-09-03） | 限值在库里做 source 不做 mirror；所属标准进库 `reference.standards` + `model.standard`，应用只加路径段；封闭集合改 `as const` 对象集合，不用枚举类；operative 模式用 `t_o` 量 + `psychrometricZone.trFollowsDb`；物理量名字只来自 `Quantity.label` |
| 湿空气图几何 | `correctKnownDefects: false` — 复现 CBE 旧工具已发布的图 |

### 库现状盘点（`typescript` @ d57c456，已逐个验证运行时导出）

**已有，直接可用：**

| ADR 条款 | 库里的实现 |
|---|---|
| §4.1.3 Measure | `io.pmvPpdIso/pmvPpdAshrae/adaptiveAshrae/adaptiveEn` → `.toMeasures()` → `Measure{quantity,value,unit,category,intervals}` |
| §4.1.2 分级尺度 | `reference.{isoThermalSensation, ashraeThermalSensation, adaptiveAshraeOffsets, adaptiveEnOffsets, enCategoryPmvLimits}`，`IntervalScale.classify/labelFor` |
| §4.1.1 Quantity | `io.quantities` — 12 个量，带 `key/kind/label/siUnit/ipUnit`。单位只是符号字符串，这就够了：换算归应用 |
| **§4.7 边界求根 + §5 `core/compute/zoneBoundary.ts`** | **`charts.psychrometricZone`（CBE 原版移植，`rhStep`/`saturationStep`/`epsilon`/`correctKnownDefects` 可配）+ `bisect`/`secant`** |
| §4.4 Adaptive 实渲染 | `charts.adaptiveAshraeZone` / `adaptiveEnZone` |
| 模型元数据（部分） | `pmv_ppd_iso.{label,description,tsv}`、`pmv_ppd_ashrae.{label,description,tsv,compliance,COMPLIANCE_LIMIT}`、`adaptive_*.{label,description,offsets}` |
| 输入计算器原料 | `clo_dynamic`、`v_relative`、`running_mean_outdoor_temperature`、`met_typical_tasks`、`clo_individual_garments` |

> **`core/compute/zoneBoundary.ts`（ADR §5）不要写**，库已经有了，`rhStep: 5` 传参即可。

**缺口（→ 下方库 prompt）：**
适用范围只硬编码在 compliance 函数里，还嵌在 warning 文案里，没有数据导出（`utilities.ts`
第 275 行附近的注释已承诺 `reference/limits.ts` 记录 ISO met 下限的差异，但那个文件目前只有
EN 类别限值）；模型不声明所属标准，标准只在 `label` 字符串里，`pmv_ppd` 的 `standard`
参数是计算变体选择器，`utilities.Standard` 是 compliance 分派键，都不是归属；
`quantities` 缺 `t_o`（operative temperature，operative 模式的输入量与图轴）与 `p_atm`
（Phase 5 气压）；`psychrometricZone` 只接受固定 `tr`，表达不了 operative 模式的 `tr = db`
（旧原型 `declarations/pmv/calculation.ts:77` 的 `psychrometricTrEqualsTdb`）；
`Standard` 常量被放进 `export type {}` 块、`valid_range` 没进 barrel。

原以为的其他缺口（`Unit/toSi/fromSi/step`、`ModelDefinition` 注册表、`OptionSpec`、
`defaultValue`、`inputs/outputs` 清单、offsets 加 `id`）经 2026-09-03 边界复审全部归应用
或不需要，见 ADR §3 / §4.1.5。决定性证据：库的 IP 风速单位是 fps，CBE 工具显示 fpm，
显示单位本来就不是库的事。

### 两处 ADR 修正（已改入 ADR）

1. **`epsilon` 不是温度容差。** `comfort_zone.ts` 明确注释这是 **PMV 残差**，CBE 原版
   `"ta precision"` 注释是错的。ADR §1 / §2 / §4.7 已改。
2. **§3 与 §4.6 冲突**已解：单位换算归应用 `core/units.ts`，是 ADR §3 明写的例外；
   应用只用 SI 调库。

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
| `src/core/*.ts` 出现字面量 `"tdb"` / `"t_running_mean"` | ✅ 报错（key 列表从 `io.quantities` 读，库加量不用改 lint） |
| `src/models/*.ts` import `jsthermalcomfort/models` | ✅ 不报错（2026-09-03 起允许：声明文件绑 `run`、读元数据） |
| `src/state/*.ts` import `jsthermalcomfort/models` | ✅ 报错 |
| `src/core/*.ts` import `jsthermalcomfort/io` | ✅ 不报错（`io.quantities` 随处可用） |
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

## Phase 1 · 库侧缺口（在 fork 仓库做，与应用解耦）

**目标**：补应用依赖的四样缺口：适用范围数据（source，不是 mirror）、所属标准、
两个缺的物理量、`psychrometricZone` 的 operative 模式。只覆盖 `pmv_ppd_iso` 和 `adaptive_ashrae`。
**边界**：ADR §3 判据。库只加"另一个工具也需要一模一样的值"的东西；步长、默认值、
选项文案、路由路径段、`ModelDefinition` 都不进库。
**在哪做**：`/Users/yehuihuang/SoftwareProjects/USYD/forked repo/jsthermalcomfort`，
从 `typescript` 开 `feat/applicability-limits`。工作树上有 87 个文件的 staged 改动
（删 docs 主题等），先提交或 stash 再开分支。
**注意**：应用消费的是构建产物 `lib/esm/`，不是 `src/`——库每改一次都要在 fork 里
`npm run build`，应用才看得到。

下面整段可以直接贴进一个新对话（cwd 设在 fork 仓库）：

````text
仓库：/Users/yehuihuang/SoftwareProjects/USYD/forked repo/jsthermalcomfort
分支：从 typescript (HEAD d57c456) 开 feat/applicability-limits
参考：/Users/yehuihuang/SoftwareProjects/USYD/main repo/comfort-tool/docs/adr-0001-architecture.md 第 3 节与 4.1 节

背景：这个库是 pythermalcomfort 的 TypeScript 移植，是通用库；正在重写的 CBE Thermal
Comfort Tool 只是它的一个消费者。判据：只加"另一个设计完全不同的工具用同一个模型也
需要一模一样的值"的东西。UI 步长、默认值、选项文案、导航分组、注册表都不进库。

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

【要做的五件事】

1. 适用范围导出成数据，并让它成为唯一来源。放 src/reference/limits.ts
   （现在只有 enCategoryPmvLimits）。
   - 形状：readonly { quantity: Quantity; min: number; max: number }[]，
     quantity 引用 src/io/quantity.ts 的对象。按 Quantity 对象键控，不按字符串。
   - 三张表：
     iso7730PmvLimits        tdb 10..30、tr 10..40、v 与 vr 0..1、met 0..4、clo 0..2
     ashrae55PmvLimits       tdb 与 tr 10..40、v 与 vr 0..2、met 1..4、clo 0..1.5
     ashrae55AdaptiveLimits  tdb 与 tr、v 同 ASHRAE，t_running_mean 10..33.5
     数字来源：src/utilities/utilities.ts 的 _iso_compliance / _ashrae_compliance，
     src/models/adaptive_ashrae.ts 第 200 行。不要凭记忆写，逐条对照代码。
   - Source, not mirror：改 _iso_compliance / _ashrae_compliance 和 adaptive_ashrae 第 200 行，
     让它们从表里读 min/max，warning 文案也从表里模板化。数值结果不变。
     先看 tests/baseline.test.ts 与 tests/utilities/ 有没有逐字钉 warning 文案；有就让模板
     逐字复现（现有文案用 "ºC" 这个字符、"10.0 and 33.5" 这种写法，都要保住）。
     这与 offsets.ts 的 "Mirror, not source" 不同：offsets 涉及模型内核里的 t_cmf ± 3.5，
     这次不动；限值只在检查函数里，可以做成 source。
   - ISO met 下限：代码是 0，文档是 0.8，baseline 钉住 0。表里写 0，注释记录 0.8。
     utilities.ts 第 275 行附近的注释已经承诺 limits.ts 记录这个差异，这次兑现。
   - tests/reference.test.ts 加断言：对每张表的每一行，取 min - 0.01 和 max + 0.01 喂
     check_standard_compliance 必须产生 warning，取 min 和 max 本身必须不产生。
   - 挂到模型函数上：pmv_ppd_iso.limits、pmv_ppd_ashrae.limits、adaptive_ashrae.limits，
     与 .label / .tsv 同一个模式；三张表也从 src/reference/index.ts 导出。
   - 循环依赖：models 已经 import reference（bands / offsets），io/classes_return 又
     import models，utilities 被 models import。limits.ts 只能 import "../io/quantity.js"
     这个叶子模块，不能 import "../io/index.js"；utilities.ts import limits.ts 前先确认
     io/quantity.ts 对 utilities 只有 type import（现在是），否则会成环。

2. 所属标准导出成数据。新建 src/reference/standards.ts：
   - export interface StandardRef { readonly id: string; readonly name: string }
   - export const standards = {
       iso7730:  { id: "iso7730",  name: "ISO 7730" },
       ashrae55: { id: "ashrae55", name: "ASHRAE 55" },
       en16798:  { id: "en16798",  name: "EN 16798-1" },
     } as const satisfies Record<string, StandardRef>
   - 挂到模型函数上：pmv_ppd_iso.standard = standards.iso7730、
     pmv_ppd_ashrae.standard = standards.ashrae55、adaptive_ashrae.standard = standards.ashrae55、
     adaptive_en.standard = standards.en16798。set_tmp / two_nodes / cooling_effect / pmv_ppd 不挂。
   - 名字不要叫 Standard：src/utilities/utilities.ts 第 74 行已有一个 Standard，那是
     check_standard_compliance 的分派键（含 FAN_HEATWAVES、ANKLE_DRAFT），语义不同，不合并。
   - 从 src/reference/index.ts 导出 standards 与 StandardRef。

3. 补两个物理量到 src/io/quantity.ts 的 quantities：
   - t_o：operative temperature，kind "temperature"，键名对齐 psychrometrics 的 t_o，
     label "Operative temperature"，单位同 tdb。
   - p_atm：atmospheric pressure，新 kind "pressure"（QuantityKind 联合类型加一个成员），
     label "Atmospheric pressure"，siUnit "kPa"；ipUnit 对齐 units_converter 现有的
     pressure 分支约定，没有就与 SI 相同。
   README 里 quantities 的计数如果写死了，一并更新。

4. psychrometricZone 加 operative 模式。src/charts/comfort_zone.ts 的
   PsychrometricZoneOptions 加 readonly trFollowsDb?: boolean（默认 false）。
   为 true 时求解函数里调 pmv_ppd(db, db, vr, rh, met, clo, wme, standard, ...)，
   即 tr 沿 x 轴跟随 db；此时 options.tr 被忽略，文档写明。
   这是 CBE 工具 psychtop 图的几何，旧原型
   /Users/yehuihuang/SoftwareProjects/USYD/main repo/comfort-tool-old/src/declarations/pmv/calculation.ts
   第 77 行的 psychrometricTrEqualsTdb 就是这个开关。
   tests/charts.test.ts 加：trFollowsDb: true 时，多边形上每个已求解顶点用
   pmv_ppd(db, db, ...) 复算，|pmv| 与 pmvLimit 之差在 epsilon 量级内。

5. 两处 housekeeping：
   - src/utilities/index.ts 把 Standard 从 export type {} 块挪到值导出
     （utilities.ts 第 74 行是运行时常量，现在只有类型逃出去了）。
   - src/utilities/index.ts 补 valid_range 的值导出（模块里导出了，barrel 没有）。

【不要做】
- Unit / step / toSi / fromSi、QuantityKind 对象化、InputSpec / OptionSpec / Band /
  OutputSpec、路由路径段、ModelDefinition / models 注册表 / evaluate(Map)、
  defaultValue、offsets 加 id。这些经 2026-09-03 边界复审全部归应用（ADR §3 / §4.1.5）。
- 不要改任何模型函数的签名或返回值。tests/baseline.test.ts 逐字节钉住了它们。
- 不要用 enum / namespace / 构造函数参数属性。

【完成判据】
- npm run typecheck / lint / test 全过，tests/baseline.test.ts 零改动通过
- npm run build 成功
- tests/reference.test.ts 的边界探针断言通过；tests/charts.test.ts 的 trFollowsDb 断言通过；
  每个挂了 standard 的模型，其 standard 与 reference.standards 的成员是同一对象
- 一个 15 行 node 脚本能做到：import { pmv_ppd_iso, io, charts } →
  读 pmv_ppd_iso.standard.name → 从 pmv_ppd_iso.limits 取 tdb 的范围 →
  io.pmvPpdIso({...}).toMeasures() → charts.psychrometricZone({ trFollowsDb: true, ... })，
  全程不需要前端存在
````

---

## Phase 2 · 骨架与第一个能用的画面

**目标**：Standard 页面，单槽位，PMV (ISO 7730)，输入面板 → 结果表，SI/IP 都能用。没有图表。
**前置**：Phase 0 和 Phase 1 都完成，且 fork 已 `npm run build`。

按顺序建：

1. `src/core/` 封闭集合（ADR §4.2）：`workspace.ts`、`chartType.ts`、`unitSystem.ts`、
   `entryModes.ts`。全部是 `as const` 对象集合 + 派生联合类型 + `xxxFromId()` 普通函数，
   和库的 `quantities` 同一写法，不用类。`entryModes.ts` 的 `temperatureMode` 带 `panel`
   和 `axis` 两个 Quantity 字段（separate → `tdb`/`tr` 与 `tdb`，operative → `t_o` 与 `t_o`）。
   `standard.ts`：以 `reference.standards` 对象为键的路径段表 + `pathSegmentFor` / `standardFromPath`。
2. `src/core/units.ts`：`DisplayUnit { symbol, step, toSi, fromSi }` +
   `displayUnitFor(quantity, unitSystem)`，按 `Quantity.kind` 查表：temperature °C 0.1 / °F 0.1，
   airSpeed m/s 0.05 / fpm 10，percentage % 1，metabolicRate met 0.1，clothingInsulation clo 0.1，
   thermalSensation 无单位 0.1，pressure kPa 0.1 / inHg 0.01。换算公式写在这里（ADR §3 例外），
   `satisfies Record<QuantityKind, …>` 保证库加 kind 时这里编译报错。先写测试：°C↔°F、m/s↔fpm 往返。
3. `src/core/modelDeclaration.ts`：`defineModel` + `RegisteredModel`。字段：`run`（库 io 包装）、
   `model`（库模型函数，读 label / description / standard / tsv / limits）、`inputs`（顺序 + 默认值）、
   `table`（必填）、`charts`、`timeSeries`。Standard 能力由 `model.standard` 是否存在决定。
4. `src/models/pmvIso.ts`（ADR §4.3 的形状）+ `src/models/index.ts`（一行注册）。
5. `src/core/numberFormat.ts`：最多两位小数、去尾零（`26.0→26`、`78.80→78.8`）。全项目唯一。
6. `src/core/libraryInputs.ts`：`toLibraryInputs(slot, model, environment)`——把表示制
   （5 种湿度、operative 模式）折算成库要的 SI 输入，`Map<Quantity, number>` → 库 init
   （`Object.fromEntries` 按 `Quantity.key`，应用里除 shareLink 外唯一读 key 的地方），
   以及 `v → vr`（是否套 `v_relative` 对照旧工具）、operative 下 `t_o` 展开为 `tdb = tr = t_o`。
   纯函数，先写测试。
7. `src/state/session.svelte.ts`：ADR §4.5 的 `Session` / `InputSlot`（先只用 slot 0）。
8. `src/ui/inputs/` 输入面板 + `src/ui/outputs/ResultTable.svelte`（ADR §4.3 的三段：
   Input / Compliance / 模型 `table` 列出的输出）。面板按 `temperatureMode.panel` 显示温度行，
   标签一律 `Quantity.label`，不写 "Air temperature" 一类文案。
9. `src/routes/navigation.ts`（sv-router 唯一使用处）+ `/standard/iso-7730/pmv-iso/`。
10. SI/IP 切换：存储永远 SI，只有显示文本换算，步长来自当前显示单位的 `DisplayUnit.step`。

**完成判据**
- 改一个输入立刻出数，无计算按钮
- SI → IP → SI 往返后存储值不变，显示不超两位小数、无尾零
- 超出硬范围（`model.limits`）描红、不计算、保留上一个有效值
- `core/` 里没有 `import` 任何 `svelte` / `state` / `ui`（lint 规则拦住）
- `numberFormat`、`units`、`toLibraryInputs` 有单测

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
   `rhStep: 5`、`correctKnownDefects: false`（已拍板：复现旧图）。x 轴量取
   `temperatureMode.axis`，轴标签 `Quantity.label`；operative 模式传 `trFollowsDb: true`。
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
**前置**：Phase 3。库侧需要 `adaptive_ashrae.limits` / `.standard` 与 `io.quantities.t_o`（Phase 1 已含）。

只允许动两个文件：新建 `src/models/adaptiveAshrae.ts`，在 `src/models/index.ts` 加一行。
Adaptive 用 `chartType.dynamic` 实渲染，锁定轴
`t_running_mean × t_o`（轴标签来自 `Quantity.label`），输出是可接受等级区间
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
   **全项目只有这个文件读写字符串 id**（`Quantity.key`、各封闭集合的 `.id` / `xxxFromId()`）。
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
   （多项式，无状态，是 8 个已移植模型之外最便宜的一个），补 `io.utci`、挂上
   `label` / `description` / `limits` / 分级尺度，缺的 quantity 加进 `quantities`。
2. 应用侧：**只加 `src/models/utci.ts` + 一行注册**，其他文件零改动，且只出现在
   Explore 导航（库里不挂 `standard`）。`table` 必填，UTCI 也声明。
3. 跑完 ADR §7 的九条验收（第 3 条比对顶点几何）。
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
- 库的**模型函数**（`jsthermalcomfort` 根、`/models`）只在 `src/models/`（绑定 `run`、
  读元数据）和 `src/workers/`（实际调用）里 import，lint 拦；`io` / `psychrometrics` /
  `reference` / `charts` 随处可 import（`io.quantities` 是物理量唯一定义）；
  `io` 的模型包装只在 worker 里**调用**，靠约定不靠 lint
- 字符串 id 只出现在两处：库内部的 `Quantity.key`，和 `src/core/shareLink.ts`
  （`core/libraryInputs.ts` 用 `Quantity.key` 拼库的 init 对象，是库边界，不算第三处）
- 单位换算只在 `src/core/units.ts`，公式写在应用里（ADR §3 例外）；存储永远 SI
- 数值格式化只在 `src/core/numberFormat.ts`

**语法**
- 只用 runes；ESLint 禁 `export let` / `$:` / `on:` / `<slot>` / `<svelte:component>`
- 禁 `enum` / `namespace` / 构造函数参数属性（`erasableSyntaxOnly`）
- 封闭集合用 `as const` 对象集合 + 派生联合类型，行为做成普通函数，不到处 `switch`，不用枚举类
- 物理量名字只来自 `Quantity.label`，应用里不出现 "Air temperature" 一类写死的名字
- 生成的 `.svelte` 过一遍 `svelte-autofixer`（Svelte MCP 已装）

**别写的东西**（库已有或用不上）
`core/compute/zoneBoundary.ts`、任何自己实现的求根、任何抄下来的分级阈值数字、
`InputCalculator`、`sequentialSimulation`、`evaluateMany`、`migrate()`、`fflate`；
库侧的 `Unit` / `InputSpec` / `OptionSpec` / `ModelDefinition` / `models` 注册表（归应用）；
应用侧的枚举类、应用侧的 `standards` 声明（归库 `model.standard`）。

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
