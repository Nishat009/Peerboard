/** Joins truthy class names. Components avoid conflicting utilities, so no merge step is needed. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
