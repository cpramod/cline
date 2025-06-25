import { Anthropic } from "@anthropic-ai/sdk"
import { ClineMessage } from "@shared/ExtensionMessage"

type UserContent = string | Array<Anthropic.ContentBlockParam>

/**
 * Smart Context Optimizer - Dramatically reduces API payload sizes
 * while preserving essential information for AI interactions
 */

export interface ContextOptimizationConfig {
	maxContextTokens: number // Maximum tokens to send to API
	maxFileSize: number // Maximum file size to include fully
	summaryThreshold: number // When to start summarizing old messages
	compressionRatio: number // Target compression ratio (0.1 = 90% reduction)
	preserveRecent: number // Number of recent messages to keep full
	enableSmartTruncation: boolean // Enable intelligent content truncation
}

export const DEFAULT_OPTIMIZATION_CONFIG: ContextOptimizationConfig = {
	maxContextTokens: 150000, // ~150K tokens (much smaller than 200K window)
	maxFileSize: 50000, // 50KB max file size
	summaryThreshold: 10, // Summarize after 10 messages
	compressionRatio: 0.3, // 70% size reduction
	preserveRecent: 5, // Keep last 5 messages full
	enableSmartTruncation: true, // Enable all optimizations
}

export interface OptimizationResult {
	optimizedMessages: Anthropic.Messages.MessageParam[]
	optimizedSystemPrompt: string
	originalTokens: number
	optimizedTokens: number
	compressionRatio: number
	optimizationsApplied: string[]
}

export class ContextOptimizer {
	private config: ContextOptimizationConfig

	constructor(config: ContextOptimizationConfig = DEFAULT_OPTIMIZATION_CONFIG) {
		this.config = config
	}

	/**
	 * Main optimization entry point - reduces context size intelligently
	 */
	async optimizeContext(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		clineMessages: ClineMessage[],
	): Promise<OptimizationResult> {
		const originalTokens = this.estimateTokens(systemPrompt, messages)
		const optimizationsApplied: string[] = []

		let optimizedSystemPrompt = systemPrompt
		let optimizedMessages = [...messages]

		// Skip optimization if already small enough
		if (originalTokens <= this.config.maxContextTokens) {
			return {
				optimizedMessages,
				optimizedSystemPrompt,
				originalTokens,
				optimizedTokens: originalTokens,
				compressionRatio: 1.0,
				optimizationsApplied: ["no_optimization_needed"],
			}
		}

		console.log(`[ContextOptimizer] Optimizing context: ${originalTokens} tokens -> target: ${this.config.maxContextTokens}`)

		// 1. Optimize system prompt
		if (this.config.enableSmartTruncation) {
			optimizedSystemPrompt = this.optimizeSystemPrompt(systemPrompt)
			optimizationsApplied.push("system_prompt_optimization")
		}

		// 2. Smart conversation history compression
		optimizedMessages = this.compressConversationHistory(optimizedMessages)
		optimizationsApplied.push("conversation_compression")

		// 3. Intelligent file content truncation
		optimizedMessages = this.optimizeFileContents(optimizedMessages)
		optimizationsApplied.push("file_content_optimization")

		// 4. Remove redundant information
		optimizedMessages = this.removeRedundantContent(optimizedMessages)
		optimizationsApplied.push("redundancy_removal")

		// 5. Final size check and aggressive truncation if needed
		const currentTokens = this.estimateTokens(optimizedSystemPrompt, optimizedMessages)
		if (currentTokens > this.config.maxContextTokens) {
			optimizedMessages = this.aggressiveTruncation(
				optimizedMessages,
				this.config.maxContextTokens - this.estimateTokens(optimizedSystemPrompt, []),
			)
			optimizationsApplied.push("aggressive_truncation")
		}

		const finalTokens = this.estimateTokens(optimizedSystemPrompt, optimizedMessages)
		const compressionRatio = finalTokens / originalTokens

		console.log(
			`[ContextOptimizer] Optimization complete: ${originalTokens} -> ${finalTokens} tokens (${Math.round((1 - compressionRatio) * 100)}% reduction)`,
		)

		return {
			optimizedMessages,
			optimizedSystemPrompt,
			originalTokens,
			optimizedTokens: finalTokens,
			compressionRatio,
			optimizationsApplied,
		}
	}

