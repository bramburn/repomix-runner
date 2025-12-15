/**
 * Helper function to check if an item is a plain object (excluding null and arrays).
 * @param item The item to check.
 * @returns True if the item is a plain object.
 */
function isObject(item: any): item is Record<string, any> {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Deeply merges multiple source objects into a target object.
 *
 * NOTE: This function modifies the `target` object in place (mutates it).
 * It supports merging nested plain objects recursively. Arrays are overwritten.
 *
 * @param target - The object to merge into (will be mutated).
 * @param sources - One or more source objects to merge from.
 * @returns The merged target object.
 */
export function deepMerge<T extends Record<string, any>>(target: T, ...sources: Partial<T>[]): T {
    if (!sources.length) {
        return target;
    }
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        for (const key of Object.keys(source)) {
            // Check if the source property is an object (for recursive merge)
            if (isObject(source[key])) {
                // Initialize the target property if it's missing or not an object
                if (!target[key] || !isObject(target[key])) {
                    Object.assign(target, { [key]: {} });
                }
                // Recurse for nested objects
                deepMerge(target[key], source[key] as any);
            } else {
                // Otherwise, assign/overwrite the value
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    // Continue merging the remaining sources
    return deepMerge(target, ...sources);
}