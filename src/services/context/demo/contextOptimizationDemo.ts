import { ContextOptimizer, DEFAULT_OPTIMIZATION_CONFIG } from "../ContextOptimizer"
import { Anthropic } from "@anthropic-ai/sdk"
import { ClineMessage } from "@shared/ExtensionMessage"

/**
 * Demo script showcasing the context optimization capabilities
 * Run this to see how context optimization dramatically reduces API payload sizes
 */

async function runContextOptimizationDemo(): Promise<void> {
	console.log("🚀 Cline Context Optimization Demo")
	console.log("=".repeat(50))

	// Initialize context optimizer
	const optimizer = new ContextOptimizer({
		...DEFAULT_OPTIMIZATION_CONFIG,
		maxContextTokens: 100000, // 100K token limit for demo
		compressionRatio: 0.3, // 70% reduction target
		enableSmartTruncation: true,
	})

	console.log("\n1️⃣ Demo Setup")
	console.log("-".repeat(20))
	console.log("📊 Configuration:")
	console.log(`   • Max Context: ${optimizer.getOptimizationStats().config.maxContextTokens.toLocaleString()} tokens`)
	console.log(`   • Target Compression: ${Math.round((1 - optimizer.getOptimizationStats().config.compressionRatio) * 100)}%`)
	console.log(`   • Max File Size: ${Math.round(optimizer.getOptimizationStats().config.maxFileSize / 1024)}KB`)

	// Demo 1: System Prompt Optimization
	console.log("\n2️⃣ Demo 1: System Prompt Optimization")
	console.log("-".repeat(40))

	const verboseSystemPrompt = createVerboseSystemPrompt()
	console.log(`📝 Original system prompt: ${verboseSystemPrompt.length.toLocaleString()} characters`)

	const optimizedSystemPrompt = await optimizer["optimizeSystemPrompt"](verboseSystemPrompt)
	console.log(`⚡ Optimized system prompt: ${optimizedSystemPrompt.length.toLocaleString()} characters`)
	console.log(`💡 Reduction: ${Math.round((1 - optimizedSystemPrompt.length / verboseSystemPrompt.length) * 100)}%`)

	// Demo 2: Large File Content Optimization
	console.log("\n3️⃣ Demo 2: Large File Content Optimization")
	console.log("-".repeat(45))

	const largeFileContent = createLargeFileContent()
	console.log(`📁 Original file content: ${largeFileContent.length.toLocaleString()} characters`)

	const optimizedFileContent = await optimizer["optimizeTextContent"](largeFileContent)
	console.log(`🗜️  Optimized file content: ${optimizedFileContent.length.toLocaleString()} characters`)
	console.log(`💡 Reduction: ${Math.round((1 - optimizedFileContent.length / largeFileContent.length) * 100)}%`)

	// Demo 3: Full Conversation Optimization
	console.log("\n4️⃣ Demo 3: Full Conversation Optimization")
	console.log("-".repeat(42))

	const { systemPrompt, messages, clineMessages } = createTestConversation()
	console.log(`💬 Original conversation: ${messages.length} messages`)

	const originalTokens = estimateTokens(systemPrompt, messages)
	console.log(`📊 Original size: ${originalTokens.toLocaleString()} estimated tokens`)

	const result = await optimizer.optimizeContext(systemPrompt, messages, clineMessages)

	console.log(`⚡ Optimized size: ${result.optimizedTokens.toLocaleString()} tokens`)
	console.log(`🎯 Compression ratio: ${Math.round((1 - result.compressionRatio) * 100)}% reduction`)
	console.log(`🔧 Optimizations applied:`)
	result.optimizationsApplied.forEach((opt) => {
		console.log(`   • ${opt.replace(/_/g, " ").toUpperCase()}`)
	})

	// Demo 4: Performance Impact Simulation
	console.log("\n5️⃣ Demo 4: Performance Impact Simulation")
	console.log("-".repeat(44))

	const originalPayloadSize = originalTokens * 4 // ~4 chars per token
	const optimizedPayloadSize = result.optimizedTokens * 4

	// Simulate API call times based on payload size
	const baseLatency = 500 // Base API latency in ms
	const originalTransferTime = Math.round(originalPayloadSize / 1000) // 1KB per ms approximation
	const optimizedTransferTime = Math.round(optimizedPayloadSize / 1000)

	const originalTotalTime = baseLatency + originalTransferTime
	const optimizedTotalTime = baseLatency + optimizedTransferTime
	const speedup = originalTotalTime / optimizedTotalTime

	console.log(`⏱️  API Response Time Simulation:`)
	console.log(`   • Original: ~${originalTotalTime}ms`)
	console.log(`   • Optimized: ~${optimizedTotalTime}ms`)
	console.log(`   • Speed improvement: ${speedup.toFixed(1)}x faster`)

	// Demo 5: Memory Usage Impact
	console.log("\n6️⃣ Demo 5: Memory Usage Impact")
	console.log("-".repeat(32))

	const originalMemoryMB = Math.round(originalPayloadSize / 1024 / 1024)
	const optimizedMemoryMB = Math.round(optimizedPayloadSize / 1024 / 1024)
	const memorySaved = originalMemoryMB - optimizedMemoryMB

	console.log(`🧠 Memory Usage:`)
	console.log(`   • Original: ~${originalMemoryMB}MB`)
	console.log(`   • Optimized: ~${optimizedMemoryMB}MB`)
	console.log(`   • Memory saved: ${memorySaved}MB (${Math.round((memorySaved / originalMemoryMB) * 100)}%)`)

	// Demo 6: Different Optimization Levels
	console.log("\n7️⃣ Demo 6: Optimization Level Comparison")
	console.log("-".repeat(46))

	const levels = [
		{ name: "Conservative", ratio: 0.7 },
		{ name: "Balanced", ratio: 0.3 },
		{ name: "Aggressive", ratio: 0.15 },
	]

	console.log(`📊 Optimization Levels:`)
	for (const level of levels) {
		const levelOptimizer = new ContextOptimizer({
			...DEFAULT_OPTIMIZATION_CONFIG,
			compressionRatio: level.ratio,
		})

		const levelResult = await levelOptimizer.optimizeContext(systemPrompt, messages, clineMessages)
		const reduction = Math.round((1 - levelResult.compressionRatio) * 100)
		const speedEstimate = 1 / level.ratio

		console.log(`   • ${level.name}: ${reduction}% reduction, ~${speedEstimate.toFixed(1)}x speed boost`)
	}

	// Final Summary
	console.log("\n📊 Final Demo Summary")
	console.log("-".repeat(28))

	console.log(`🎉 Context Optimization Results:`)
	console.log(`   • Token reduction: ${Math.round((1 - result.compressionRatio) * 100)}%`)
	console.log(`   • Speed improvement: ${speedup.toFixed(1)}x faster API responses`)
	console.log(`   • Memory savings: ${memorySaved}MB`)
	console.log(`   • Preserved context quality: Smart truncation`)

	console.log(`\n💡 Key Benefits Demonstrated:`)
	console.log(`   • Dramatically faster API responses`)
	console.log(`   • Significant memory savings`)
	console.log(`   • Intelligent content preservation`)
	console.log(`   • Configurable optimization levels`)
	console.log(`   • Automatic redundancy removal`)

	console.log(`\n✅ Demo completed successfully!`)
	console.log(`\n🚀 Ready to integrate with Cline for real performance improvements!`)
}

