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
		// Only exclude the WASM package itself
		exclude: ['@automerge/automerge-wasm'],
		// Force these to be pre-bundled (helps with CJS/ESM interop)
		include: [
			'@automerge/automerge',
			'@automerge/automerge-repo',
			'@automerge/automerge-repo-storage-indexeddb',
			'@automerge/automerge-repo-network-websocket',
			'@automerge/automerge-repo-network-broadcastchannel'
		]
	}
});
