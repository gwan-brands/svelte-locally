/**
 * query() - Reactive filtering and sorting for collections
 * 
 * Creates a reactive view of a collection with filtering, sorting, and limiting.
 * The result updates automatically when the source collection changes.
 * 
 * @example
 * ```svelte
 * <script>
 *   import { collection, query } from 'svelte-locally';
 *   
 *   const todos = collection<Todo>('todos');
 *   
 *   // Reactive filtered view
 *   const active = query(todos)
 *     .where(t => !t.done)
 *     .orderBy('createdAt', 'desc')
 *     .limit(10);
 * </script>
 * 
 * {#each active.items as todo}
 *   <li>{todo.text}</li>
 * {/each}
 * ```
 */

import type { CollectionResult, CollectionItem } from './collection.svelte';

// ============ Types ============

/** Filter predicate function */
export type WhereFn<T> = (item: CollectionItem<T>) => boolean;

/** Sort direction */
export type SortDirection = 'asc' | 'desc';

/** Sort comparator function */
export type CompareFn<T> = (a: CollectionItem<T>, b: CollectionItem<T>) => number;

/** Query builder interface */
export interface QueryBuilder<T> {
  /** Filter items matching predicate */
  where: (predicate: WhereFn<T>) => QueryBuilder<T>;
  /** Sort by field */
  orderBy: (field: keyof T | CompareFn<T>, direction?: SortDirection) => QueryBuilder<T>;
  /** Limit number of results */
  limit: (count: number) => QueryBuilder<T>;
  /** Skip first N results */
  offset: (count: number) => QueryBuilder<T>;
  /** Get reactive items array */
  readonly items: CollectionItem<T>[];
  /** Get count of filtered items (before limit) */
  readonly count: number;
}

// ============ Query Implementation ============

/**
 * Create a reactive query on a collection
 * 
 * @param source The collection to query
 * @returns A chainable query builder with reactive results
 * 
 * @example
 * ```typescript
 * const todos = collection<Todo>('todos');
 * 
 * // Simple filter
 * const active = query(todos).where(t => !t.done);
 * 
 * // Chained operations
 * const recent = query(todos)
 *   .where(t => !t.done)
 *   .orderBy('createdAt', 'desc')
 *   .limit(5);
 * 
 * // Use in template
 * {#each recent.items as todo}
 * ```
 */
export function query<T extends object>(
  source: CollectionResult<T>
): QueryBuilder<T> {
  // Query configuration
  let filters: WhereFn<T>[] = [];
  let sorters: { compareFn: CompareFn<T> }[] = [];
  let limitCount: number | null = null;
  let offsetCount: number = 0;

  // Compute filtered/sorted items reactively
  function computeItems(): CollectionItem<T>[] {
    let result = [...source.items];

    // Apply filters
    for (const filter of filters) {
      result = result.filter(filter);
    }

    // Apply sorters (in order added)
    for (const sorter of sorters) {
      result.sort(sorter.compareFn);
    }

    // Apply offset
    if (offsetCount > 0) {
      result = result.slice(offsetCount);
    }

    // Apply limit
    if (limitCount !== null) {
      result = result.slice(0, limitCount);
    }

    return result;
  }

  // Compute count (filtered, before limit/offset)
  function computeCount(): number {
    let result = source.items;
    for (const filter of filters) {
      result = result.filter(filter);
    }
    return result.length;
  }

  // Create a field-based comparator
  function createFieldComparator(
    field: keyof T,
    direction: SortDirection
  ): CompareFn<T> {
    return (a, b) => {
      const aVal = a[field as keyof CollectionItem<T>];
      const bVal = b[field as keyof CollectionItem<T>];

      let cmp = 0;
      if (aVal < bVal) cmp = -1;
      else if (aVal > bVal) cmp = 1;

      return direction === 'desc' ? -cmp : cmp;
    };
  }

  // Builder object
  const builder: QueryBuilder<T> = {
    where(predicate: WhereFn<T>): QueryBuilder<T> {
      filters = [...filters, predicate];
      return builder;
    },

    orderBy(
      field: keyof T | CompareFn<T>,
      direction: SortDirection = 'asc'
    ): QueryBuilder<T> {
      const compareFn = typeof field === 'function'
        ? field
        : createFieldComparator(field, direction);
      sorters = [...sorters, { compareFn }];
      return builder;
    },

    limit(count: number): QueryBuilder<T> {
      limitCount = count;
      return builder;
    },

    offset(count: number): QueryBuilder<T> {
      offsetCount = count;
      return builder;
    },

    // Reactive getters - these re-evaluate when source.items changes
    get items(): CollectionItem<T>[] {
      return computeItems();
    },

    get count(): number {
      return computeCount();
    },
  };

  return builder;
}

// ============ Convenience Functions ============

/**
 * Filter a collection by a field value
 * 
 * @example
 * ```typescript
 * const doneTodos = whereEq(todos, 'done', true);
 * ```
 */
export function whereEq<T extends object, K extends keyof T>(
  source: CollectionResult<T>,
  field: K,
  value: T[K]
): QueryBuilder<T> {
  return query(source).where(item => item[field as keyof CollectionItem<T>] === value);
}

/**
 * Get first N items from a collection
 * 
 * @example
 * ```typescript
 * const firstFive = take(todos, 5);
 * ```
 */
export function take<T extends object>(
  source: CollectionResult<T>,
  count: number
): QueryBuilder<T> {
  return query(source).limit(count);
}

/**
 * Sort a collection by a field
 * 
 * @example
 * ```typescript
 * const byDate = sortBy(todos, 'createdAt', 'desc');
 * ```
 */
export function sortBy<T extends object>(
  source: CollectionResult<T>,
  field: keyof T,
  direction: SortDirection = 'asc'
): QueryBuilder<T> {
  return query(source).orderBy(field, direction);
}