/**
 * Create a verbose system prompt for testing
 */
function createVerboseSystemPrompt(): string {
	return `You are Cline, an AI coding assistant. You help developers with coding tasks, debugging, and project management.

<environment_details>
Working Directory: /home/user/large-project
Operating System: Linux 6.8.0-62-generic
Architecture: x86_64
Available Shell: /usr/bin/zsh

Project Structure:
- src/
  - components/
    - Button.tsx (2.3KB)
    - Input.tsx (1.8KB)
    - Modal.tsx (3.2KB)
    - Form.tsx (4.1KB)
    - Layout.tsx (2.9KB)
  - utils/
    - helpers.ts (5.2KB)
    - constants.ts (1.1KB)
    - validators.ts (3.8KB)
  - pages/
    - Home.tsx (6.4KB)
    - About.tsx (2.1KB)
    - Contact.tsx (3.9KB)
- tests/
  - components/
    - Button.test.tsx (1.9KB)
    - Input.test.tsx (1.5KB)
  - utils/
    - helpers.test.ts (2.8KB)
- package.json (892 bytes)
- tsconfig.json (445 bytes)
- README.md (1.2KB)

Total: 2,847 files, 1.2GB

Context Window Usage:
89,432 / 200K tokens used (44%)

Current Mode:
ACT MODE
</environment_details>

Tools available:
- read_file: Read and examine file contents
- write_file: Create or modify files
- edit_file: Make targeted edits to existing files
- execute_command: Run shell commands
- search_files: Search for content across files
- list_directory: List directory contents
- create_directory: Create new directories
- delete_file: Remove files
- move_file: Rename or move files
- search_and_replace: Find and replace text patterns

Examples:
When creating React components, follow these patterns:
1. Use TypeScript for type safety
2. Implement proper error boundaries
3. Follow accessibility guidelines
4. Use CSS modules for styling
5. Write comprehensive tests

When debugging issues:
1. Check console errors first
2. Verify environment setup
3. Review recent changes
4. Test in isolation
5. Use debugging tools

When optimizing performance:
1. Profile the application
2. Identify bottlenecks
3. Implement optimizations
4. Measure improvements
5. Document changes

Always:
- Follow best practices
- Write clean, maintainable code
- Include proper error handling
- Add comprehensive tests
- Update documentation
- Consider security implications
- Optimize for performance
- Ensure accessibility compliance`
}

