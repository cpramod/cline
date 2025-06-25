import * as fs from "fs/promises"
import * as path from "path"
import { MemoryManager } from "./MemoryManager"

/**
 * Memory-optimized file reader specifically designed for code analysis
 * Provides intelligent caching, streaming, and efficient parsing support
 */
export class MemoryOptimizedFileReader {
	private memoryManager: MemoryManager
	private recentFiles = new Map<string, { content: string; timestamp: number }>()
	private fileTypePatterns = {
		code: /\.(ts|js|tsx|jsx|py|java|cpp|c|h|cs|php|rb|go|rs|swift|kt)$/i,
		config: /\.(json|yaml|yml|toml|ini|cfg|conf)$/i,
		markup: /\.(html|xml|svg|md|rst|tex)$/i,
		data: /\.(csv|txt|log)$/i,
		binary: /\.(png|jpg|jpeg|gif|pdf|zip|tar|gz|exe|dll|so|dylib)$/i,
	}

	constructor(memoryManager: MemoryManager) {
		this.memoryManager = memoryManager
	}

	/**
	 * Read file with intelligent caching and optimization
	 */
	async readFile(
		filePath: string,
		options?: {
			maxSize?: number
			encoding?: BufferEncoding
			priority?: "high" | "normal" | "low"
			parseType?: "code" | "config" | "text" | "binary"
		},
	): Promise<string> {
		const opts = {
			maxSize: 50 * 1024 * 1024, // 50MB default max
			encoding: "utf8" as BufferEncoding,
			priority: "normal" as "high" | "normal" | "low",
			parseType: this.detectFileType(filePath),
			...options,
		}

		// Check recent files cache first for very recent files
		const recent = this.recentFiles.get(filePath)
		if (recent && Date.now() - recent.timestamp < 5000) {
			// 5 second cache
			return recent.content
		}

		// Use memory manager for efficient reading
		let content: string

		try {
			// Check if file should be streamed
			const shouldStream = await this.memoryManager.shouldStreamFile(filePath)

			if (shouldStream) {
				content = await this.readLargeFile(filePath, opts.maxSize)
			} else {
				content = await this.memoryManager.getFileContent(filePath)
			}

			// Cache recent files for immediate re-access
			this.recentFiles.set(filePath, { content, timestamp: Date.now() })

			// Cleanup old recent files
			this.cleanupRecentFiles()

			return content
		} catch (error) {
			// Fallback to standard file reading
			console.warn(`[MemoryOptimizedFileReader] Failed to read ${filePath} via memory manager, falling back:`, error)
			return await fs.readFile(filePath, opts.encoding)
		}
	}

	/**
	 * Read file lines efficiently for large files
	 */
	async readFileLines(filePath: string, startLine: number, endLine: number): Promise<string[]> {
		try {
			return await this.memoryManager.getFileLines(filePath, startLine, endLine)
		} catch (error) {
			// Fallback to standard reading
			const content = await fs.readFile(filePath, "utf8")
			const lines = content.split("\n")
			return lines.slice(startLine, endLine + 1)
		}
	}

	/**
	 * Read file with specific byte range
	 */
	async readFileRange(filePath: string, start: number, length: number): Promise<string> {
		try {
			return await this.memoryManager.getFileRange(filePath, start, length)
		} catch (error) {
			// Fallback to standard reading
			const handle = await fs.open(filePath, "r")
			try {
				const buffer = new Uint8Array(length)
				const { bytesRead } = await handle.read(buffer, 0, length, start)
				return Buffer.from(buffer.subarray(0, bytesRead)).toString("utf8")
			} finally {
				await handle.close()
			}
		}
	}

	/**
	 * Read multiple files efficiently with batching
	 */
	async readFiles(
		filePaths: string[],
		options?: {
			batchSize?: number
			priority?: "high" | "normal" | "low"
			maxConcurrency?: number
		},
	): Promise<{ [filePath: string]: string }> {
		const opts = {
			batchSize: 10,
			priority: "normal" as "high" | "normal" | "low",
			maxConcurrency: 5,
			...options,
		}

		const results: { [filePath: string]: string } = {}
		const semaphore = new Semaphore(opts.maxConcurrency)

		// Process files in batches
		for (let i = 0; i < filePaths.length; i += opts.batchSize) {
			const batch = filePaths.slice(i, i + opts.batchSize)

			const batchPromises = batch.map(async (filePath) => {
				await semaphore.acquire()
				try {
					const content = await this.readFile(filePath, { priority: opts.priority })
					results[filePath] = content
				} catch (error) {
					console.warn(`[MemoryOptimizedFileReader] Failed to read ${filePath}:`, error)
					results[filePath] = ""
				} finally {
					semaphore.release()
				}
			})

			await Promise.all(batchPromises)
		}

		return results
	}

	/**
	 * Get file metadata without reading content
	 */
	async getFileMetadata(filePath: string): Promise<{
		size: number
		modified: Date
		type: string
		shouldStream: boolean
		isCached: boolean
	}> {
		const stats = await fs.stat(filePath)
		const shouldStream = await this.memoryManager.shouldStreamFile(filePath)

		return {
			size: stats.size,
			modified: stats.mtime,
			type: this.detectFileType(filePath),
			shouldStream,
			isCached: this.recentFiles.has(filePath),
		}
	}

