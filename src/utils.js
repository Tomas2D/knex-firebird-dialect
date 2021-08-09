export function toArrayFromPrimitive(val) {
  if (Array.isArray(val)) {
    return val;
  }

  return [val];
}
