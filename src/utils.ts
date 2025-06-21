
import * as fsDefaultInternal from 'fs';
import { createHash } from 'crypto';

/**
 * Groups an array of items by a key derived from each item.
 * @template T The type of items in the input array
 * @template K The type of the grouping key
 * @param list - The array of items to group
 * @param keyGetter - A function that extracts the grouping key from an item
 * @returns A Map where each key maps to an array of items that share that key
 * @example
 * const people = [{name: 'Alice', age: 21}, {name: 'Bob', age: 21}];
 * const byAge = groupBy(people, p => p.age);
 * // Map { 21 => [{name: 'Alice', age: 21}, {name: 'Bob', age: 21}] }
 */
export function groupBy<T, K>(list: T[], keyGetter: (input: T) => K): Map<K, T[]> {
  return list.reduce((map, item) => {
    const key = keyGetter(item);
    const collection = map.get(key) || [];
    collection.push(item);
    map.set(key, collection);
    return map;
  }, new Map<K, T[]>());
}

/**
 * Generates a random string using base-36 encoding.
 * @returns A random string containing alphanumeric characters
 * @example
 * const id = randomString(); // e.g. "x7hq9w"
 */

export function randomString(): string {
  return Math.random().toString(36).substring(2, 36);
}

/**
 * Generates a short hash of a string using SHA-256.
 * @param content - The string to hash
 * @returns A short hash of the string
 * @example
 * const hash = shortHash('Hello, world!'); // e.g. "a1b2c3d4e5"
 */
export function shortHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').substring(0, 10);
}


/**
 * Interface representing the filesystem interface
 * @interface FS
 * @property {typeof fsDefault.readdirSync} readdirSync - The readdirSync method
 * @property {typeof fsDefault.statSync} statSync - The statSync method
 * @property {typeof fsDefault.existsSync} existsSync - The existsSync method
 * @property {typeof fsDefault.mkdirSync} mkdirSync - The mkdirSync method
 * @property {typeof fsDefault.writeFileSync} writeFileSync - The writeFileSync method
 * @property {typeof fsDefault.copyFileSync} copyFileSync - The copyFileSync method
 * @property {typeof fsDefault.readFileSync} readFileSync - The readFileSync method
 * @property {typeof fsDefault.unlinkSync} unlinkSync - The unlinkSync method
 * @property {typeof fsDefault.rmdirSync} rmdirSync - The rmdirSync method
 * @property {typeof fsDefault.rmSync} rmSync - The rmSync method
 */
export interface FS {
  readdirSync: typeof fsDefaultInternal.readdirSync;
  statSync: typeof fsDefaultInternal.statSync;
  existsSync: typeof fsDefaultInternal.existsSync;
  mkdirSync: typeof fsDefaultInternal.mkdirSync;
  writeFileSync: typeof fsDefaultInternal.writeFileSync;
  copyFileSync: typeof fsDefaultInternal.copyFileSync;
  readFileSync: typeof fsDefaultInternal.readFileSync;
  unlinkSync: typeof fsDefaultInternal.unlinkSync;
  rmdirSync: typeof fsDefaultInternal.rmdirSync;
  rmSync: typeof fsDefaultInternal.rmSync;
}
export const fsDefault: FS = fsDefaultInternal;