import * as vscode from "vscode"
import { CodeIndexCache } from "./CodeIndexCache"
import { FileWatcher } from "./FileWatcher"

/**
 * CodeIndexingService provides a high-level API for cached code definition parsing.
 * It coordinates the cache and file watcher to provide fast, up-to-date code analysis.
 */
export class CodeIndexingService {
	private static instance: CodeIndexingService | null = null

	private cache: CodeIndexCache
	private fileWatcher: FileWatcher
	private isInitialized = false

	private constructor(context: vscode.ExtensionContext) {
		this.cache = new CodeIndexCache(context)
		this.fileWatcher = new FileWatcher(this.cache)
	}

	/**
	 * Get or create the singleton instance
	 */
	static getInstance(context: vscode.ExtensionContext): CodeIndexingService {
		if (!CodeIndexingService.instance) {
			CodeIndexingService.instance = new CodeIndexingService(context)
		}
		return CodeIndexingService.instance
	}

	/**
	 * Initialize the service - load cache and start file watching
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		console.log("[CodeIndexingService] Initializing code indexing service")

		// Load existing cache
		await this.cache.loadCache()

		// Clean up stale entries
		await this.cache.cleanupStaleEntries()

		// Start file watching
		this.fileWatcher.startWatching()

		this.isInitialized = true

		const stats = this.cache.getStats()
		console.log(`[CodeIndexingService] Initialized with ${stats.totalDefinitions} cached definitions`)
	}

	/**
	 * Get cached definitions for a file, or null if not cached/invalid
	 */
	async getCachedDefinitions(filePath: string): Promise<string | null> {
		if (!this.isInitialized) {
			await this.initialize()
		}

		return await this.cache.getCachedDefinitions(filePath)
	}

	/**
	 * Cache definitions for a file
	 */
	async cacheDefinitions(filePath: string, definitions: string): Promise<void> {
		if (!this.isInitialized) {
			await this.initialize()
		}

		await this.cache.cacheDefinitions(filePath, definitions)
	}

	/**
	 * Save cache to persistent storage
	 */
	async saveCache(): Promise<void> {
		await this.cache.saveCache()
	}

	/**
	 * Get cache performance statistics
	 */
	getStats() {
		return this.cache.getStats()
	}

	/**
	 * Clear all cached data
	 */
	clearCache(): void {
		this.cache.clearCache()
	}

	/**
	 * Dispose of all resources
	 */
	dispose(): void {
		this.fileWatcher.dispose()
		CodeIndexingService.instance = null
	}
}