	/**
	 * Preload files based on patterns and priorities
	 */
	async preloadFiles(
		projectRoot: string,
		patterns?: {
			include?: string[]
			exclude?: string[]
			priority?: "high" | "low"
			maxFiles?: number
		},
	): Promise<number> {
		const opts = {
			include: ["**/*.ts", "**/*.js", "**/*.json"],
			exclude: ["**/node_modules/**", "**/dist/**", "**/*.min.js"],
			priority: "low" as "high" | "low",
			maxFiles: 100,
			...patterns,
		}

		try {
			// Find files matching patterns
			const files = await this.findFiles(projectRoot, opts.include, opts.exclude)
			const limitedFiles = files.slice(0, opts.maxFiles)

			// Sort by priority (smaller files first for faster loading)
			// Get file sizes first, then sort
			const filesWithSizes = await Promise.all(
				limitedFiles.map(async (file) => {
					try {
						const stat = await fs.stat(file)
						return { file, size: stat.size }
					} catch {
						return { file, size: 0 }
					}
				}),
			)

			filesWithSizes.sort((a, b) => a.size - b.size)
			const sortedFiles = filesWithSizes.map((item) => item.file)

			// Preload using memory manager
			await this.memoryManager.preloadFiles(sortedFiles, opts.priority)

			return sortedFiles.length
		} catch (error) {
			console.warn("[MemoryOptimizedFileReader] Failed to preload files:", error)
			return 0
		}
	}

	/**
	 * Read large file with chunking and memory management
	 */
	private async readLargeFile(filePath: string, maxSize: number): Promise<string> {
		const stats = await fs.stat(filePath)

		if (stats.size > maxSize) {
			// For very large files, read only the beginning with a notice
			const content = await this.memoryManager.getFileRange(filePath, 0, maxSize)
			return (
				content +
				"\n\n[... File truncated for memory efficiency ...]" +
				`\n[Total file size: ${Math.round(stats.size / 1024 / 1024)}MB]` +
				"\n[Use readFileLines() or readFileRange() for specific sections]"
			)
		} else {
			return await this.memoryManager.getFileContent(filePath)
		}
	}

	/**
	 * Detect file type based on extension
	 */
	private detectFileType(filePath: string): string {
		const ext = path.extname(filePath).toLowerCase()

		for (const [type, pattern] of Object.entries(this.fileTypePatterns)) {
			if (pattern.test(filePath)) {
				return type
			}
		}

		return "unknown"
	}

	/**
	 * Find files matching patterns
	 */
	private async findFiles(projectRoot: string, include: string[], exclude: string[]): Promise<string[]> {
		// This is a simplified implementation
		// In production, you'd want to use a proper glob library
		const files: string[] = []

		const walkDir = async (dir: string): Promise<void> => {
			try {
				const entries = await fs.readdir(dir, { withFileTypes: true })

				for (const entry of entries) {
					const fullPath = path.join(dir, entry.name)
					const relativePath = path.relative(projectRoot, fullPath)

					// Check exclude patterns
					if (exclude.some((pattern) => this.matchesPattern(relativePath, pattern))) {
						continue
					}

					if (entry.isDirectory()) {
						await walkDir(fullPath)
					} else if (entry.isFile()) {
						// Check include patterns
						if (include.some((pattern) => this.matchesPattern(relativePath, pattern))) {
							files.push(fullPath)
						}
					}
				}
			} catch (error) {
				// Skip directories we can't read
			}
		}

		await walkDir(projectRoot)
		return files
	}

	/**
	 * Simple pattern matching (simplified glob)
	 */
	private matchesPattern(filePath: string, pattern: string): boolean {
		// Convert glob pattern to regex (simplified)
		const regexPattern = pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\./g, "\\.")

		const regex = new RegExp(`^${regexPattern}$`)
		return regex.test(filePath)
	}

	/**
	 * Cleanup old recent files cache
	 */
	private cleanupRecentFiles(): void {
		const now = Date.now()
		const maxAge = 30000 // 30 seconds

		for (const [filePath, data] of this.recentFiles) {
			if (now - data.timestamp > maxAge) {
				this.recentFiles.delete(filePath)
			}
		}
	}

	/**
	 * Clear all caches
	 */
	clear(): void {
		this.recentFiles.clear()
	}

	/**
	 * Get statistics
	 */
	getStats(): {
		recentFilesCount: number
		memoryStats: any
	} {
		return {
			recentFilesCount: this.recentFiles.size,
			memoryStats: this.memoryManager.getStats(),
		}
	}
}

/**
 * Simple semaphore implementation for concurrency control
 */
class Semaphore {
	private count: number
	private waiting: (() => void)[] = []

	constructor(count: number) {
		this.count = count
	}

	async acquire(): Promise<void> {
		if (this.count > 0) {
			this.count--
			return
		}

		return new Promise((resolve) => {
			this.waiting.push(resolve)
		})
	}

	release(): void {
		this.count++
		const next = this.waiting.shift()
		if (next) {
			this.count--
			next()
		}
	}
}
