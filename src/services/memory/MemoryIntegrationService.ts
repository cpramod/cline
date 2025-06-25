import * as fs from "fs/promises"
import { PathLike } from "fs"
import * as path from "path"
import * as vscode from "vscode"
import { MemoryManager, DEFAULT_MEMORY_CONFIG } from "./MemoryManager"

/**
 * Integration service that connects MemoryManager with existing Cline services
 * Provides memory-optimized file operations throughout the system
 */
export class MemoryIntegrationService {
	private memoryManager: MemoryManager
	private isEnabled = false
	private originalReadFile: typeof fs.readFile
	private fileAccessStats = new Map<string, { count: number; lastAccess: number }>()

	constructor(context: vscode.ExtensionContext) {
		const config = context.globalState.get("memoryConfig", DEFAULT_MEMORY_CONFIG)
		this.memoryManager = new MemoryManager(config)
		this.originalReadFile = fs.readFile
	}

	/**
	 * Initialize memory integration
	 */
	async initialize(context: vscode.ExtensionContext): Promise<void> {
		const enabled = await context.globalState.get("memoryOptimizationsEnabled", false)

		if (enabled) {
			this.enable()
		}

		console.log(`[MemoryIntegration] Service initialized, enabled: ${this.isEnabled}`)
	}

	/**
	 * Enable memory optimizations
	 */
	enable(): void {
		if (this.isEnabled) return

		this.memoryManager.initialize()
		this.hookFileOperations()
		this.isEnabled = true

		console.log("[MemoryIntegration] Memory optimizations enabled")
	}

	/**
	 * Disable memory optimizations
	 */
	disable(): void {
		if (!this.isEnabled) return

		this.unhookFileOperations()
		this.memoryManager.dispose()
		this.isEnabled = false

		console.log("[MemoryIntegration] Memory optimizations disabled")
	}

	/**
	 * Hook into file operations to use memory-optimized reading
	 */
	private hookFileOperations(): void {
		// Override fs.readFile to use memory manager
		const self = this

		// Create a proxy for fs.readFile that uses our memory manager
		const optimizedReadFile = async function (file: PathLike, options?: any): Promise<string | Buffer> {
			const filePath = file.toString()

			// Track file access
			self.trackFileAccess(filePath)

			// Use memory manager for text files
			if (!options || typeof options === "string" || (options && options.encoding)) {
				try {
					const content = await self.memoryManager.getFileContent(filePath)
					return content
				} catch (error) {
					// Fallback to original if memory manager fails
					return await self.originalReadFile(file, options)
				}
			} else {
				// For binary files, use original method
				return await self.originalReadFile(file, options)
			}
		}

		// Replace the readFile function (this is a simplified approach)
		// In production, we'd want a more sophisticated patching mechanism
		// @ts-ignore
		fs.readFile = optimizedReadFile
	}

	/**
	 * Restore original file operations
	 */
	private unhookFileOperations(): void {
		// Restore original fs.readFile
		// @ts-ignore
		fs.readFile = this.originalReadFile
	}

	/**
	 * Track file access patterns for relevance scoring
	 */
	private trackFileAccess(filePath: string): void {
		const stats = this.fileAccessStats.get(filePath) || { count: 0, lastAccess: 0 }
		stats.count++
		stats.lastAccess = Date.now()
		this.fileAccessStats.set(filePath, stats)

		// Update relevance scores periodically
		if (stats.count % 10 === 0) {
			this.updateRelevanceScores()
		}
	}

	/**
	 * Update file relevance scores based on access patterns
	 */
	private updateRelevanceScores(): void {
		const now = Date.now()
		const updateData: { filePath: string; score: number }[] = []

		for (const [filePath, stats] of this.fileAccessStats) {
			// Calculate relevance score based on frequency and recency
			const recencyScore = Math.max(0, 10 - (now - stats.lastAccess) / (24 * 60 * 60 * 1000)) // Decay over days
			const frequencyScore = Math.min(10, stats.count) // Cap at 10
			const score = (recencyScore + frequencyScore) / 2

			updateData.push({ filePath, score })
		}

		// Update relevance scores in memory manager
		// This would be used by the database cache service if integrated
	}

