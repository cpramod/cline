import { CodeIndexingService } from "@/services/tree-sitter/cache/CodeIndexingService"
import * as vscode from "vscode"

const descriptionForAgent = `Clear the code indexing cache. This will remove all cached code definitions and force re-parsing of files on the next request. Use this for debugging or when you suspect the cache might be stale.`

export const clearCacheToolDefinition = () => ({
	name: "ClearCache",
	descriptionForAgent,
	inputSchema: {
		type: "object",
		properties: {},
		required: [],
	},
})

export async function clearCache(context: vscode.ExtensionContext): Promise<string> {
	try {
		const indexingService = CodeIndexingService.getInstance(context)
		const statsBefore = indexingService.getStats()

		indexingService.clearCache()
		await indexingService.saveCache() // Persist the cleared state

		return `✅ Code indexing cache cleared successfully!

## Before Clearing
- **Cached Definitions**: ${statsBefore.totalDefinitions} files
- **Total Requests**: ${statsBefore.hitCount + statsBefore.missCount}
- **Hit Rate**: ${statsBefore.hitRate}

The cache has been reset and will rebuild as files are parsed. This may cause temporary slower response times until the cache warms up again.`
	} catch (error) {
		return `❌ Failed to clear cache: ${error}`
	}
}