	/**
	 * Optimize system prompt by removing verbose sections
	 */
	private optimizeSystemPrompt(systemPrompt: string): string {
		let optimized = systemPrompt

		// Remove excessive whitespace and empty lines
		optimized = optimized.replace(/\n\s*\n\s*\n/g, "\n\n")

		// Compress environment details sections
		optimized = optimized.replace(/<environment_details>[\s\S]*?<\/environment_details>/g, (match) =>
			this.compressEnvironmentDetails(match),
		)

		// Compress tool descriptions (keep essential info only)
		optimized = optimized.replace(/Tools available[\s\S]*?(?=\n\n[A-Z]|\n\n<|$)/g, (match) =>
			this.compressToolDescriptions(match),
		)

		// Remove verbose examples if context is too large
		if (optimized.length > 20000) {
			// If still very large
			optimized = optimized.replace(/Examples?:[\s\S]*?(?=\n\n[A-Z]|\n\n<|$)/gi, "Examples: [Truncated for efficiency]")
		}

		return optimized
	}

	/**
	 * Compress environment details to essential information only
	 */
	private compressEnvironmentDetails(envDetails: string): string {
		// Extract key information
		const lines = envDetails.split("\n")
		const essential: string[] = []

		for (const line of lines) {
			// Keep critical information
			if (
				line.includes("Working Directory:") ||
				line.includes("Context Window Usage") ||
				line.includes("# Current Mode") ||
				line.includes("files, ") ||
				line.includes("tokens used")
			) {
				essential.push(line)
			}
		}

		return `<environment_details>\n${essential.join("\n")}\n</environment_details>`
	}

	/**
	 * Compress tool descriptions to essential information
	 */
	private compressToolDescriptions(toolsSection: string): string {
		// Keep tool names and brief descriptions
		const lines = toolsSection.split("\n")
		const compressed: string[] = ["Tools available:"]

		for (const line of lines) {
			if (line.trim().startsWith("-") && line.length < 100) {
				compressed.push(line)
			} else if (line.includes(":") && line.length < 80) {
				compressed.push(line)
			}
		}

		return compressed.join("\n")
	}

	/**
	 * Intelligently compress conversation history
	 */
	private compressConversationHistory(messages: Anthropic.Messages.MessageParam[]): Anthropic.Messages.MessageParam[] {
		if (messages.length <= this.config.preserveRecent + this.config.summaryThreshold) {
			return messages
		}

		const messagesToCompress = messages.length - this.config.preserveRecent
		const recentMessages = messages.slice(-this.config.preserveRecent)
		const oldMessages = messages.slice(0, messagesToCompress)

		// Group old messages and create summaries
		const summarizedOldMessages = this.createConversationSummary(oldMessages)

		return [summarizedOldMessages, ...recentMessages]
	}

	/**
	 * Create a concise summary of old conversation messages
	 */
	private createConversationSummary(messages: Anthropic.Messages.MessageParam[]): Anthropic.Messages.MessageParam {
		const summaryParts: string[] = []
		let actionsSummary: string[] = []

		for (const message of messages) {
			const content = this.extractTextFromContent(message.content)

			// Extract key actions and decisions
			if (message.role === "assistant") {
				const actions = this.extractAssistantActions(content)
				actionsSummary.push(...actions)
			} else {
				// Extract user requests/feedback
				const userIntent = this.extractUserIntent(content)
				if (userIntent) {
					summaryParts.push(`User: ${userIntent}`)
				}
			}
		}

		// Create concise summary
		const summary = [
			"[CONVERSATION SUMMARY]",
			`Previous conversation (${messages.length} messages):`,
			...summaryParts.slice(0, 5), // Keep top 5 key points
			actionsSummary.length > 0 ? `Key actions taken: ${actionsSummary.slice(0, 3).join(", ")}` : "",
			"[END SUMMARY]",
		]
			.filter(Boolean)
			.join("\n")

		return {
			role: "user",
			content: summary,
		}
	}

	/**
	 * Extract assistant actions from content
	 */
	private extractAssistantActions(content: string): string[] {
		const actions: string[] = []

		// Look for common action patterns
		const actionPatterns = [
			/created? (?:file|directory|component) (?:called )?[`"]([^`"]+)[`"]/gi,
			/modified? (?:file )?[`"]([^`"]+)[`"]/gi,
			/installed? (?:package )?[`"]([^`"]+)[`"]/gi,
			/ran? (?:command )?[`"]([^`"]+)[`"]/gi,
			/implemented? ([^.]+)/gi,
			/added? ([^.]+)/gi,
		]

		for (const pattern of actionPatterns) {
			const matches = Array.from(content.matchAll(pattern))
			for (const match of matches) {
				if (match[1] && match[1].length < 50) {
					actions.push(match[1].trim())
				}
			}
		}

		return actions.slice(0, 3) // Keep top 3 actions
	}

