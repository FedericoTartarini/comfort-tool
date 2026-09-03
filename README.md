# CBE Thermal Comfort Tool

Svelte 5 frontend for thermal-comfort calculations and visualizations. Runs
entirely in the browser and computes locally through
[`jsthermalcomfort`](https://github.com/CenterForTheBuiltEnvironment/comfort.js);
no backend runtime is required.

- **Live tool:** [comfort.cbe.berkeley.edu](https://comfort.cbe.berkeley.edu/)
- **User documentation:** [Thermal Comfort Tool (GitBook)](https://center-for-the-built-environment.gitbook.io/thermal-comfort-tool)
- **Source:** [github.com/FedericoTartarini/comfort-tool](https://github.com/FedericoTartarini/comfort-tool)

> ## 🚧 Rewrite in progress
>
> This branch (`rewrite/v1`) is a ground-up rewrite. The previous application
> was removed and `src/` is being rebuilt against a new architecture in which
> all thermal-comfort logic lives in the `jsthermalcomfort` library and the app
> only declares and renders models.
>
> - [Architecture decision record](docs/adr-0001-architecture.md)
> - [Phased rewrite plan](REWRITE-PLAN.md)
>
> The previous implementation is preserved on the `refactor-draft` branch.

## Planned surfaces

| Workspace       | Route                            | Purpose                                                                        |
| --------------- | -------------------------------- | ------------------------------------------------------------------------------ |
| **Standard**    | `/standard/{standard}/{model}/`  | Compliance-oriented charts with fixed zones and pass/fail feedback              |
| **Explore**     | `/explore/{model}/`              | Interactive charts with selectable axes, editable bands, multiple outputs       |
| **Time-series** | `/time-series/{model}/`          | Segment-based exposure simulation (PHS) — after v1                              |

Across Standard and Explore: up to three input slots with compare mode, SI/IP
switching over canonical SI state, and shareable URL snapshots
(`?share=v1.<Base64URL(JSON)>`).

## v1 scope

PMV/PPD (ISO 7730) and Adaptive comfort (ASHRAE 55), with UTCI added as an
architecture acceptance test. Heat Index, Humidex, Wind Chill, PMV (ASHRAE 55),
Adaptive (EN 16798-1) and PHS follow incrementally — each is one declaration
file plus one registry line once its model is ported to the library.

## Prerequisites

- **Node.js** ≥ 24 (`engines` in `package.json`, `.nvmrc`)
- **npm** (ships with Node)

`jsthermalcomfort` is currently a `file:` link to a local fork. The app consumes
the fork's build output, so run `npm run build` inside the fork after changing it.

## Development

```bash
npm install
npm run dev
```

Validation suite:

```bash
npm test && npm run check && npm run lint && npm run build
```

## Tech stack

- **Svelte 5** (runes) + **TypeScript 6** + **Vite 8**
- **Tailwind CSS 4** + **shadcn-svelte** for UI
- **Plotly.js 4** (cartesian bundle) for charts
- **Comlink** for the calculation worker
- **`jsthermalcomfort`** for all thermal-comfort calculations
- **`sv-router`** for client-side routing
- **Vitest** for unit tests

## Static hosting

Public paths use clean trailing-slash URLs. Production hosting must return
`index.html` for non-asset application paths so direct visits and refreshes
reach the client router.

## Citation

If you use this tool in published work, please cite:

> Tartarini, F., Schiavon, S., Cheung, T., Hoyt, T., 2020. CBE Thermal Comfort Tool: online tool for thermal comfort calculations and visualizations. SoftwareX 12, 100563. https://doi.org/10.1016/j.softx.2020.100563
