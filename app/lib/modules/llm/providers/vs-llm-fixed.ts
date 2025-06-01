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
    const { model } = options;

    // Create a custom provider that talks to the VS Code extension
    const vsCodeProvider = createOpenAI({
      baseURL: 'http://localhost:3000',
      apiKey: 'no-key-needed', // Dummy key since the extension doesn't need auth
      fetch: async (url, requestOptions) => {
        try {
          // Parse the original request body from OpenAI format
          const originalBody = JSON.parse((requestOptions?.body as string) || '{}');

          // Extract message content - VS Code extension expects simple { content: "..." } objects
          const messages =
            originalBody.messages?.map((msg: any) => {
              let content;

              if (typeof msg.content === 'string') {
                content = msg.content;
              } else if (Array.isArray(msg.content)) {
                // Extract text content from array format
                const textPart = msg.content.find((part: any) => part.type === 'text');
                content = textPart?.text || '';
              } else {
                content = '';
              }

              return { content };
            }) || [];

          // Format request body for VS Code extension
          const vsCodeBody = {
            messages,
            model: {
              id: model,
              vendor: 'copilot',
              family: model.split('-')[0], // Extract family name (e.g., "gpt" from "gpt-4o")
            },
            options: {},
          };

          // Make the actual request to the VS Code extension server
          const response = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(vsCodeBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`VS Code LLM Bridge error (${response.status}): ${errorText}`);
            throw new Error(`VS Code LLM Bridge error: ${response.statusText}`);
          }

          const result = (await response.json()) as VSCodeChatResponse;

          if (!result.success) {
            console.error('VS Code LLM error:', result.error);
            throw new Error(`VS Code LLM error: ${result.error}`);
          }

          // Transform response back to OpenAI format
          const openAIResponse = {
            choices: [
              {
                message: {
                  content: result.response || '',
                  role: 'assistant',
                },
                finish_reason: 'stop',
              },
            ],
            model: result.model?.id || model,
            usage: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
            },
          };

          return new Response(JSON.stringify(openAIResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('Error in VS LLM fetch override:', error);
          throw error;
        }
      },
    });

    return vsCodeProvider(model);
  }
}
