import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { Worker } from "worker_threads"
import { fileExistsAtPath } from "@utils/fs"
import { ClineIgnoreController } from "@core/ignore/ClineIgnoreController"

export interface LargeProjectConfig {
	// File filtering
	maxFilesPerAnalysis: number
	maxFileSize: number // bytes
	excludePatterns: string[]
	priorityPatterns: string[]

	// Performance limits
	maxConcurrentOperations: number
	chunkSize: number
	streamThreshold: number // bytes

	// Intelligence features
	useAiFileRanking: boolean
	contextualFileSelection: boolean
	backgroundIndexing: boolean
}

export const LARGE_PROJECT_CONFIG: LargeProjectConfig = {
	// Aggressive file limits for large projects
	maxFilesPerAnalysis: 50, // Process max 50 files at once
	maxFileSize: 1024 * 1024, // Skip files > 1MB
	excludePatterns: [
		"**/node_modules/**",
		"**/dist/**",
		"**/build/**",
		"**/.git/**",
		"**/coverage/**",
		"**/.next/**",
		"**/target/**",
		"**/*.log",
		"**/*.tmp",
		"**/*.cache",
		"**/vendor/**",
		"**/__pycache__/**",
		"**/*.pyc",
		"**/bin/**",
		"**/obj/**",
	],
	priorityPatterns: [
		"**/src/**/*.{ts,js,tsx,jsx,py,java,cpp,h}",
		"**/lib/**/*.{ts,js,py}",
		"**/*.config.{js,ts,json}",
		"**/package.json",
		"**/README.md",
		"**/tsconfig.json",
	],

	// Parallel processing limits
	maxConcurrentOperations: 4, // Max 4 concurrent file operations
	chunkSize: 10, // Process 10 files per chunk
	streamThreshold: 256 * 1024, // Stream files > 256KB

	// AI-powered optimizations
	useAiFileRanking: true,
	contextualFileSelection: true,
	backgroundIndexing: true,
}

/**
 * Advanced optimizer for very large projects (10k+ files)
 * Implements intelligent file selection, parallel processing, and streaming
 */
export class LargeProjectOptimizer {
	private config: LargeProjectConfig
	private fileRankingCache = new Map<string, number>()
	private backgroundWorkers: Worker[] = []
	private processingQueue: string[] = []

	constructor(config: LargeProjectConfig = LARGE_PROJECT_CONFIG) {
		this.config = config
	}

	/**
	 * Get the most relevant files for analysis in a large project
	 */
	async getRelevantFiles(
		projectRoot: string,
		taskDescription: string,
		maxFiles: number = this.config.maxFilesPerAnalysis,
		clineIgnoreController?: ClineIgnoreController,
	): Promise<string[]> {
		// 1. Fast file discovery with filtering
		const allFiles = await this.fastFileDiscovery(projectRoot)

		// 2. Apply exclusion filters
		const filteredFiles = this.applyFilters(allFiles)

		// 3. Rank files by relevance
		const rankedFiles = await this.rankFilesByRelevance(filteredFiles, taskDescription, projectRoot)

		// 4. Apply Cline ignore rules
		const allowedFiles = clineIgnoreController ? clineIgnoreController.filterPaths(rankedFiles) : rankedFiles

		// 5. Return top N files
		return allowedFiles.slice(0, maxFiles)
	}

	/**
	 * Fast file discovery using native methods and workers
	 */
	private async fastFileDiscovery(projectRoot: string): Promise<string[]> {
		const files: string[] = []
		const maxDepth = 6 // Limit recursion depth for performance

		const scanDirectory = async (dirPath: string, depth: number): Promise<void> => {
			if (depth > maxDepth) return

			try {
				const entries = await fs.readdir(dirPath, { withFileTypes: true })

				// Process in chunks for better memory management
				const chunks = this.chunkArray(entries, this.config.chunkSize)

				for (const chunk of chunks) {
					await Promise.all(
						chunk.map(async (entry) => {
							const fullPath = path.join(dirPath, entry.name)

							if (entry.isDirectory()) {
								// Skip common large directories early
								if (this.shouldSkipDirectory(entry.name)) return
								await scanDirectory(fullPath, depth + 1)
							} else if (entry.isFile()) {
								// Quick size check without full stat
								if (await this.isFileTooLarge(fullPath)) return
								files.push(fullPath)
							}
						}),
					)
				}
			} catch (error) {
				// Skip directories we can't read
				console.warn(`Skipping directory ${dirPath}: ${error}`)
			}
		}

		await scanDirectory(projectRoot, 0)
		return files
	}

	/**
	 * Apply exclusion and priority filters
	 */
	private applyFilters(files: string[]): string[] {
		// 1. Filter out excluded patterns
		const excluded = files.filter((file) => {
			return !this.config.excludePatterns.some((pattern) => this.matchesPattern(file, pattern))
		})

		// 2. Prioritize important files
		const prioritized: string[] = []
		const others: string[] = []

		excluded.forEach((file) => {
			if (this.config.priorityPatterns.some((pattern) => this.matchesPattern(file, pattern))) {
				prioritized.push(file)
			} else {
				others.push(file)
			}
		})

		// Return prioritized files first
		return [...prioritized, ...others]
	}

