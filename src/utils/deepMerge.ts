/**
 * Deeply merges two objects.
 *
 * Warning: This function modifies the `target` object in place.
 *
 * @param target - The target object.
 * @param source - The source object.
 * @returns The merged object.
 */
export function deepMerge(target: any, source: any): any {
  if (typeof target !== 'object' || target === null) {
    return source;
  }

  if (typeof source !== 'object' || source === null) {
    return target;
  }

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }

  return target;
}
