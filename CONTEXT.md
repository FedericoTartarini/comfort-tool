# CBE Thermal Comfort Tool (rewrite)

A front-end that declares thermal-comfort models, takes their inputs, and renders their results and charts. The numbers come from the `jsthermalcomfort` package; this app owns only presentation.

## Language

**Quantity**:
A physical quantity a model takes or returns, defined once in the app's table with the library's key, a kind and a label. Referenced by object identity, never by its key string outside the library boundary.
_Avoid_: variable, field, parameter

**Key**:
The library's string name for a quantity (`tdb`, `vr`). Appears only where the app talks to the library or to a share link.
_Avoid_: id, wire string (in prose)

**Model name**:
The library's function name for a model (`pmv_ppd_iso`). Everything the app calls that model follows it: the share link carries it as written, the route carries it in kebab-case, the declaration's file and constant in camelCase.
_Avoid_: id, slug, path segment

**Model info**:
The library's published metadata for one model (`<MODEL>_INFO`): the model's name, label, description, and per-quantity unit, applicability and classifier.
_Avoid_: schema, metadata object, model docs

**Applicability**:
The bounds within which a model's answer holds, published by the library per quantity. A gate, not a clamp: an entered value outside it is out of range and the model is not run; a value a run derives or returns outside it is a violation, shown beside the result. The app never adjusts a value on its own. The one adjustment is the user's: switching to a model whose applicability an entered value breaks asks first, and moves the value to the nearest bound only on a yes.
_Avoid_: limit, range check, validation, clamp

**Bound**:
The minimum and maximum a value is tested against; either may be absent. The library's word.
_Avoid_: limit, range (that is an axis range)

**Out of range**:
Said of an entered value that breaks its bound before the model is called: the model's applicability, narrowed by the bound the quantity's kind has by definition (a percentage is 0 to 100), in the entry mode the value was entered in. Never said of a result.
_Avoid_: invalid, violation

**Violation**:
An applicability bound a completed run broke, as the library reports it with the result.
_Avoid_: warning (that is the sentence shown), error, out of range

**Axis range**:
How far a quantity is drawn on a chart. A viewport, declared by the model file; falls back to the applicability bounds only when nothing is declared.
_Avoid_: limit, extent, domain

**Standard**:
A versioned identifier from the library (`iso_7730_2005`). A model declares the one it implements; its display name and route segment are generated from it.
_Avoid_: edition (except when contrasting two versions of one standard), norm

**Declaration**:
The one file in `src/models/` that binds a model: its info, standard, run call, defaults, axis ranges, table columns and charts.
_Avoid_: definition, config, registration (that is the one line in the registry)

**Entry group**:
A set of quantities the user may enter in more than one entry mode: temperature and humidity. Derived from the declaration's inputs, not declared.
_Avoid_: input mode, representation group

**Entry mode**:
One way of entering an entry group: which quantity the user types. Temperature has two (separate, operative), humidity five. The entered quantity is the truth; what the model takes is derived from it.
_Avoid_: input mode, representation, humidity type

**Preset**:
A named reference value the library publishes for a quantity (a typical task for metabolic rate, a typical ensemble for clothing), offered beside free entry. Choosing one enters its number; the number is the truth and nothing remembers the preset.
_Avoid_: default, option, template

**Option**:
A switch a model takes beside its quantities, carrying no unit and never on a chart. Declared by the model, entered in the slot.
_Avoid_: setting, flag, parameter

**Slot**:
One set of values to run a model on: a value per quantity, held in the entry mode it was entered in, and the options. It belongs to no model: it keeps what it holds across a model switch, and holds no humidity until a model or the user gives one. Compare holds three.
_Avoid_: scenario, case, column, inputs (those are what a model takes)

**Session**:
The state shared by the Standard and Explore workspaces: model, unit system, slots, chart settings, atmospheric pressure.
_Avoid_: store, app state

**Atmospheric pressure**:
The pressure of the air every slot of a session describes: one value per session, entered by the user. It moves only what is converted to or from humidity ratio; no model takes it.
_Avoid_: environment, barometric pressure, altitude, pressure (alone, which may be the vapour pressure)

**Comfort zone**:
A region of a chart inside one limit a standard draws: what it accepts, a yes or no. A standard with several limits has one zone per limit, nested. It is not thermal sensation, which describes how a value feels; the two coincide only where a standard happens to draw its limit at a band's edge.
_Avoid_: compliance zone, comfort region, neutral band, polygon (that is its rendering)

**Band**:
One labelled, coloured interval of an output's scale (for example "Slightly Cool"). The bands start as the library classifier's; in Explore the user may edit them.
_Avoid_: category (the library's word for the label a value falls in), class, level, threshold (except the "threshold editor", the feature's name on screen)

**Edge**:
The boundary between two bands, the library's word. Bands are contiguous, so editing bands is moving, adding or removing edges.
_Avoid_: threshold, limit, cut-off

**Temporary library**:
A library-shaped calculation the app carries because neither pythermalcomfort nor jsthermalcomfort has it yet: pure SI in, SI or geometry out, written to the library's conventions, depending on the library alone. The zone solver and Adaptive's band geometry live there.
_Avoid_: stand-in, shim, polyfill, helper
