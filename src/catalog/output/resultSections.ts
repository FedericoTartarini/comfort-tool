export type ResultCellViewModel = {
  text: string;
  subtext?: string;
  color?: string;
};

export type ResultSectionViewModel = {
  title: string;
  group?: string;
  valuesByInput: Partial<Record<
    import("../inputSlots").InputId,
    ResultCellViewModel | null
  >>;
};