	/**
	 * Preload files that are likely to be accessed
	 */
	async preloadRelevantFiles(projectRoot: string, taskDescription?: string): Promise<void> {
		if (!this.isEnabled) return

		try {
			// Get list of recently accessed files
			const recentFiles = Array.from(this.fileAccessStats.entries())
				.sort((a, b) => b[1].lastAccess - a[1].lastAccess)
				.slice(0, 20)
				.map(([filePath]) => filePath)

			// Also add files from common patterns
			const commonPatterns = [
				path.join(projectRoot, "package.json"),
				path.join(projectRoot, "tsconfig.json"),
				path.join(projectRoot, "README.md"),
				path.join(projectRoot, "src", "index.ts"),
				path.join(projectRoot, "src", "main.ts"),
				path.join(projectRoot, "src", "app.ts"),
			]

			const filesToPreload = [...recentFiles, ...commonPatterns].filter(async (file) => {
				try {
					await fs.access(file)
					return true
				} catch {
					return false
				}
			})

			await this.memoryManager.preloadFiles(filesToPreload, "low")

			console.log(`[MemoryIntegration] Preloaded ${filesToPreload.length} files`)
		} catch (error) {
			console.warn("[MemoryIntegration] Failed to preload files:", error)
		}
	}

	/**
	 * Get optimized file content for Tree-sitter parsing
	 */
	async getFileContentForParsing(filePath: string): Promise<string> {
		if (!this.isEnabled) {
			return await fs.readFile(filePath, "utf8")
		}

		return await this.memoryManager.getFileContent(filePath)
	}

	/**
	 * Get file lines efficiently for large files
	 */
	async getFileLines(filePath: string, startLine: number, endLine: number): Promise<string[]> {
		if (!this.isEnabled) {
			const content = await fs.readFile(filePath, "utf8")
			const lines = content.split("\n")
			return lines.slice(startLine, endLine + 1)
		}

		return await this.memoryManager.getFileLines(filePath, startLine, endLine)
	}

	/**
	 * Check if file should be streamed
	 */
	async shouldStreamFile(filePath: string): Promise<boolean> {
		if (!this.isEnabled) return false
		return await this.memoryManager.shouldStreamFile(filePath)
	}

	/**
	 * Get memory statistics
	 */
	getMemoryStats() {
		return this.memoryManager.getStats()
	}

	/**
	 * Get file access statistics
	 */
	getFileAccessStats(): { filePath: string; count: number; lastAccess: number }[] {
		return Array.from(this.fileAccessStats.entries()).map(([filePath, stats]) => ({
			filePath,
			count: stats.count,
			lastAccess: stats.lastAccess,
		}))
	}

	/**
	 * Force memory cleanup
	 */
	forceCleanup(): void {
		// Clear file access stats for old files
		const now = Date.now()
		const cutoff = 24 * 60 * 60 * 1000 // 24 hours

		for (const [filePath, stats] of this.fileAccessStats) {
			if (now - stats.lastAccess > cutoff) {
				this.fileAccessStats.delete(filePath)
			}
		}

		console.log("[MemoryIntegration] File access stats cleaned up")
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: any): void {
		this.memoryManager.updateConfig(config)
	}

	/**
	 * Get the underlying memory manager
	 */
	getMemoryManager(): MemoryManager {
		return this.memoryManager
	}

	/**
	 * Dispose the service
	 */
	dispose(): void {
		this.disable()
		this.fileAccessStats.clear()
	}
}

// Global instance
let globalMemoryIntegration: MemoryIntegrationService | null = null

/**
 * Get the global memory integration service
 */
export function getMemoryIntegrationService(): MemoryIntegrationService | null {
	return globalMemoryIntegration
}

/**
 * Initialize the global memory integration service
 */
export function initializeMemoryIntegrationService(context: vscode.ExtensionContext): MemoryIntegrationService {
	if (!globalMemoryIntegration) {
		globalMemoryIntegration = new MemoryIntegrationService(context)
	}
	return globalMemoryIntegration
}

/**
 * Dispose the global memory integration service
 */
export function disposeMemoryIntegrationService(): void {
	if (globalMemoryIntegration) {
		globalMemoryIntegration.dispose()
		globalMemoryIntegration = null
	}
}
