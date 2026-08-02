export function retainWeekOverridesBefore<T>(
  overrides: Record<string, T> | undefined,
  weekStartISO: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(overrides || {}).filter(([week]) => week < weekStartISO),
  )
}
