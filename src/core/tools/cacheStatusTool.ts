import { CodeIndexingService } from "@/services/tree-sitter/cache/CodeIndexingService"
import * as vscode from "vscode"

const descriptionForAgent = `Get code indexing cache status and performance statistics. This tool shows cache hit rates, number of cached definitions, and other performance metrics to help understand the effectiveness of the code indexing system.`

export const cacheStatusToolDefinition = () => ({
	name: "CacheStatus",
	descriptionForAgent,
	inputSchema: {
		type: "object",
		properties: {},
		required: [],
	},
})

export async function getCacheStatus(context: vscode.ExtensionContext): Promise<string> {
	try {
		const indexingService = CodeIndexingService.getInstance(context)
		const stats = indexingService.getStats()

		return `# Code Indexing Cache Status

## Performance Metrics
- **Cache Hit Rate**: ${stats.hitRate}
- **Total Cache Hits**: ${stats.hitCount}
- **Total Cache Misses**: ${stats.missCount}
- **Total Requests**: ${stats.hitCount + stats.missCount}

## Cache Contents  
- **Cached Definitions**: ${stats.totalDefinitions} files
- **Last Indexed**: ${stats.lastIndexedAt}

## Cache Effectiveness
${
	stats.hitCount > 0
		? `✅ Cache is working well! ${stats.hitRate} of requests are served from cache, significantly improving response times.`
		: "🔄 Cache is warming up. Performance will improve as more code is parsed and cached."
}

${
	stats.totalDefinitions > 50
		? "📈 Large project detected. The cache will provide substantial performance benefits."
		: "📊 Moderate project size. Cache provides good performance improvements."
}`
	} catch (error) {
		return `❌ Failed to get cache status: ${error}`
	}
}