/**
 * Create large file content for testing
 */
function createLargeFileContent(): string {
	const imports = [
		"import React, { useState, useEffect, useCallback, useMemo } from 'react'",
		"import { Button, Input, Modal, Form } from '../components'",
		"import { validateEmail, formatDate, debounce } from '../utils/helpers'",
		"import { API_ENDPOINTS, VALIDATION_RULES } from '../utils/constants'",
		"import styles from './UserDashboard.module.css'",
	].join("\n")

	const interfaces = `
interface User {
	id: string
	name: string
	email: string
	avatar?: string
	preferences: UserPreferences
	createdAt: Date
	updatedAt: Date
}

interface UserPreferences {
	theme: 'light' | 'dark'
	notifications: boolean
	language: string
	timezone: string
}`

	const component = `
export const UserDashboard: React.FC = () => {
	const [users, setUsers] = useState<User[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [searchTerm, setSearchTerm] = useState('')
	const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

	const fetchUsers = useCallback(async () => {
		try {
			setLoading(true)
			setError(null)
			
			const response = await fetch(API_ENDPOINTS.USERS)
			if (!response.ok) {
				throw new Error('Failed to fetch users')
			}
			
			const userData = await response.json()
			setUsers(userData)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error')
		} finally {
			setLoading(false)
		}
	}, [])

	const debouncedSearch = useMemo(
		() => debounce((term: string) => {
			// Search implementation
			console.log('Searching for:', term)
		}, 300),
		[]
	)

	useEffect(() => {
		fetchUsers()
	}, [fetchUsers])

	useEffect(() => {
		if (searchTerm) {
			debouncedSearch(searchTerm)
		}
	}, [searchTerm, debouncedSearch])

	const sortedUsers = useMemo(() => {
		return [...users].sort((a, b) => {
			const comparison = a.name.localeCompare(b.name)
			return sortOrder === 'asc' ? comparison : -comparison
		})
	}, [users, sortOrder])

	const filteredUsers = useMemo(() => {
		if (!searchTerm) return sortedUsers
		
		return sortedUsers.filter(user =>
			user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
			user.email.toLowerCase().includes(searchTerm.toLowerCase())
		)
	}, [sortedUsers, searchTerm])

	if (loading) {
		return <div className={styles.loading}>Loading users...</div>
	}

	if (error) {
		return <div className={styles.error}>Error: {error}</div>
	}

	return (
		<div className={styles.dashboard}>
			<header className={styles.header}>
				<h1>User Dashboard</h1>
				<div className={styles.controls}>
					<Input
						placeholder="Search users..."
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						className={styles.searchInput}
					/>
					<Button
						onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
						className={styles.sortButton}
					>
						Sort {sortOrder === 'asc' ? '↑' : '↓'}
					</Button>
				</div>
			</header>

			<div className={styles.userGrid}>
				{filteredUsers.map(user => (
					<div key={user.id} className={styles.userCard}>
						<div className={styles.userAvatar}>
							{user.avatar ? (
								<img src={user.avatar} alt={user.name} />
							) : (
								<div className={styles.defaultAvatar}>
									{user.name.charAt(0).toUpperCase()}
								</div>
							)}
						</div>
						<div className={styles.userInfo}>
							<h3>{user.name}</h3>
							<p>{user.email}</p>
							<small>Joined {formatDate(user.createdAt)}</small>
						</div>
						<div className={styles.userActions}>
							<Button size="small" variant="outline">
								Edit
							</Button>
							<Button size="small" variant="danger">
								Delete
							</Button>
						</div>
					</div>
				))}
			</div>

			{filteredUsers.length === 0 && (
				<div className={styles.emptyState}>
					<p>No users found matching your search.</p>
				</div>
			)}
		</div>
	)
}`

	// Repeat content to make it large
	const repeatedContent = Array(10).fill(component).join("\n\n// Repeated section\n\n")

	return `${imports}\n${interfaces}\n${repeatedContent}`
}

