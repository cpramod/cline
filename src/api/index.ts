import { Anthropic } from "@anthropic-ai/sdk"
import { ApiConfiguration, ModelInfo } from "../shared/api"
import { AnthropicHandler } from "./providers/anthropic"
import { AwsBedrockHandler } from "./providers/bedrock"
import { OpenRouterHandler } from "./providers/openrouter"
import { VertexHandler } from "./providers/vertex"
import { OpenAiHandler } from "./providers/openai"
import { OllamaHandler } from "./providers/ollama"
import { LmStudioHandler } from "./providers/lmstudio"
import { GeminiHandler } from "./providers/gemini"
import { OpenAiNativeHandler } from "./providers/openai-native"
import { ApiStream, ApiStreamUsageChunk } from "./transform/stream"
import { DeepSeekHandler } from "./providers/deepseek"
import { RequestyHandler } from "./providers/requesty"
import { TogetherHandler } from "./providers/together"
import { NebiusHandler } from "./providers/nebius"
import { QwenHandler } from "./providers/qwen"
import { MistralHandler } from "./providers/mistral"
import { DoubaoHandler } from "./providers/doubao"
import { VsCodeLmHandler } from "./providers/vscode-lm"
import { ClineHandler } from "./providers/cline"
import { LiteLlmHandler } from "./providers/litellm"
import { FireworksHandler } from "./providers/fireworks"
import { AskSageHandler } from "./providers/asksage"
import { XAIHandler } from "./providers/xai"
import { SambanovaHandler } from "./providers/sambanova"
import { CerebrasHandler } from "./providers/cerebras"
import { SapAiCoreHandler } from "./providers/sapaicore"
import { ClaudeCodeHandler } from "./providers/claude-code"
import { getContextOptimizer, isContextOptimizationEnabled } from "../core/tools/contextOptimizationTool"

export interface ApiHandler {
	createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream
	getModel(): { id: string; info: ModelInfo }
	getApiStreamUsage?(): Promise<ApiStreamUsageChunk | undefined>
}

export interface SingleCompletionHandler {
	completePrompt(prompt: string): Promise<string>
}

// Context-optimized wrapper that intercepts and optimizes all API calls
class OptimizedApiHandler implements ApiHandler {
	private baseHandler: ApiHandler

	constructor(baseHandler: ApiHandler) {
		this.baseHandler = baseHandler
	}

	async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		// Only optimize if context optimization is enabled
		if (isContextOptimizationEnabled()) {
			const contextOptimizer = getContextOptimizer()
			if (contextOptimizer) {
				try {
					// For now, pass empty array for clineMessages since we don't have access to them here
					// This still provides significant optimization benefits
					const optimizedContext = await contextOptimizer.optimizeContext(systemPrompt, messages, [])

					// Pass optimized context to the base handler
					yield* this.baseHandler.createMessage(
						optimizedContext.optimizedSystemPrompt,
						optimizedContext.optimizedMessages,
					)

					// Log optimization results for debugging
					console.log(
						`[ContextOptimizer] Optimized context: ${optimizedContext.originalTokens} -> ${optimizedContext.optimizedTokens} tokens (${Math.round((1 - optimizedContext.compressionRatio) * 100)}% reduction)`,
					)

					return
				} catch (error) {
					console.warn("Context optimization failed, falling back to original context:", error)
					// Fallback to original context if optimization fails
				}
			}
		}

		// Pass through original context when optimization is disabled or failed
		yield* this.baseHandler.createMessage(systemPrompt, messages)
	}

	getModel(): { id: string; info: ModelInfo } {
		return this.baseHandler.getModel()
	}

	getApiStreamUsage?(): Promise<ApiStreamUsageChunk | undefined> {
		return this.baseHandler.getApiStreamUsage?.() ?? Promise.resolve(undefined)
	}
}

function createHandlerForProvider(apiProvider: string | undefined, options: any): ApiHandler {
	let baseHandler: ApiHandler

	switch (apiProvider) {
		case "anthropic":
			baseHandler = new AnthropicHandler(options)
			break
		case "openrouter":
			baseHandler = new OpenRouterHandler(options)
			break
		case "bedrock":
			baseHandler = new AwsBedrockHandler(options)
			break
		case "vertex":
			baseHandler = new VertexHandler(options)
			break
		case "openai":
			baseHandler = new OpenAiHandler(options)
			break
		case "ollama":
			baseHandler = new OllamaHandler(options)
			break
		case "lmstudio":
			baseHandler = new LmStudioHandler(options)
			break
		case "gemini":
			baseHandler = new GeminiHandler(options)
			break
		case "openai-native":
			baseHandler = new OpenAiNativeHandler(options)
			break
		case "deepseek":
			baseHandler = new DeepSeekHandler(options)
			break
		case "requesty":
			baseHandler = new RequestyHandler(options)
			break
		case "fireworks":
			baseHandler = new FireworksHandler(options)
			break
		case "together":
			baseHandler = new TogetherHandler(options)
			break
		case "qwen":
			baseHandler = new QwenHandler(options)
			break
		case "doubao":
			baseHandler = new DoubaoHandler(options)
			break
		case "mistral":
			baseHandler = new MistralHandler(options)
			break
		case "vscode-lm":
			baseHandler = new VsCodeLmHandler(options)
			break
		case "cline":
			baseHandler = new ClineHandler(options)
			break
		case "litellm":
			baseHandler = new LiteLlmHandler(options)
			break
		case "nebius":
			baseHandler = new NebiusHandler(options)
			break
		case "asksage":
			baseHandler = new AskSageHandler(options)
			break
		case "xai":
			baseHandler = new XAIHandler(options)
			break
		case "sambanova":
			baseHandler = new SambanovaHandler(options)
			break
		case "cerebras":
			baseHandler = new CerebrasHandler(options)
			break
		case "sapaicore":
			baseHandler = new SapAiCoreHandler(options)
			break
		case "claude-code":
			baseHandler = new ClaudeCodeHandler(options)
			break
		default:
			baseHandler = new AnthropicHandler(options)
			break
	}

	// Wrap the base handler with context optimization
	return new OptimizedApiHandler(baseHandler)
}

export function buildApiHandler(configuration: ApiConfiguration): ApiHandler {
	const { apiProvider, ...options } = configuration

	// Validate thinking budget tokens against model's maxTokens to prevent API errors
	// wrapped in a try-catch for safety, but this should never throw
	try {
		if (options.thinkingBudgetTokens && options.thinkingBudgetTokens > 0) {
			const handler = createHandlerForProvider(apiProvider, options)

			const modelInfo = handler.getModel().info
			if (modelInfo.maxTokens && options.thinkingBudgetTokens > modelInfo.maxTokens) {
				const clippedValue = modelInfo.maxTokens - 1
				options.thinkingBudgetTokens = clippedValue
			} else {
				return handler // don't rebuild unless its necessary
			}
		}
	} catch (error) {
		console.error("buildApiHandler error:", error)
	}

	return createHandlerForProvider(apiProvider, options)
}
