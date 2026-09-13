# CBE Thermal Comfort Tool (rewrite)

A front-end that declares thermal-comfort models, takes their inputs, and renders their results and charts. The numbers come from the `jsthermalcomfort` package; this app owns only presentation.

## Language

**Quantity**:
A physical quantity a model takes or returns, defined once in the app's table with the library's key, a kind and a label. Referenced by object identity, never by its key string outside the library boundary.
_Avoid_: variable, field, parameter

**Key**:
The library's string name for a quantity (`tdb`, `vr`). Appears only where the app talks to the library or to a share link.
_Avoid_: id, wire string (in prose)

**Model info**:
The library's published metadata for one model (`<MODEL>_INFO`): label, description, and per-quantity unit, applicability and classifier.
_Avoid_: schema, metadata object, model docs

**Applicability**:
The range over which a model's answer holds, published by the library. A gate, not a clamp: outside it the answer is reported as unsupported, the value is never adjusted.
_Avoid_: limit, range check, validation, clamp

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
A set of quantities the user may enter in more than one representation: temperature (separate or operative) and humidity (five representations). Derived from the declaration's inputs, not declared.
_Avoid_: input mode, representation group

**Slot**:
One set of entered inputs. Compare holds three.
_Avoid_: scenario, case, column

**Session**:
The state shared by the Standard and Explore workspaces: model, unit system, slots, chart settings.
_Avoid_: store, app state

**Comfort zone**:
The region of a chart where the model's primary output is within its comfort limit, traced by the app's zone solver from the model function.
_Avoid_: compliance zone, comfort region, polygon (that is its rendering)

**Band**:
One labelled interval of a classifier's scale (for example "Slightly Cool"), coloured by its position in the scale.
_Avoid_: category (the library's word for the label a value falls in), class, level
