import "jsthermalcomfort";

/**
 * Generated fork types omit `label` / `description` (runtime strings) and
 * `mapping`/`tsv` `.bins`. Do not redeclare APIs the package already types
 * (`offsets`, `compliance.bounds`, `COMPLIANCE_LIMIT`, `phs.RECTAL_*`).
 */
interface JsClassifierFn {
  (value: number): string | number;
  readonly bins: {
    readonly edges: readonly number[];
    readonly labels: readonly string[];
    readonly right: boolean;
  };
}

declare module "jsthermalcomfort" {
  export function heat_index(
    tdb: number,
    rh: number,
    options?: {
      round?: boolean;
      units?: string;
      limit_inputs?: boolean;
    },
  ): {
    hi: number;
    stress_category: string | number;
  };
  namespace heat_index {
    const label: string;
    const description: string;
    const mapping: JsClassifierFn;
  }
  namespace humidex {
    const label: string;
    const description: string;
    const mapping: JsClassifierFn;
  }
  namespace utci {
    const label: string;
    const description: string;
    const mapping: JsClassifierFn;
  }
  namespace wc {
    const label: string;
    const description: string;
  }
  namespace phs {
    const label: string;
    const description: string;
  }
  namespace adaptive_ashrae {
    const label: string;
    const description: string;
  }
  namespace adaptive_en {
    const label: string;
    const description: string;
  }
  namespace pmv_ppd_ashrae {
    const label: string;
    const description: string;
    const tsv: JsClassifierFn;
  }
  namespace pmv_ppd_iso {
    const label: string;
    const description: string;
    const tsv: JsClassifierFn;
  }
}
