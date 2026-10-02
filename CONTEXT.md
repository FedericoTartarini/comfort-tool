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
A versioned identifier from the library (`iso_7730_2005`). A model declares the one it implements; its display name and route segment are generated from it. The Standard page is named after it; "standard" alone means the identifier.
_Avoid_: edition (except when contrasting two versions of one standard), norm

**Declaration**:
The one file in `src/models/` that binds a model: its info, standard, run call, defaults, axis ranges, table columns and charts.
_Avoid_: definition, config, registration (that is the one line in the registry)

**Entry group**:
A set of quantities the user may enter in more than one entry mode: temperature, humidity, air speed and clothing. Read from the model's inputs and, for clothing, from its standard; not declared.
_Avoid_: input mode, representation group

**Entry mode**:
One way of entering an entry group: which quantity the user types. Temperature has two (separate, operative), humidity five, air speed two (air speed, relative air speed) and clothing two (clothing insulation, dynamic clothing insulation). The entered quantity is the truth; what the model takes is derived from it. A session has one entry mode per entry group: changing it converts every slot.
_Avoid_: input mode, representation, humidity type, toggle

**Activity-adjusted input**:
A quantity a model takes corrected for the occupant's activity: the relative air speed, from the air speed and the metabolic rate, and the dynamic clothing insulation, from the clothing insulation by the model's standard's rule. Each is an entry group whose two entry modes enter the uncorrected value, with the correction derived, or the corrected value itself. Switching into the corrected mode shows the derived value; switching back inverts the correction in both groups, so what the model takes does not change.
_Avoid_: derived input, self-generated air speed, activity-generated air speed, toggle

**Preset**:
A named reference value the library publishes for a quantity (a typical task for metabolic rate, a typical ensemble for clothing), offered beside free entry. Choosing one enters its number; the number is the truth and nothing remembers the preset.
_Avoid_: default, option, template

**Option**:
A switch a model takes beside its quantities, carrying no unit and never on a chart. Declared by the model, entered in the slot.
_Avoid_: setting, flag, parameter

**Slot**:
One set of values to run a model on: what describes one air and one occupant, a value per quantity entered for the model, held in the entry mode it was entered in, and the options. It belongs to no model: it keeps what it holds across a model switch, and holds no humidity until a model or the user gives one. A session holds three, named by position ("Input 1"); a slot that has never been enabled holds nothing until it is, when it takes what slot 1 holds. The test for what is a slot's: two slots could differ on it and the page would still read as one row, one chart and one table. What fails the test is the session's.
_Avoid_: scenario, case, column, inputs (those are what a model takes)

**Compare**:
Showing up to three slots side by side on the Standard page, each with its own result, its own comfort zones and its own marker. It is on or off. Slot 1 is always compared; slots 2 and 3 are each enabled by the person, and are compared while Compare is on and they are enabled. No slot is a reference for the others.
_Avoid_: baseline, active slot, scenario

**Session**:
What makes three slots one table, shared by the Standard and Explore pages: the model they run; the conventions they are read under (the unit system, one entry mode per entry group); the air they share (the atmospheric pressure); which of them are shown (whether Compare is on, and whether slots 2 and 3 are each enabled); and the chart settings and the Band list, remembered per model. A quantity a model names that the session holds is filled from the session, not entered in the slot.
_Avoid_: store, app state

**Atmospheric pressure**:
The pressure of the air every slot of a session describes: one value per session, entered by the user. It moves only what is converted to or from humidity ratio; no model takes it.
_Avoid_: environment, barometric pressure, altitude, pressure (alone, which may be the vapour pressure)

**Comfort zone**:
A region of a chart inside one limit a standard draws: what it accepts, a yes or no. A standard with several limits has one zone per limit, nested. It is not thermal sensation, which describes how a value feels; the two coincide only where a standard happens to draw its limit at a band's edge.
_Avoid_: compliance zone, comfort region, neutral band, polygon (that is its rendering)

**Band**:
One labelled, coloured interval of an output's scale (for example "Slightly Cool"). The bands start as the library Classifier's; on the Explore page the user may edit them. A band may have no colour, and is then painted nowhere but still names what falls in it.
_Avoid_: category (the library's word for the label a value falls in), class, level, threshold, unclassified (a band without a colour is uncoloured)

**Band list**:
The Bands of one model as the Explore page paints them: a copy of the model's Classifier with a colour per band, contiguous Edges, the Classifier's own inclusivity, no gaps. One per model, for both of its charts; it starts as the Classifier's and may be edited, moved, added to and reset. The result table never reads it.
_Avoid_: thresholds, ranges, custom bands, scale

**Classifier**:
The library's bins that cut one output into categories: its Edges, its labels and which end of each interval is included. A model's default Band list is a copy of one, and the Compliance column's category is read against one.
_Avoid_: scale, interval scale, bins (in prose)

**Palette**:
The colours a Classifier's Bands start with: one colour family per Classifier, diverging for a scale around neutral and sequential for a one-sided one, taken by band position, never by label.
_Avoid_: colour scheme (that is the source family's word), theme

**Edge**:
The boundary between two bands, the library's word. Bands are contiguous, so editing bands is moving, adding or removing edges.
_Avoid_: threshold, limit, cut-off

**Page**:
One of the app's screens, each with its own address: Standard (a model under its standard, with Compare), Explore (any model, with the Band list editable) and Time-series. The page decides what the charts paint: Standard paints Comfort zones, Explore paints Bands.
_Avoid_: workspace, surface, view, tab, mode

**Scan**:
A model's output computed over a grid of two quantities, from which a chart contours its Bands or its Comfort zones. The dynamic chart and the psychrometric chart are scans; the adaptive chart is not: its Comfort zones are the limit lines the model itself returns, drawn across the chart.
_Avoid_: field (in prose), heatmap, grid (that is its resolution)

**Temporary library**:
A library-shaped calculation the app carries because neither pythermalcomfort nor jsthermalcomfort has it yet: pure SI in, SI or geometry out, written to the library's conventions, depending on the library alone. Adaptive's zone geometry and the inverses of the two activity corrections live there.
_Avoid_: stand-in, shim, polyfill, helper
