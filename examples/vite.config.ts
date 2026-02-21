import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
	plugins: [
		wasm(),
		topLevelAwait(),
		sveltekit()
	],
	optimizeDeps: {
		// Exclude all automerge packages from Vite's dependency pre-bundling
		// They use WASM which needs special handling
		exclude: [
			'@automerge/automerge',
			'@automerge/automerge-wasm',
			'@automerge/automerge-repo',
			'@automerge/automerge-repo-storage-indexeddb',
			'@automerge/automerge-repo-network-websocket',
			'@automerge/automerge-repo-network-broadcastchannel'
		]
	},
	server: {
		// Required for SharedArrayBuffer (used by some Automerge features)
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'require-corp'
		}
	}
});
