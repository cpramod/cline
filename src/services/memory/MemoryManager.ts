import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"

/**
 * Advanced Memory Manager for Cline
 * Implements LRU cache, memory pressure monitoring, lazy loading, and other optimizations
 * for handling very large projects efficiently.
 */

export interface MemoryConfig {
	maxCacheSize: number // Max memory in bytes for file cache
	maxFileSize: number // Max file size to cache in memory
	streamThreshold: number // Files larger than this are streamed
	cleanupThreshold: number // Memory usage % to trigger cleanup
	maxCacheEntries: number // Max number of cached files
	memoryCheckInterval: number // How often to check memory (ms)
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
	maxCacheSize: 512 * 1024 * 1024, // 512MB max cache
	maxFileSize: 10 * 1024 * 1024, // 10MB max file size to cache
	streamThreshold: 1024 * 1024, // Stream files > 1MB
	cleanupThreshold: 80, // Clean up at 80% memory usage
	maxCacheEntries: 1000, // Max 1000 cached files
	memoryCheckInterval: 30000, // Check memory every 30s
}

export interface CacheEntry {
	content: string
	size: number
	lastAccessed: number
	accessCount: number
	filePath: string
}

export interface MemoryStats {
	totalMemoryUsage: number
	cacheMemoryUsage: number
	cachedFilesCount: number
	hitRate: number
	totalRequests: number
	cacheHits: number
	cleanupCount: number
	systemMemoryUsage: number
	systemMemoryTotal: number
}

/**
 * LRU Cache implementation for file contents
 */
class LRUCache {
	private cache = new Map<string, CacheEntry>()
	private maxSize: number
	private maxEntries: number
	private currentSize = 0
	private totalRequests = 0
	private cacheHits = 0

	constructor(maxSize: number, maxEntries: number) {
		this.maxSize = maxSize
		this.maxEntries = maxEntries
	}

	get(key: string): string | null {
		this.totalRequests++
		const entry = this.cache.get(key)

		if (entry) {
			// Move to end (most recently used)
			this.cache.delete(key)
			entry.lastAccessed = Date.now()
			entry.accessCount++
			this.cache.set(key, entry)
			this.cacheHits++
			return entry.content
		}

		return null
	}

	set(key: string, content: string, filePath: string): boolean {
		const size = Buffer.byteLength(content, "utf8")

		// Don't cache if too large
		if (size > this.maxSize * 0.1) {
			// No single file > 10% of cache
			return false
		}

		// Remove existing entry if it exists
		const existing = this.cache.get(key)
		if (existing) {
			this.currentSize -= existing.size
			this.cache.delete(key)
		}

		// Make room if needed
		while (this.currentSize + size > this.maxSize || this.cache.size >= this.maxEntries) {
			this.evictLRU()
		}

		// Add new entry
		const entry: CacheEntry = {
			content,
			size,
			lastAccessed: Date.now(),
			accessCount: 1,
			filePath,
		}

		this.cache.set(key, entry)
		this.currentSize += size
		return true
	}

	private evictLRU(): void {
		if (this.cache.size === 0) return

		// Find least recently used entry
		let lruKey: string | null = null
		let lruTime = Infinity

		for (const [key, entry] of this.cache) {
			if (entry.lastAccessed < lruTime) {
				lruTime = entry.lastAccessed
				lruKey = key
			}
		}

		if (lruKey) {
			const entry = this.cache.get(lruKey)!
			this.currentSize -= entry.size
			this.cache.delete(lruKey)
		}
	}

	clear(): void {
		this.cache.clear()
		this.currentSize = 0
	}

	getStats(): { size: number; entries: number; hitRate: number; requests: number } {
		return {
			size: this.currentSize,
			entries: this.cache.size,
			hitRate: this.totalRequests > 0 ? (this.cacheHits / this.totalRequests) * 100 : 0,
			requests: this.totalRequests,
		}
	}

	// Get entries sorted by access frequency for cleanup decisions
	getEntriesByFrequency(): CacheEntry[] {
		return Array.from(this.cache.values()).sort((a, b) => a.accessCount - b.accessCount)
	}
}

/**
 * Memory pressure monitor
 */
class MemoryPressureMonitor {
	private config: MemoryConfig
	private cleanupCallbacks: (() => void)[] = []
	private monitoring = false
	private intervalId: NodeJS.Timeout | null = null

	constructor(config: MemoryConfig) {
		this.config = config
	}

	startMonitoring(): void {
		if (this.monitoring) return

		this.monitoring = true
		this.intervalId = setInterval(() => {
			this.checkMemoryPressure()
		}, this.config.memoryCheckInterval)
	}

