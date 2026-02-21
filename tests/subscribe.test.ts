import { describe, it, expect, vi } from 'vitest';
import type { CollectionResult, CollectionItem } from '../src/collection.svelte';

// Mock collection for testing subscribe functionality
function mockCollectionWithSubscribe<T extends object>(initialItems: T[]): CollectionResult<T> & { 
  _triggerChange: (items: T[]) => void 
} {
  let items = initialItems.map((item, i) => ({ 
    ...item, 
    id: `item-${i}` 
  })) as CollectionItem<T>[];
  
  const subscribers = new Set<(items: CollectionItem<T>[]) => void>();
  
  function notifySubscribers() {
    for (const callback of subscribers) {
      callback(items);
    }
  }
  
  return {
    get items() { return items; },
    status: {
      ready: true,
      loadedCount: items.length,
      totalCount: items.length,
      syncing: false,
      online: true,
      error: null,
    },
    add: (data: T) => {
      const id = `item-${items.length}`;
      items = [...items, { ...data, id } as CollectionItem<T>];
      notifySubscribers();
      return id;
    },
    get: (id: string) => items.find(item => item.id === id),
    update: () => {},
    remove: (id: string) => {
      items = items.filter(item => item.id !== id);
      notifySubscribers();
    },
    has: (id: string) => items.some(item => item.id === id),
    retry: () => {},
    subscribe: (callback) => {
      subscribers.add(callback);
      if (items.length > 0) {
        callback(items);
      }
      return () => {
        subscribers.delete(callback);
      };
    },
    _triggerChange: (newItems: T[]) => {
      items = newItems.map((item, i) => ({ 
        ...item, 
        id: `item-${i}` 
      })) as CollectionItem<T>[];
      notifySubscribers();
    },
  };
}

interface Todo {
  text: string;
  done: boolean;
}

describe('subscribe', () => {
  describe('collection subscribe', () => {
    it('should call callback immediately with current items', () => {
      const todos: Todo[] = [
        { text: 'Buy milk', done: false },
        { text: 'Walk dog', done: true },
      ];
      const collection = mockCollectionWithSubscribe(todos);
      
      const callback = vi.fn();
      collection.subscribe(callback);
      
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(collection.items);
    });

    it('should not call callback if items empty', () => {
      const collection = mockCollectionWithSubscribe<Todo>([]);
      
      const callback = vi.fn();
      collection.subscribe(callback);
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should call callback on item add', () => {
      const collection = mockCollectionWithSubscribe<Todo>([]);
      
      const callback = vi.fn();
      collection.subscribe(callback);
      
      collection.add({ text: 'New todo', done: false });
      
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toHaveLength(1);
    });

    it('should call callback on item remove', () => {
      const todos: Todo[] = [{ text: 'Buy milk', done: false }];
      const collection = mockCollectionWithSubscribe(todos);
      
      const callback = vi.fn();
      collection.subscribe(callback);
      callback.mockClear(); // Clear initial call
      
      collection.remove('item-0');
      
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toHaveLength(0);
    });

    it('should stop calling after unsubscribe', () => {
      const collection = mockCollectionWithSubscribe<Todo>([]);
      
      const callback = vi.fn();
      const unsubscribe = collection.subscribe(callback);
      
      collection.add({ text: 'Todo 1', done: false });
      expect(callback).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      
      collection.add({ text: 'Todo 2', done: false });
      expect(callback).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should support multiple subscribers', () => {
      const collection = mockCollectionWithSubscribe<Todo>([]);
      
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      collection.subscribe(callback1);
      collection.subscribe(callback2);
      
      collection.add({ text: 'Todo', done: false });
      
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });
});
