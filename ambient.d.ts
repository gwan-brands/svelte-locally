/// <reference types="svelte" />

// Svelte 5 runes - these are compiler transforms, not runtime functions
// The actual types come from svelte/types/compiler/interfaces
declare function $state<T>(initial: T): T;
declare function $state<T>(): T | undefined;
declare function $derived<T>(expression: T): T;
declare function $effect(fn: () => void | (() => void)): void;
declare function $props<T>(): T;