	/**
	 * Extract user intent from content
	 */
	private extractUserIntent(content: string): string | null {
		// Clean up content and get first meaningful sentence
		const cleaned = content
			.replace(/```[\s\S]*?```/g, "[code block]")
			.replace(/\n+/g, " ")
			.trim()

		const firstSentence = cleaned.split(/[.!?]/)[0]
		if (firstSentence && firstSentence.length > 10 && firstSentence.length < 100) {
			return firstSentence.trim()
		}

		return null
	}

	/**
	 * Optimize file contents in messages
	 */
	private optimizeFileContents(messages: Anthropic.Messages.MessageParam[]): Anthropic.Messages.MessageParam[] {
		return messages.map((message) => ({
			...message,
			content: this.optimizeMessageContent(message.content),
		}))
	}

	/**
	 * Optimize content within a message
	 */
	private optimizeMessageContent(content: UserContent): UserContent {
		if (typeof content === "string") {
			return this.optimizeTextContent(content)
		}

		if (Array.isArray(content)) {
			return content.map((block) => {
				if (block.type === "text") {
					return {
						...block,
						text: this.optimizeTextContent(block.text),
					}
				}
				return block
			})
		}

		return content
	}

	/**
	 * Optimize text content by smart truncation
	 */
	private optimizeTextContent(text: string): string {
		// If text is small, keep as is
		if (text.length <= this.config.maxFileSize) {
			return text
		}

		// Check if this looks like file content
		if (this.looksLikeFileContent(text)) {
			return this.smartTruncateFile(text)
		}

		// Check if this is code or structured content
		if (this.looksLikeCode(text)) {
			return this.smartTruncateCode(text)
		}

		// For other content, do simple truncation with summary
		return this.simpleTruncate(text)
	}

	/**
	 * Check if text looks like file content
	 */
	private looksLikeFileContent(text: string): boolean {
		return (
			text.includes("```") ||
			text.includes("File:") ||
			text.includes("<file>") ||
			(text.split("\n").length > 20 && text.length > 1000)
		)
	}

	/**
	 * Check if text looks like code
	 */
	private looksLikeCode(text: string): boolean {
		const codeIndicators = [/import\s+\w+/, /function\s+\w+/, /class\s+\w+/, /const\s+\w+\s*=/, /\{\s*\n.*\n\s*\}/s]

		return codeIndicators.some((pattern) => pattern.test(text))
	}

	/**
	 * Smart file truncation - keep important parts
	 */
	private smartTruncateFile(text: string): string {
		const lines = text.split("\n")
		const maxLines = Math.max(20, Math.floor(this.config.maxFileSize / 50))

		if (lines.length <= maxLines) {
			return text
		}

		// Keep beginning and end, add summary in middle
		const keepStart = Math.floor(maxLines * 0.4)
		const keepEnd = Math.floor(maxLines * 0.3)
		const startLines = lines.slice(0, keepStart)
		const endLines = lines.slice(-keepEnd)

		const truncatedSize = lines.length - keepStart - keepEnd
		const summary = `\n... [${truncatedSize} lines truncated for efficiency] ...\n`

		return startLines.join("\n") + summary + endLines.join("\n")
	}

	/**
	 * Smart code truncation - preserve structure
	 */
	private smartTruncateCode(text: string): string {
		const lines = text.split("\n")
		const maxLines = Math.max(30, Math.floor(this.config.maxFileSize / 40))

		if (lines.length <= maxLines) {
			return text
		}

		// Keep imports, function declarations, and structure
		const importantLines: number[] = []

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim()
			if (
				line.startsWith("import ") ||
				line.startsWith("export ") ||
				line.includes("function ") ||
				line.includes("class ") ||
				line.includes("interface ") ||
				line.includes("type ") ||
				line.match(/^\s*(\/\/|\/\*|\*)/)
			) {
				// Comments
				importantLines.push(i)
			}
		}

		// Include some context around important lines
		const linesToKeep = new Set<number>()
		for (const lineNum of importantLines) {
			for (let i = Math.max(0, lineNum - 1); i <= Math.min(lines.length - 1, lineNum + 1); i++) {
				linesToKeep.add(i)
			}
		}

		// If we don't have enough important lines, keep beginning and end
		if (linesToKeep.size < maxLines * 0.5) {
			const keepStart = Math.floor(maxLines * 0.6)
			const keepEnd = Math.floor(maxLines * 0.2)

			for (let i = 0; i < keepStart; i++) linesToKeep.add(i)
			for (let i = lines.length - keepEnd; i < lines.length; i++) linesToKeep.add(i)
		}

