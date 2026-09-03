import { wc, wind_chill_temperature } from "jsthermalcomfort";
import { ModelId } from "../catalog/modelIds";
import { InputWidget } from "../catalog/inputWidgets";
import { ChartType } from "../catalog/chartTypes";
import { PhysicalQuantityId, getPhysicalQuantityMeta } from "../catalog/quantities";
import { unitLabel } from "../catalog/units";
import {
  convertFieldValueFromSi,
  convertMetersPerSecondToKilometersPerHour,
} from "../engines/units";
import {
  defineModel,
  inputQuantity,
  quantityRow,
  resultQuantity,
} from "../state/modelRegistry/builder";
import type { QuantityState } from "../catalog/quantities";

export const windChillModelConfig = defineModel(wc, {
  id: ModelId.WindChill,
  standardIds: [],
  exploreMode: true,

  inputs: [
    inputQuantity("tdb", PhysicalQuantityId.DryBulbTemperature, {
      minValue: -45,
      maxValue: 0,
    }),
    inputQuantity("v", PhysicalQuantityId.WindSpeed, {
      widget: InputWidget.OutdoorWindSpeed,
      minValue: 1,
      maxValue: 20,
    }),
  ],

  response: {
    values: [
      resultQuantity("wci", PhysicalQuantityId.WindChillIndex),
      resultQuantity("wct", PhysicalQuantityId.WindChillTemperature, {
        from: (si, _primary) => wind_chill_temperature(
          si[PhysicalQuantityId.DryBulbTemperature]!,
          convertMetersPerSecondToKilometersPerHour(
            si[PhysicalQuantityId.WindSpeed]!,
          ),
          false,
        ).wct,
      }),
    ],
  },

  tables: {
    results: [
      quantityRow(PhysicalQuantityId.WindChillIndex),
      quantityRow(PhysicalQuantityId.WindChillTemperature),
    ],
  },

  charts: [{
    type: ChartType.Dynamic,
    capabilities: { locksYAxis: true },
    spec: {
      axes: {
        x: PhysicalQuantityId.DryBulbTemperature,
        y: PhysicalQuantityId.WindSpeed,
      },
      dynamicHoverExtension: {
        getTemplateSuffix: (unitSystem) => {
          const units = unitLabel(
            getPhysicalQuantityMeta(PhysicalQuantityId.WindChillTemperature).siUnit,
            unitSystem,
          );
          return `<br>wct: %{customdata[1]:.1f} ${units}`;
        },
        getMetadata: (result, unitSystem) => [
          result == null
            ? ""
            : convertFieldValueFromSi(
                PhysicalQuantityId.WindChillTemperature,
                (result as QuantityState)[PhysicalQuantityId.WindChillTemperature]!,
                unitSystem,
              ),
        ],
      },
    },
  }],
});