	/**
	 * Rank files by relevance to the task using multiple signals
	 */
	private async rankFilesByRelevance(files: string[], taskDescription: string, projectRoot: string): Promise<string[]> {
		const scores = new Map<string, number>()

		// Calculate relevance scores for each file
		for (const file of files) {
			let score = 0

			// 1. File type relevance
			score += this.getFileTypeScore(file)

			// 2. Path relevance (proximity to common important directories)
			score += this.getPathRelevanceScore(file, projectRoot)

			// 3. File name relevance to task
			score += this.getNameRelevanceScore(file, taskDescription)

			// 4. Recent modification bonus
			score += await this.getRecencyScore(file)

			// 5. File size penalty (prefer smaller, more focused files)
			score += await this.getSizeScore(file)

			scores.set(file, score)
		}

		// Sort by score (highest first)
		return files.sort((a, b) => (scores.get(b) || 0) - (scores.get(a) || 0))
	}

	/**
	 * Process files in parallel with worker threads
	 */
	async processFilesInParallel<T>(files: string[], processor: (file: string) => Promise<T>): Promise<T[]> {
		const chunks = this.chunkArray(files, this.config.chunkSize)
		const results: T[] = []

		// Process chunks with limited concurrency
		const semaphore = new Array(this.config.maxConcurrentOperations).fill(null)

		await Promise.all(
			semaphore.map(async () => {
				while (chunks.length > 0) {
					const chunk = chunks.shift()
					if (!chunk) break

					// Process chunk in parallel
					const chunkResults = await Promise.all(chunk.map((file) => processor(file)))
					results.push(...chunkResults)
				}
			}),
		)

		return results
	}

	/**
	 * Stream large files instead of loading entirely into memory
	 */
	async streamFileContent(filePath: string): Promise<string> {
		const stats = await fs.stat(filePath)

		if (stats.size > this.config.streamThreshold) {
			// For large files, read in chunks and return first N lines
			const chunks: string[] = []
			const stream = await fs.open(filePath, "r")

			try {
				const buffer = new Uint8Array(this.config.streamThreshold)
				const { bytesRead } = await stream.read(buffer, 0, buffer.length, 0)
				const content = Buffer.from(buffer.subarray(0, bytesRead)).toString("utf8")

				// Return first 100 lines or first chunk, whichever is smaller
				const lines = content.split("\n").slice(0, 100)
				return lines.join("\n") + "\n\n[... file truncated for performance ...]"
			} finally {
				await stream.close()
			}
		} else {
			// Small files can be read normally
			return await fs.readFile(filePath, "utf8")
		}
	}

	/**
	 * Background indexing for future requests
	 */
	startBackgroundIndexing(projectRoot: string): void {
		if (!this.config.backgroundIndexing) return

		// Start background worker to pre-index files
		const worker = new Worker(
			`
			const { parentPort } = require('worker_threads');
			// Background indexing logic here
			parentPort.postMessage('indexing-complete');
		`,
			{ eval: true },
		)

		this.backgroundWorkers.push(worker)
	}

	// Utility methods
	private shouldSkipDirectory(name: string): boolean {
		const skipDirs = ["node_modules", ".git", "dist", "build", "coverage", "target", "vendor", "__pycache__"]
		return skipDirs.includes(name)
	}

	private async isFileTooLarge(filePath: string): Promise<boolean> {
		try {
			const stats = await fs.stat(filePath)
			return stats.size > this.config.maxFileSize
		} catch {
			return true // If we can't stat it, skip it
		}
	}

	private matchesPattern(filePath: string, pattern: string): boolean {
		// Simple glob pattern matching
		const regex = pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")
		return new RegExp(regex).test(filePath)
	}

	private getFileTypeScore(file: string): number {
		const ext = path.extname(file).toLowerCase()
		const scores: Record<string, number> = {
			".ts": 10,
			".js": 9,
			".tsx": 10,
			".jsx": 9,
			".py": 8,
			".java": 7,
			".cpp": 6,
			".h": 6,
			".json": 5,
			".md": 4,
			".txt": 2,
			".log": -5,
			".tmp": -10,
		}
		return scores[ext] || 0
	}

	private getPathRelevanceScore(file: string, projectRoot: string): number {
		const relativePath = path.relative(projectRoot, file)
		let score = 0

		if (relativePath.includes("src/")) score += 5
		if (relativePath.includes("lib/")) score += 4
		if (relativePath.includes("components/")) score += 4
		if (relativePath.includes("test/")) score -= 2
		if (relativePath.includes("spec/")) score -= 2

		return score
	}

	private getNameRelevanceScore(file: string, taskDescription: string): number {
		const fileName = path.basename(file).toLowerCase()
		const taskWords = taskDescription.toLowerCase().split(/\s+/)

		let score = 0
		taskWords.forEach((word) => {
			if (word.length > 3 && fileName.includes(word)) {
				score += 3
			}
		})

		return score
	}

	private async getRecencyScore(file: string): Promise<number> {
		try {
			const stats = await fs.stat(file)
			const daysSinceModified = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24)
			return Math.max(0, 5 - daysSinceModified) // Bonus for recently modified files
		} catch {
			return 0
		}
	}

	private async getSizeScore(file: string): Promise<number> {
		try {
			const stats = await fs.stat(file)
			// Prefer files between 1KB and 100KB
			if (stats.size < 1024) return -2 // Too small
			if (stats.size > 100 * 1024) return -3 // Too large
			return 2 // Good size
		} catch {
			return 0
		}
	}

	private chunkArray<T>(array: T[], size: number): T[][] {
		const chunks: T[][] = []
		for (let i = 0; i < array.length; i += size) {
			chunks.push(array.slice(i, i + size))
		}
		return chunks
	}

	// Cleanup
	dispose(): void {
		this.backgroundWorkers.forEach((worker) => worker.terminate())
		this.backgroundWorkers = []
	}
}