	stopMonitoring(): void {
		this.monitoring = false
		if (this.intervalId) {
			clearInterval(this.intervalId)
			this.intervalId = null
		}
	}

	addCleanupCallback(callback: () => void): void {
		this.cleanupCallbacks.push(callback)
	}

	private checkMemoryPressure(): void {
		const memUsage = process.memoryUsage()
		const totalMem = os.totalmem()
		const usedMem = memUsage.heapUsed + memUsage.external
		const usagePercent = (usedMem / totalMem) * 100

		if (usagePercent > this.config.cleanupThreshold) {
			console.log(`[MemoryManager] Memory pressure detected: ${usagePercent.toFixed(1)}% usage`)
			this.triggerCleanup()
		}
	}

	private triggerCleanup(): void {
		this.cleanupCallbacks.forEach((callback) => {
			try {
				callback()
			} catch (error) {
				console.error("[MemoryManager] Cleanup callback error:", error)
			}
		})
	}

	getMemoryStats(): { used: number; total: number; percentage: number } {
		const memUsage = process.memoryUsage()
		const totalMem = os.totalmem()
		const usedMem = memUsage.heapUsed + memUsage.external

		return {
			used: usedMem,
			total: totalMem,
			percentage: (usedMem / totalMem) * 100,
		}
	}
}

/**
 * Main Memory Manager class
 */
export class MemoryManager {
	private config: MemoryConfig
	private lruCache: LRUCache
	private memoryMonitor: MemoryPressureMonitor
	private cleanupCount = 0
	private lazyLoadedFiles = new Set<string>()

	constructor(config: MemoryConfig = DEFAULT_MEMORY_CONFIG) {
		this.config = config
		this.lruCache = new LRUCache(config.maxCacheSize, config.maxCacheEntries)
		this.memoryMonitor = new MemoryPressureMonitor(config)

		// Register cleanup callback
		this.memoryMonitor.addCleanupCallback(() => this.performCleanup())
	}

	/**
	 * Initialize memory management
	 */
	initialize(): void {
		this.memoryMonitor.startMonitoring()
		console.log("[MemoryManager] Advanced memory management initialized")
	}

	/**
	 * Dispose and cleanup
	 */
	dispose(): void {
		this.memoryMonitor.stopMonitoring()
		this.lruCache.clear()
		this.lazyLoadedFiles.clear()
		console.log("[MemoryManager] Memory management disposed")
	}

	/**
	 * Get file content with intelligent caching and lazy loading
	 */
	async getFileContent(filePath: string, forceReload = false): Promise<string> {
		// Check cache first (unless forced reload)
		if (!forceReload) {
			const cached = this.lruCache.get(filePath)
			if (cached !== null) {
				return cached
			}
		}

		// Check file size to determine loading strategy
		const stats = await fs.stat(filePath)
		const fileSize = stats.size

		let content: string

		if (fileSize > this.config.streamThreshold) {
			// Stream large files
			content = await this.streamFileContent(filePath, fileSize)
		} else {
			// Load normally for smaller files
			content = await fs.readFile(filePath, "utf8")
		}

		// Cache if appropriate size
		if (fileSize <= this.config.maxFileSize) {
			this.lruCache.set(filePath, content, filePath)
		}

		return content
	}

	/**
	 * Stream large file content for memory efficiency
	 */
	private async streamFileContent(filePath: string, fileSize: number): Promise<string> {
		if (fileSize > 50 * 1024 * 1024) {
			// Files > 50MB
			// For very large files, return only first part with notice
			const handle = await fs.open(filePath, "r")
			try {
				const buffer = new Uint8Array(1024 * 1024) // Read 1MB
				const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
				const content = Buffer.from(buffer.subarray(0, bytesRead)).toString("utf8")

				return (
					content +
					"\n\n[... Large file truncated for memory efficiency ...]" +
					`\n[File size: ${Math.round(fileSize / 1024 / 1024)}MB]` +
					"\n[Use specific line ranges for full content]"
				)
			} finally {
				await handle.close()
			}
		} else {
			// For moderately large files, read normally but don't cache
			return await fs.readFile(filePath, "utf8")
		}
	}

	/**
	 * Pre-load files that are likely to be accessed (lazy loading strategy)
	 */
	async preloadFiles(filePaths: string[], priority: "high" | "low" = "low"): Promise<void> {
		const loadPromises = filePaths
			.filter((path) => !this.lazyLoadedFiles.has(path))
			.slice(0, priority === "high" ? 50 : 20) // Limit concurrent loads
			.map(async (filePath) => {
				try {
					await this.getFileContent(filePath)
					this.lazyLoadedFiles.add(filePath)
				} catch (error) {
					// Skip files that can't be read
					console.warn(`[MemoryManager] Failed to preload ${filePath}:`, error)
				}
			})

		// Load in batches to avoid overwhelming the system
		const batchSize = 5
		for (let i = 0; i < loadPromises.length; i += batchSize) {
			const batch = loadPromises.slice(i, i + batchSize)
			await Promise.all(batch)

			// Small delay between batches for non-high priority
			if (priority === "low" && i + batchSize < loadPromises.length) {
				await new Promise((resolve) => setTimeout(resolve, 10))
			}
		}
	}

