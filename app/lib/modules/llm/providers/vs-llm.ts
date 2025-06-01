import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

interface VSCodeAPIResponse {
  success: boolean;
  models?: Array<{
    id: string;
    vendor: string;
    family: string;
    name: string;
    maxInputTokens?: number;
    countTokens?: boolean;
  }>;
  count?: number;
  error?: string;
}

interface VSCodeChatResponse {
  success: boolean;
  response?: string;
  model?: {
    id: string;
    vendor: string;
    family: string;
    name: string;
    promptTokens?: number; // Added to capture potential token info
    completionTokens?: number; // Added to capture potential token info
    totalTokens?: number; // Added to capture potential token info
  };
  error?: string;
}

export default class VSLLMProvider extends BaseProvider {
  name = 'VS LLM';
  getApiKeyLink = undefined;
  labelForGetApiKey = 'VS Code Extension Status';
  icon = 'i-ph:code';

  // Override normal API key requirement
  needsApiKey = false;

  config = {
    // No API key is needed - leave both empty
    apiTokenKey: '',
    baseUrlKey: '',
  };

  // Static models will be populated from VS Code extension
  staticModels: ModelInfo[] = [];

  // Health check method to verify VS Code extension is running
  async checkHealth(): Promise<{ isHealthy: boolean; message: string }> {
    try {
      const response = await fetch('http://localhost:3000/health');

      if (response.ok) {
        const data = (await response.json()) as { timestamp?: string };
        return {
          isHealthy: true,
          message: `✅ VS Code LLM Extension is running (${data.timestamp})`,
        };
      }

      return {
        isHealthy: false,
        message: '❌ VS Code LLM Extension server responded with error',
      };
    } catch {
      return {
        isHealthy: false,
        message: '❌ VS Code LLM Extension is not running on localhost:3000',
      };
    }
  }

  async getDynamicModels(
    _apiKeys?: Record<string, string>,
    _settings?: IProviderSetting,
    _serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    try {
      // First check if server is running
      const health = await this.checkHealth();

      if (!health.isHealthy) {
        console.warn('VS Code LLM Bridge server not available:', health.message);
        return [];
      }

      // Try to fetch models from the VS Code extension local server
      const response = await fetch('http://localhost:3000/api/models');

      if (!response.ok) {
        console.warn('VS Code LLM Bridge server returned error for /api/models');
        return [];
      }

      const data = (await response.json()) as VSCodeAPIResponse;

      if (data.success && data.models) {
        return data.models.map((model) => ({
          name: model.id,
          label: `${model.name} (${model.vendor})`,
          provider: 'VS LLM',
          maxTokenAllowed: model.maxInputTokens || 8000,
        }));
      }
    } catch (error) {
      console.warn('Failed to connect to VS Code LLM Bridge:', error);
    }

    return [];
  }

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model: modelNameOption } = options; // Renamed to avoid conflict with result.model

    const vsCodeProvider = createOpenAI({
      baseURL: 'http://localhost:3000', // This will be overridden by fetch
      apiKey: 'no-key-needed',
      fetch: async (url, requestOptions) => {
        try {
          const originalRequestBody = JSON.parse((requestOptions?.body as string) || '{}');
          const isStreamingRequest = originalRequestBody.stream === true;

          /*
           * Fetch the complete response from the VS Code extension server
           * (This part remains the same, as the extension provides a single response)
           */
          const vsCodeExtensionResponse = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',

              // Pass through any other relevant headers from requestOptions if necessary
            },

            // Construct the body for the VS Code extension based on originalRequestBody.messages
            body: JSON.stringify({
              messages:
                originalRequestBody.messages?.map((msg: any) => {
                  let content;

                  if (typeof msg.content === 'string') {
                    content = msg.content;
                  } else if (Array.isArray(msg.content)) {
                    const textPart = msg.content.find((part: any) => part.type === 'text');
                    content = textPart?.text || '';
                  } else {
                    content = '';
                  }

                  return { content };
                }) || [],

              // model and other options for VSCode extension if needed
            }),
          });

          if (!vsCodeExtensionResponse.ok) {
            const errorText = await vsCodeExtensionResponse.text();
            console.error(`VS Code LLM Bridge error (${vsCodeExtensionResponse.status}): ${errorText}`);
            throw new Error(`VS Code LLM Bridge error: ${vsCodeExtensionResponse.statusText}`);
          }

          const result = (await vsCodeExtensionResponse.json()) as VSCodeChatResponse;

          if (!result.success) {
            console.error('VS Code LLM error:', result.error);
            throw new Error(`VS Code LLM error: ${result.error}`);
          }

          if (isStreamingRequest) {
            const encoder = new TextEncoder();
            const readableStream = new ReadableStream({
              start(controller) {
                // Send content chunk
                const contentChunk = {
                  id: 'chatcmpl-' + Date.now(),
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: result.model?.id || modelNameOption,
                  choices: [
                    {
                      index: 0,
                      delta: { content: result.response || '' },
                      finish_reason: null,
                    },
                  ],
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(contentChunk)}\n\n`));

                // Send final chunk with finish_reason and usage
                const finalChunk = {
                  id: 'chatcmpl-' + Date.now() + '-final',
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: result.model?.id || modelNameOption,
                  choices: [
                    {
                      index: 0,
                      delta: {}, // Empty delta for final chunk
                      finish_reason: 'stop',
                    },
                  ],
                  usage: {
                    // Parse token counts properly, fallback to 0 if not available
                    prompt_tokens:
                      result.model?.promptTokens && !isNaN(Number(result.model.promptTokens))
                        ? Number(result.model.promptTokens)
                        : 0,
                    completion_tokens:
                      result.model?.completionTokens && !isNaN(Number(result.model.completionTokens))
                        ? Number(result.model.completionTokens)
                        : 0,
                    total_tokens:
                      result.model?.totalTokens && !isNaN(Number(result.model.totalTokens))
                        ? Number(result.model.totalTokens)
                        : 0,
                  },
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));

                // Send DONE signal
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
              },
            });

            return new Response(readableStream, {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
              },
            });
          } else {
            // Original non-streaming response
            const openAIResponse = {
              choices: [
                {
                  index: 0,
                  message: {
                    content: result.response || '',
                    role: 'assistant',
                  },
                  finish_reason: 'stop',
                },
              ],
              model: result.model?.id || modelNameOption,
              usage: {
                // Corrected usage calculation here
                prompt_tokens:
                  result.model?.promptTokens && !isNaN(Number(result.model.promptTokens))
                    ? Number(result.model.promptTokens)
                    : 0,
                completion_tokens:
                  result.model?.completionTokens && !isNaN(Number(result.model.completionTokens))
                    ? Number(result.model.completionTokens)
                    : 0,
                total_tokens:
                  result.model?.totalTokens && !isNaN(Number(result.model.totalTokens))
                    ? Number(result.model.totalTokens)
                    : 0,
              },
            };

            return new Response(JSON.stringify(openAIResponse), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        } catch (error) {
          console.error('Error in VS LLM fetch override:', error);

          // Ensure a Response object is thrown or returned for the SDK
          if (error instanceof Response) {
            throw error;
          }

          throw new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
        }
      },
    });

    return vsCodeProvider(modelNameOption);
  }
}
