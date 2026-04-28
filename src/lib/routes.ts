export function billHref(id: number | string): string {
  return `/bills/${id}`;
}

export function billImpactHref(id: number | string): string {
  return `/impact?bill=${id}`;
}