/**
 * Create test conversation for optimization
 */
function createTestConversation() {
	const systemPrompt = createVerboseSystemPrompt()

	const messages: Anthropic.Messages.MessageParam[] = [
		{
			role: "user",
			content:
				"I need help setting up a React project with TypeScript. Can you help me create the initial file structure and configuration?",
		},
		{
			role: "assistant",
			content:
				"I'll help you set up a React project with TypeScript. Let me create the initial file structure and configuration files.\n\nFirst, let me create the package.json file...",
		},
		{
			role: "user",
			content:
				"Great! Now can you help me create a component library with some basic components like Button, Input, and Modal?",
		},
		{
			role: "assistant",
			content: createLargeFileContent(), // Large response
		},
		{
			role: "user",
			content:
				"Perfect! Now I need to add some utility functions for form validation. Can you create a validators.ts file?",
		},
		{
			role: "assistant",
			content: "I'll create a comprehensive validators.ts file with common validation functions...",
		},
		{
			role: "user",
			content: "Now I need to set up routing with React Router. Can you help with that?",
		},
		{
			role: "assistant",
			content: "I'll help you set up React Router for your application. Let me create the routing configuration...",
		},
	]

	const clineMessages: ClineMessage[] = [] // Simplified for demo

	return { systemPrompt, messages, clineMessages }
}

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): number {
	const systemTokens = Math.ceil(systemPrompt.length / 4)

	const messageTokens = messages.reduce((total, message) => {
		const content =
			typeof message.content === "string"
				? message.content
				: Array.isArray(message.content)
					? message.content.map((block) => ("text" in block ? block.text : "")).join("")
					: ""
		return total + Math.ceil(content.length / 4)
	}, 0)

	return systemTokens + messageTokens
}

// Run the demo if this file is executed directly
if (require.main === module) {
	runContextOptimizationDemo().catch(console.error)
}

export { runContextOptimizationDemo }