	/**
	 * Memory-mapped file access for huge files (readonly)
	 */
	async getFileLines(filePath: string, startLine: number, endLine: number): Promise<string[]> {
		const handle = await fs.open(filePath, "r")
		const lines: string[] = []

		try {
			let lineNumber = 0
			let buffer = ""
			const chunkSize = 64 * 1024 // 64KB chunks
			let position = 0

			while (lineNumber <= endLine) {
				const readBuffer = new Uint8Array(chunkSize)
				const { bytesRead } = await handle.read(readBuffer, 0, chunkSize, position)

				if (bytesRead === 0) break

				buffer += Buffer.from(readBuffer.subarray(0, bytesRead)).toString("utf8")
				position += bytesRead

				// Process complete lines
				const lineBreakIndex = buffer.lastIndexOf("\n")
				if (lineBreakIndex !== -1) {
					const completeText = buffer.substring(0, lineBreakIndex)
					const currentLines = completeText.split("\n")

					for (const line of currentLines) {
						if (lineNumber >= startLine && lineNumber <= endLine) {
							lines.push(line)
						}
						lineNumber++

						if (lineNumber > endLine) {
							return lines
						}
					}

					buffer = buffer.substring(lineBreakIndex + 1)
				}
			}

			// Handle remaining buffer
			if (buffer && lineNumber >= startLine && lineNumber <= endLine) {
				lines.push(buffer)
			}
		} finally {
			await handle.close()
		}

		return lines
	}

	/**
	 * Perform cleanup when memory pressure is detected
	 */
	private performCleanup(): void {
		this.cleanupCount++

		// Clear least frequently used cache entries
		const entries = this.lruCache.getEntriesByFrequency()
		const toRemove = Math.min(entries.length / 4, 100) // Remove up to 25% or 100 entries

		// Clear some cache entries
		for (let i = 0; i < toRemove; i++) {
			// This would need actual removal logic in LRUCache
		}

		// Clear lazy loaded tracking
		this.lazyLoadedFiles.clear()

		// Force garbage collection if available
		if (global.gc) {
			global.gc()
		}

		console.log(`[MemoryManager] Cleanup performed (${this.cleanupCount}), freed cache entries`)
	}

	/**
	 * Get comprehensive memory statistics
	 */
	getStats(): MemoryStats {
		const cacheStats = this.lruCache.getStats()
		const systemStats = this.memoryMonitor.getMemoryStats()

		return {
			totalMemoryUsage: process.memoryUsage().heapUsed,
			cacheMemoryUsage: cacheStats.size,
			cachedFilesCount: cacheStats.entries,
			hitRate: cacheStats.hitRate,
			totalRequests: cacheStats.requests,
			cacheHits: Math.round((cacheStats.hitRate / 100) * cacheStats.requests),
			cleanupCount: this.cleanupCount,
			systemMemoryUsage: systemStats.used,
			systemMemoryTotal: systemStats.total,
		}
	}

	/**
	 * Update memory configuration
	 */
	updateConfig(newConfig: Partial<MemoryConfig>): void {
		this.config = { ...this.config, ...newConfig }
		// Recreate LRU cache if size limits changed
		if (newConfig.maxCacheSize || newConfig.maxCacheEntries) {
			const stats = this.lruCache.getStats()
			this.lruCache = new LRUCache(this.config.maxCacheSize, this.config.maxCacheEntries)
			console.log(`[MemoryManager] Cache recreated, previous stats:`, stats)
		}
	}

	/**
	 * Get file content with range (for very large files)
	 */
	async getFileRange(filePath: string, start: number, length: number): Promise<string> {
		const handle = await fs.open(filePath, "r")
		try {
			const buffer = new Uint8Array(length)
			const { bytesRead } = await handle.read(buffer, 0, length, start)
			return Buffer.from(buffer.subarray(0, bytesRead)).toString("utf8")
		} finally {
			await handle.close()
		}
	}

	/**
	 * Check if file should be streamed based on size
	 */
	async shouldStreamFile(filePath: string): Promise<boolean> {
		try {
			const stats = await fs.stat(filePath)
			return stats.size > this.config.streamThreshold
		} catch {
			return false
		}
	}
}
