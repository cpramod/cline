import * as vscode from "vscode"
import * as path from "path"
import { CodeIndexCache } from "./CodeIndexCache"

/**
 * FileWatcher monitors workspace files for changes and automatically
 * invalidates cached code definitions when files are modified.
 */
export class FileWatcher {
	private watchers: vscode.FileSystemWatcher[] = []
	private cache: CodeIndexCache
	private isActive = false

	constructor(cache: CodeIndexCache) {
		this.cache = cache
	}

	/**
	 * Start watching for file changes in the workspace
	 */
	startWatching(): void {
		if (this.isActive) {
			return
		}

		console.log("[FileWatcher] Starting file watching for code indexing")

		// Watch for changes to source code files
		const sourceFilePatterns = [
			"**/*.{ts,tsx,js,jsx}", // TypeScript/JavaScript
			"**/*.{py,pyi}", // Python
			"**/*.{rs}", // Rust
			"**/*.{go}", // Go
			"**/*.{cpp,cxx,cc,c,h,hpp}", // C/C++
			"**/*.{cs}", // C#
			"**/*.{rb}", // Ruby
			"**/*.{java}", // Java
			"**/*.{php}", // PHP
			"**/*.{swift}", // Swift
			"**/*.{kt,kts}", // Kotlin
		]

		for (const pattern of sourceFilePatterns) {
			const watcher = vscode.workspace.createFileSystemWatcher(pattern)

			// File changed
			watcher.onDidChange((uri) => {
				this.cache.invalidateFile(uri.fsPath)
				console.log(`[FileWatcher] Invalidated cache for changed file: ${path.basename(uri.fsPath)}`)
			})

			// File deleted
			watcher.onDidDelete((uri) => {
				this.cache.invalidateFile(uri.fsPath)
				console.log(`[FileWatcher] Invalidated cache for deleted file: ${path.basename(uri.fsPath)}`)
			})

			// File created - no need to invalidate since it won't be in cache yet
			watcher.onDidCreate((uri) => {
				console.log(`[FileWatcher] New file detected: ${path.basename(uri.fsPath)}`)
			})

			this.watchers.push(watcher)
		}

		this.isActive = true
	}

	/**
	 * Stop watching for file changes and cleanup resources
	 */
	stopWatching(): void {
		if (!this.isActive) {
			return
		}

		console.log("[FileWatcher] Stopping file watching")

		for (const watcher of this.watchers) {
			watcher.dispose()
		}

		this.watchers = []
		this.isActive = false
	}

	/**
	 * Check if file watcher is currently active
	 */
	isWatching(): boolean {
		return this.isActive
	}

	/**
	 * Dispose of all resources
	 */
	dispose(): void {
		this.stopWatching()
	}
}
