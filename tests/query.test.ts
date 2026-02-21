import { describe, it, expect } from 'vitest';
import { query, whereEq, take, sortBy } from '../src/query.svelte';
import type { CollectionResult, CollectionItem } from '../src/collection.svelte';

// Mock collection for testing
function mockCollection<T extends object>(items: T[]): CollectionResult<T> {
  const itemsWithId = items.map((item, i) => ({ 
    ...item, 
    id: `item-${i}` 
  })) as CollectionItem<T>[];
  
  return {
    get items() { return itemsWithId; },
    status: {
      ready: true,
      loadedCount: items.length,
      totalCount: items.length,
      syncing: false,
      online: true,
      error: null,
    },
    add: () => '',
    get: () => undefined,
    update: () => {},
    remove: () => {},
    has: () => false,
    retry: () => {},
  };
}

interface Todo {
  text: string;
  done: boolean;
  priority: number;
}

describe('query', () => {
  const todos: Todo[] = [
    { text: 'Buy milk', done: false, priority: 2 },
    { text: 'Walk dog', done: true, priority: 1 },
    { text: 'Write code', done: false, priority: 3 },
    { text: 'Read book', done: true, priority: 2 },
  ];

  describe('where', () => {
    it('should filter items by predicate', () => {
      const collection = mockCollection(todos);
      const result = query(collection).where(t => !t.done);
      
      expect(result.items.length).toBe(2);
      expect(result.items.every(t => !t.done)).toBe(true);
    });

    it('should chain multiple where clauses', () => {
      const collection = mockCollection(todos);
      const result = query(collection)
        .where(t => !t.done)
        .where(t => t.priority > 1);
      
      expect(result.items.length).toBe(2);
      expect(result.items.map(t => t.text)).toEqual(['Buy milk', 'Write code']);
    });

    it('should return empty for no matches', () => {
      const collection = mockCollection(todos);
      const result = query(collection).where(t => t.priority > 10);
      
      expect(result.items.length).toBe(0);
    });
  });

  describe('orderBy', () => {
    it('should sort by field ascending', () => {
      const collection = mockCollection(todos);
      const result = query(collection).orderBy('priority', 'asc');
      
      expect(result.items.map(t => t.priority)).toEqual([1, 2, 2, 3]);
    });

    it('should sort by field descending', () => {
      const collection = mockCollection(todos);
      const result = query(collection).orderBy('priority', 'desc');
      
      expect(result.items.map(t => t.priority)).toEqual([3, 2, 2, 1]);
    });

    it('should sort by string field', () => {
      const collection = mockCollection(todos);
      const result = query(collection).orderBy('text', 'asc');
      
      expect(result.items[0].text).toBe('Buy milk');
      expect(result.items[3].text).toBe('Write code');
    });

    it('should accept custom comparator', () => {
      const collection = mockCollection(todos);
      const result = query(collection).orderBy((a, b) => 
        a.text.length - b.text.length
      );
      
      // Shortest text first (Buy milk & Walk dog are both 8 chars)
      expect(result.items[0].text.length).toBeLessThanOrEqual(result.items[1].text.length);
      // Longest text last
      expect(result.items[3].text).toBe('Write code');
    });
  });

  describe('limit', () => {
    it('should limit results', () => {
      const collection = mockCollection(todos);
      const result = query(collection).limit(2);
      
      expect(result.items.length).toBe(2);
    });

    it('should return all if limit exceeds count', () => {
      const collection = mockCollection(todos);
      const result = query(collection).limit(100);
      
      expect(result.items.length).toBe(4);
    });
  });

  describe('offset', () => {
    it('should skip items', () => {
      const collection = mockCollection(todos);
      const result = query(collection).offset(2);
      
      expect(result.items.length).toBe(2);
      expect(result.items[0].text).toBe('Write code');
    });

    it('should work with limit', () => {
      const collection = mockCollection(todos);
      const result = query(collection).offset(1).limit(2);
      
      expect(result.items.length).toBe(2);
      expect(result.items[0].text).toBe('Walk dog');
      expect(result.items[1].text).toBe('Write code');
    });
  });

  describe('count', () => {
    it('should return total count before limit', () => {
      const collection = mockCollection(todos);
      const result = query(collection)
        .where(t => !t.done)
        .limit(1);
      
      expect(result.items.length).toBe(1);
      expect(result.count).toBe(2);
    });
  });

  describe('chaining', () => {
    it('should chain filter, sort, and limit', () => {
      const collection = mockCollection(todos);
      const result = query(collection)
        .where(t => !t.done)
        .orderBy('priority', 'desc')
        .limit(1);
      
      expect(result.items.length).toBe(1);
      expect(result.items[0].text).toBe('Write code');
      expect(result.items[0].priority).toBe(3);
    });
  });
});

describe('convenience functions', () => {
  const todos: Todo[] = [
    { text: 'Buy milk', done: false, priority: 2 },
    { text: 'Walk dog', done: true, priority: 1 },
  ];

  describe('whereEq', () => {
    it('should filter by field equality', () => {
      const collection = mockCollection(todos);
      const result = whereEq(collection, 'done', true);
      
      expect(result.items.length).toBe(1);
      expect(result.items[0].text).toBe('Walk dog');
    });
  });

  describe('take', () => {
    it('should take first N items', () => {
      const collection = mockCollection(todos);
      const result = take(collection, 1);
      
      expect(result.items.length).toBe(1);
    });
  });

  describe('sortBy', () => {
    it('should sort by field', () => {
      const collection = mockCollection(todos);
      const result = sortBy(collection, 'priority', 'asc');
      
      expect(result.items[0].text).toBe('Walk dog');
    });
  });
});
