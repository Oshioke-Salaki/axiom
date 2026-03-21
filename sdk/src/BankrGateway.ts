import OpenAI from "openai";
import type { LLMMessage, LLMResponse, SupportedModel } from "./types.js";

/**
 * BankrGateway — Multi-model LLM inference for AXIOM agents.
 *
 * Bankr provides a unified OpenAI-compatible gateway to 20+ models.
 * Agents pay for inference from their own wallets — fully autonomous,
 * no human credit card required.
 *
 * Endpoint: https://llm.bankr.bot/v1
 * Auth: X-API-Key header
 */
export class BankrGateway {
  private client: OpenAI;
  private defaultModel: SupportedModel;
  private totalTokensUsed: number = 0;

  constructor(config: { apiKey: string; defaultModel?: SupportedModel }) {
    this.defaultModel = config.defaultModel ?? "claude-sonnet-4-6";

    if (!config.apiKey || config.apiKey === "your_bankr_key_here") {
      console.warn("[Bankr] No API key configured — LLM calls will fail");
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: "https://llm.bankr.bot/v1",
      defaultHeaders: {
        "X-API-Key": config.apiKey,
      },
    });
  }

  /**
   * Run inference on any supported model.
   */
  async complete(
    messages: LLMMessage[],
    model?: SupportedModel,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<LLMResponse> {
    const selectedModel = model ?? this.defaultModel;

    try {
      const response = await this.client.chat.completions.create({
        model: selectedModel,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2048,
      });

      const tokensUsed = response.usage?.total_tokens ?? 0;
      this.totalTokensUsed += tokensUsed;

      return {
        content: response.choices[0]?.message?.content ?? "",
        model: selectedModel,
        tokensUsed,
      };
    } catch (err: any) {
      throw new Error(`[Bankr] LLM call failed (${selectedModel}): ${err.message}`);
    }
  }

  /**
   * Run a simple prompt → response.
   */
  async prompt(
    systemPrompt: string,
    userMessage: string,
    model?: SupportedModel
  ): Promise<string> {
    const response = await this.complete(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      model
    );
    return response.content;
  }

  /**
   * Run analysis with structured JSON output.
   */
  async analyzeToJSON<T>(
    systemPrompt: string,
    userMessage: string,
    model?: SupportedModel
  ): Promise<T> {
    const jsonSystemPrompt = `${systemPrompt}\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanation, just the JSON object.`;
    const raw = await this.prompt(jsonSystemPrompt, userMessage, model);

    try {
      // Strip markdown code blocks if present
      const cleaned = raw
        .replace(/^```json\n?/, "")
        .replace(/^```\n?/, "")
        .replace(/\n?```$/, "")
        .trim();
      return JSON.parse(cleaned) as T;
    } catch {
      throw new Error(`[Bankr] Failed to parse JSON response: ${raw.slice(0, 200)}`);
    }
  }

  get stats() {
    return {
      totalTokensUsed: this.totalTokensUsed,
      defaultModel: this.defaultModel,
    };
  }
}
