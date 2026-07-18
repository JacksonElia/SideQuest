import { request as httpsRequest } from "node:https";

import { loadLlmConfig } from "./llm/config.ts";

export interface OpenRouterMessage {
  role: "system" | "user";
  content: string;
}

export interface CompleteOpenRouterOptions {
  model: string;
  messages: OpenRouterMessage[];
  temperature: number;
  maxTokens: number;
  responseFormat?: { type: "json_object" };
  label: string;
}

export type CompleteOpenRouterResult =
  { ok: true; text: string } | { ok: false; error: string; status: number | null };

interface OpenRouterResponse {
  status: number;
  body: unknown;
}

export async function completeOpenRouter(
  options: CompleteOpenRouterOptions,
): Promise<CompleteOpenRouterResult> {
  try {
    const config = loadLlmConfig();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": config.appTitle,
    };
    if (config.httpReferer) {
      headers["HTTP-Referer"] = config.httpReferer;
    }

    const response = await postOpenRouter(
      headers,
      JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
      }),
      config.timeoutMs,
    );

    if (response.status < 200 || response.status >= 300) {
      console.error(
        `[openrouter:${options.label}] request failed with status ${response.status}: ${getErrorMessage(response.body)}`,
      );
      return { ok: false, error: "The guide is unavailable right now.", status: response.status };
    }

    const text = getCompletionText(response.body);
    if (!text) {
      console.error(`[openrouter:${options.label}] response did not include completion text.`);
      return { ok: false, error: "The guide returned an invalid response.", status: 502 };
    }

    console.log(`[openrouter:${options.label}] completed with model=${options.model}.`);
    return { ok: true, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[openrouter:${options.label}] request failed: ${message}`);
    return { ok: false, error: "The guide is unavailable right now.", status: null };
  }
}

function getErrorMessage(responseBody: unknown): string {
  if (typeof responseBody !== "object" || responseBody === null) return "Unknown error";

  const { error } = responseBody as { error?: unknown };
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const { message } = error as { message?: unknown };
    if (typeof message === "string") return message;
  }
  return "Unknown error";
}

function getCompletionText(responseBody: unknown): string | null {
  if (typeof responseBody !== "object" || responseBody === null) return null;

  const { choices } = responseBody as { choices?: unknown };
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const firstChoice = choices[0];
  if (typeof firstChoice !== "object" || firstChoice === null) return null;
  const { message } = firstChoice as { message?: unknown };
  if (typeof message !== "object" || message === null) return null;

  const { content } = message as { content?: unknown };
  return typeof content === "string" ? content.trim() || null : null;
}

function postOpenRouter(
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<OpenRouterResponse> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        let responseText = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          responseText += chunk;
        });
        response.on("end", () => {
          try {
            resolve({
              status: response.statusCode ?? 502,
              body: JSON.parse(responseText),
            });
          } catch {
            reject(new Error("OpenRouter returned a non-JSON response."));
          }
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("OpenRouter request timed out."));
    });
    request.on("error", reject);
    request.end(body);
  });
}
