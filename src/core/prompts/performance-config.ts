/**
 * Performance optimization configuration for Cline
 * Contains settings and utilities to improve response speed
 */

export interface PerformanceConfig {
	// Timeout optimizations
	fastApiTimeout: number
	quickMcpTimeout: number

	// Context optimizations
	maxFileListingDepth: number
	maxContextFiles: number
	compactSystemPrompt: boolean

	// Streaming optimizations
	preferStreaming: boolean
	streamBufferSize: number
}

export const FAST_PERFORMANCE_CONFIG: PerformanceConfig = {
	// Reduce timeouts for faster responses
	fastApiTimeout: 15000, // 15s instead of 30s
	quickMcpTimeout: 10000, // 10s instead of 60s

	// Limit context to essential information
	maxFileListingDepth: 2, // Limit deep file tree scanning
	maxContextFiles: 20, // Limit files in context
	compactSystemPrompt: true, // Use shorter system prompt

	// Optimize streaming
	preferStreaming: true,
	streamBufferSize: 512,
}

export const BALANCED_PERFORMANCE_CONFIG: PerformanceConfig = {
	fastApiTimeout: 20000, // 20s
	quickMcpTimeout: 30000, // 30s
	maxFileListingDepth: 3,
	maxContextFiles: 50,
	compactSystemPrompt: false,
	preferStreaming: true,
	streamBufferSize: 1024,
}

/**
 * Get timeout value based on performance mode
 */
export function getOptimizedTimeout(baseTimeout: number, config: PerformanceConfig): number {
	if (config.fastApiTimeout && config.fastApiTimeout < baseTimeout) {
		return config.fastApiTimeout
	}
	return baseTimeout
}

/**
 * Check if we should use compact system prompt for faster responses
 */
export function shouldUseCompactPrompt(config: PerformanceConfig = FAST_PERFORMANCE_CONFIG): boolean {
	return config.compactSystemPrompt
}

/**
 * Get optimized context window settings
 */
export function getContextLimits(config: PerformanceConfig = FAST_PERFORMANCE_CONFIG) {
	return {
		maxFiles: config.maxContextFiles,
		maxDepth: config.maxFileListingDepth,
	}
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
	private startTime: number = 0
	private metrics: { [key: string]: number[] } = {}

	startTimer(operation: string): void {
		this.startTime = Date.now()
	}

	endTimer(operation: string): number {
		const duration = Date.now() - this.startTime
		if (!this.metrics[operation]) {
			this.metrics[operation] = []
		}
		this.metrics[operation].push(duration)
		return duration
	}

	getAverageTime(operation: string): number {
		const times = this.metrics[operation] || []
		if (times.length === 0) {
			return 0
		}
		return times.reduce((a, b) => a + b, 0) / times.length
	}

	getReport(): string {
		const report: string[] = ["Performance Report:"]
		for (const [operation, times] of Object.entries(this.metrics)) {
			const avg = this.getAverageTime(operation)
			const count = times.length
			report.push(`${operation}: ${avg.toFixed(1)}ms avg (${count} samples)`)
		}
		return report.join("\n")
	}
}