		// Build result with gaps marked
		const result: string[] = []
		const sortedLines = Array.from(linesToKeep).sort((a, b) => a - b)
		let lastLine = -1

		for (const lineNum of sortedLines) {
			if (lineNum > lastLine + 1) {
				const gap = lineNum - lastLine - 1
				result.push(`// ... [${gap} lines omitted] ...`)
			}
			result.push(lines[lineNum])
			lastLine = lineNum
		}

		return result.join("\n")
	}

	/**
	 * Simple truncation with summary
	 */
	private simpleTruncate(text: string): string {
		const maxLength = this.config.maxFileSize
		if (text.length <= maxLength) {
			return text
		}

		const keepStart = Math.floor(maxLength * 0.6)
		const keepEnd = Math.floor(maxLength * 0.2)

		const start = text.substring(0, keepStart)
		const end = text.substring(text.length - keepEnd)
		const omittedChars = text.length - keepStart - keepEnd

		return `${start}\n\n... [${omittedChars} characters omitted for efficiency] ...\n\n${end}`
	}

	/**
	 * Remove redundant content patterns
	 */
	private removeRedundantContent(messages: Anthropic.Messages.MessageParam[]): Anthropic.Messages.MessageParam[] {
		// Remove repeated file listings, duplicate information, etc.
		const seenContent = new Set<string>()

		return messages.map((message) => {
			const content = this.extractTextFromContent(message.content)

			// Check for repeated directory listings
			if (this.isDirectoryListing(content)) {
				const signature = this.getDirectorySignature(content)
				if (seenContent.has(signature)) {
					return {
						...message,
						content: "[Directory listing repeated - omitted for efficiency]",
					}
				}
				seenContent.add(signature)
			}

			return message
		})
	}

	/**
	 * Check if content is a directory listing
	 */
	private isDirectoryListing(content: string): boolean {
		const lines = content.split("\n")
		const hasFilePattern = lines.some(
			(line) => line.includes("/") && (line.includes(".js") || line.includes(".ts") || line.includes(".json")),
		)
		return hasFilePattern && lines.length > 10
	}

	/**
	 * Get signature for directory listing to detect duplicates
	 */
	private getDirectorySignature(content: string): string {
		const lines = content.split("\n").slice(0, 10) // First 10 lines
		return lines.join("|").substring(0, 100)
	}

	/**
	 * Aggressive truncation when other methods aren't enough
	 */
	private aggressiveTruncation(
		messages: Anthropic.Messages.MessageParam[],
		targetTokens: number,
	): Anthropic.Messages.MessageParam[] {
		const currentTokens = this.estimateTokens("", messages)
		if (currentTokens <= targetTokens) {
			return messages
		}

		// Keep the most recent messages and summary
		const keepRecent = Math.max(2, Math.floor(messages.length * 0.3))
		const recentMessages = messages.slice(-keepRecent)

		// Create ultra-concise summary of older messages
		const olderMessages = messages.slice(0, -keepRecent)
		if (olderMessages.length > 0) {
			const ultraSummary: Anthropic.Messages.MessageParam = {
				role: "user",
				content: `[CONTEXT SUMMARY: Previous ${olderMessages.length} messages covered project setup, file modifications, and implementation steps. Key context preserved in recent messages.]`,
			}

			return [ultraSummary, ...recentMessages]
		}

		return recentMessages
	}

	/**
	 * Extract text content from various content types
	 */
	private extractTextFromContent(content: UserContent): string {
		if (typeof content === "string") {
			return content
		}

		if (Array.isArray(content)) {
			return content
				.filter((block) => block.type === "text")
				.map((block) => ("text" in block ? block.text : ""))
				.join("\n")
		}

		return ""
	}

	/**
	 * Estimate token count (rough approximation)
	 */
	private estimateTokens(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): number {
		const systemTokens = Math.ceil(systemPrompt.length / 4) // ~4 chars per token

		const messageTokens = messages.reduce((total, message) => {
			const content = this.extractTextFromContent(message.content)
			return total + Math.ceil(content.length / 4)
		}, 0)

		return systemTokens + messageTokens
	}

	/**
	 * Update configuration
	 */
	updateConfig(newConfig: Partial<ContextOptimizationConfig>): void {
		this.config = { ...this.config, ...newConfig }
	}

	/**
	 * Get optimization statistics
	 */
	getOptimizationStats(): {
		config: ContextOptimizationConfig
		estimatedSavings: string
	} {
		const estimatedSavings = `${Math.round((1 - this.config.compressionRatio) * 100)}% typical reduction`

		return {
			config: this.config,
			estimatedSavings,
		}
	}
}
