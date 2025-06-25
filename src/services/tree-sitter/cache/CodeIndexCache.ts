import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { fileExistsAtPath } from "@utils/fs"

export interface CachedDefinition {
	filePath: string
	definitions: string
	lastModified: number
	hash: string
}

export interface IndexCacheData {
	definitions: Record<string, CachedDefinition>
	lastIndexedAt: number
	version: string
}

/**
 * CodeIndexCache provides fast caching of parsed code definitions
 * to avoid re-parsing unchanged files for every new task.
 *
 * Features:
 * - File modification timestamp tracking
 * - Content hash verification
 * - Workspace-specific caching
 * - Automatic cache invalidation
 * - Performance metrics
 */
export class CodeIndexCache {
	private static readonly CACHE_VERSION = "1.0.0"
	private static readonly CACHE_KEY = "codeIndexCache"

	private context: vscode.ExtensionContext
	private cache: IndexCacheData
	private hitCount = 0
	private missCount = 0

	constructor(context: vscode.ExtensionContext) {
		this.context = context
		this.cache = this.initializeCache()
	}

	private initializeCache(): IndexCacheData {
		return {
			definitions: {},
			lastIndexedAt: Date.now(),
			version: CodeIndexCache.CACHE_VERSION,
		}
	}

	/**
	 * Load cache from workspace state
	 */
	async loadCache(): Promise<void> {
		try {
			const cachedData = (await this.context.workspaceState.get(CodeIndexCache.CACHE_KEY)) as IndexCacheData | undefined

			if (cachedData && cachedData.version === CodeIndexCache.CACHE_VERSION) {
				this.cache = cachedData
				console.log(`[CodeIndexCache] Loaded cache with ${Object.keys(this.cache.definitions).length} definitions`)
			} else {
				console.log("[CodeIndexCache] Cache version mismatch or not found, initializing new cache")
				this.cache = this.initializeCache()
			}
		} catch (error) {
			console.error("[CodeIndexCache] Error loading cache:", error)
			this.cache = this.initializeCache()
		}
	}

	/**
	 * Save cache to workspace state
	 */
	async saveCache(): Promise<void> {
		try {
			this.cache.lastIndexedAt = Date.now()
			await this.context.workspaceState.update(CodeIndexCache.CACHE_KEY, this.cache)
		} catch (error) {
			console.error("[CodeIndexCache] Error saving cache:", error)
		}
	}

	/**
	 * Get cached definitions for a file if still valid
	 */
	async getCachedDefinitions(filePath: string): Promise<string | null> {
		const normalizedPath = path.resolve(filePath)
		const cached = this.cache.definitions[normalizedPath]

		if (!cached) {
			this.missCount++
			return null
		}

		try {
			// Check if file still exists
			const fileExists = await fileExistsAtPath(normalizedPath)
			if (!fileExists) {
				delete this.cache.definitions[normalizedPath]
				this.missCount++
				return null
			}

			// Check file modification time
			const stats = await fs.stat(normalizedPath)
			if (stats.mtime.getTime() !== cached.lastModified) {
				delete this.cache.definitions[normalizedPath]
				this.missCount++
				return null
			}

			// Verify content hash for extra safety
			const content = await fs.readFile(normalizedPath, "utf8")
			const currentHash = this.generateHash(content)
			if (currentHash !== cached.hash) {
				delete this.cache.definitions[normalizedPath]
				this.missCount++
				return null
			}

			this.hitCount++
			return cached.definitions
		} catch (error) {
			console.error(`[CodeIndexCache] Error checking cache for ${filePath}:`, error)
			delete this.cache.definitions[normalizedPath]
			this.missCount++
			return null
		}
	}

	/**
	 * Cache definitions for a file
	 */
	async cacheDefinitions(filePath: string, definitions: string): Promise<void> {
		try {
			const normalizedPath = path.resolve(filePath)
			const stats = await fs.stat(normalizedPath)
			const content = await fs.readFile(normalizedPath, "utf8")
			const hash = this.generateHash(content)

			this.cache.definitions[normalizedPath] = {
				filePath: normalizedPath,
				definitions,
				lastModified: stats.mtime.getTime(),
				hash,
			}
		} catch (error) {
			console.error(`[CodeIndexCache] Error caching definitions for ${filePath}:`, error)
		}
	}

	/**
	 * Remove cached entry for a file
	 */
	invalidateFile(filePath: string): void {
		const normalizedPath = path.resolve(filePath)
		delete this.cache.definitions[normalizedPath]
	}

	/**
	 * Clear all cached definitions
	 */
	clearCache(): void {
		this.cache = this.initializeCache()
		this.hitCount = 0
		this.missCount = 0
	}

	/**
	 * Get cache statistics
	 */
	getStats() {
		const totalRequests = this.hitCount + this.missCount
		const hitRate = totalRequests > 0 ? ((this.hitCount / totalRequests) * 100).toFixed(1) : "0.0"

		return {
			totalDefinitions: Object.keys(this.cache.definitions).length,
			hitCount: this.hitCount,
			missCount: this.missCount,
			hitRate: `${hitRate}%`,
			lastIndexedAt: new Date(this.cache.lastIndexedAt).toISOString(),
		}
	}

	/**
	 * Remove stale entries from cache (files that no longer exist)
	 */
	async cleanupStaleEntries(): Promise<void> {
		const filesToCheck = Object.keys(this.cache.definitions)
		const staleFiles: string[] = []

		for (const filePath of filesToCheck) {
			try {
				const exists = await fileExistsAtPath(filePath)
				if (!exists) {
					staleFiles.push(filePath)
				}
			} catch (error) {
				staleFiles.push(filePath)
			}
		}

		for (const staleFile of staleFiles) {
			delete this.cache.definitions[staleFile]
		}

		if (staleFiles.length > 0) {
			console.log(`[CodeIndexCache] Cleaned up ${staleFiles.length} stale entries`)
		}
	}

	/**
	 * Generate a simple hash for content verification
	 */
	private generateHash(content: string): string {
		let hash = 0
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i)
			hash = (hash << 5) - hash + char
			hash = hash & hash // Convert to 32-bit integer
		}
		return hash.toString(36)
	}
}
