import { defaultHashing } from '../../hasher/hashing-impl';

/**
 * Simple sort function to ensure keys are ordered alphabetically
 * @param obj
 * @returns
 */
export function sortObject<T = string>(
  obj: Record<string, T>,
  valueTransformator: (value: T) => any = (value) => value
): Record<string, T> | undefined {
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return;
  }

  const result: Record<string, T> = {};
  keys.sort().forEach((key) => {
    result[key] = valueTransformator(obj[key]);
  });
  return result;
}

/**
 * Apply simple hashing of the content using the default hashing implementation
 * @param fileContent
 * @returns
 */
export function hashString(fileContent: string): string {
  return defaultHashing.hashArray([fileContent]);
}
