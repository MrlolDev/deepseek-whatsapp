import OpenAI from "openai";
import "dotenv/config";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { createTableImage, webSearch } from "./tools.js";
import { CacheManager } from "./cacheManager.js";
import * as crypto from 'crypto';

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const sysPrompt =
  `You are DeepSeek R1, a friendly and conversational WhatsApp AI assistant powered by DeepSeek AI model and hosted on Groq's LPU platform. Today's date is ${new Date().toLocaleDateString()}. The bot (YOU) was created by Leo (email: leo@turing.sh , website: mrlol.dev). Source: github.com/MrlolDev/deepseek-whatsapp\n\n` +
  "About DeepSeek R1(DeepSeek AI model):\n" +
  "• State-of-the-art reasoning model (79.8% AIME 2024, 97.3% MATH-500)\n" +
  "• Advanced problem-solving and coding capabilities (96.3% Codeforces)\n" +
  "• Matches OpenAI's O1 model in performance\n" +
  "• Created by DeepSeek AI lab, based on China.\n" +
  "• Supports any language.\n" +
  "• Excels in math, coding, factual QA, and instruction following\n\n" +
  "Privacy & Security:\n" +
  "• Hosted on US-based Groq infrastructure\n" +
  "• No permanent message storage\n" +
  "• The user can type /clear to remove chat history\n" +
  "• Free service, supported by donations (contact Leo at mrlol.dev)\n\n" +
  "Current Features:\n" +
  "• Text chat - Natural conversations on any topic\n" +
  "• Image viewing - Can see and describe images\n" +
  "• Audio transcription - Can process voice messages\n" +
  "• PDF reading - Can analyze and summarize PDFs\n" +
  "• Group chat support - Responds when mentioned\n\n" +
  "Premium Features for Donors:\n" +
  "• Access to more advanced AI model with enhanced reasoning capabilities\n" +
  "• Early access to beta features and updates\n" +
  "• Priority response times\n" +
  "• Extended context window for longer conversations\n" +
  "• Support development and get exclusive features (donate at mrlol.dev)\n\n" +
  "• Web search (Real tiem data) - When asked or needed for verification\n\n" +
  "Important Guidelines:\n" +
  "1. In groups, messages show as [+1234567890]\n" +
  `2. Mentions appear as @NUMBER or @+${process.env.PHONE_NUMBER}\n` +
  "3. Use simple math notation (* / ^)\n" +
  "4. Keep responses brief and to the point - avoid unnecessary details\n" +
  "5. Access full chat history through messages array\n" +
  "6. [Image description] indicates actual image sent\n" +
  "7. [Attached PDF] indicates actual PDF sent\n\n" +
  "Language & Formatting:\n" +
  "• Be friendly, casual, and engaging - use a conversational tone\n" +
  "• Match the user's level of formality and energy\n" +
  "• Always respond in user's language - no language mixing\n" +
  "• Use WhatsApp formatting: *bold*, _italic_, ~strike~, ```code```\n" +
  "• For tables, always use create_table function - never ASCII\n" +
  "• Web search only when explicitly asked or for fact verification\n" +
  "• Prioritize brevity - give direct answers without fluff\n";

export async function chat(
  messages: ChatCompletionMessageParam[],
  imageBuffer: Buffer | null = null
): Promise<{ answer: string; thinking?: string; imageBuffer?: Buffer | null }> {
  try {
    const response = await groq.chat.completions.create({
      model: "deepseek-r1-distill-llama-70b-specdec",
      messages: [
        {
          role: "system",
          content: sysPrompt,
        },
        ...messages,
      ],
      max_tokens: 2048,
      tool_choice: "auto",
      tools: [
        {
          type: "function",
          function: {
            name: "web_search",
            description:
              "Search the web for information. You can provide multiple queries to get more comprehensive results.",
            parameters: {
              type: "object",
              properties: {
                queries: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                  description:
                    "An array of search queries to perform. Use multiple queries for better coverage of complex topics.",
                },
                country: {
                  type: "string",
                  description: "The country to search in.",
                  default: "US",
                },
              },
              required: ["queries"],
            },
          },
        },
        /*
        {
          type: "function",
          function: {
            name: "create_table",
            description:
              "Create a table image from structured data. This will automatically attach the table to your text reply.",
            parameters: {
              type: "object",
              properties: {
                headers: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of column headers",
                },
                rows: {
                  type: "array",
                  items: {
                    type: "array",
                    items: {
                      type: "string",
                      description: "Cell content (will be converted to string)",
                    },
                  },
                  description: "Array of rows, each containing cell values",
                },
                title: {
                  type: "string",
                  description: "Optional table title",
                },
              },
              required: ["headers", "rows"],
            },
          },
        },*/
      ],
    });

    const res = response.choices[0].message;

    // Handle tool calls
    if (res.tool_calls) {
      let imageBuffer: Buffer | null = null;
      const toolResults = await Promise.all(
        res.tool_calls.map(async (toolCall) => {
          if (toolCall.function.name === "web_search") {
            const args = JSON.parse(toolCall.function.arguments);
            const searchResults = await Promise.all(
              args.queries.map(async (query: string, index: number) => {
                if (index > 0) {
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                }
                return webSearch(query, args.country || "US");
              })
            );
            return {
              tool_call_id: toolCall.id,
              role: "tool" as const,
              name: toolCall.function.name,
              content: JSON.stringify(searchResults.flat()),
            };
          } else if (toolCall.function.name === "create_table") {
            const args = JSON.parse(toolCall.function.arguments);
            imageBuffer = await createTableImage(args);
            return {
              tool_call_id: toolCall.id,
              role: "tool" as const,
              name: toolCall.function.name,
              content: "Table image generated successfully",
            };
          }
          throw new Error(`Unknown tool: ${toolCall.function.name}`);
        })
      );
      // Add the tool results to messages and make a follow-up call
      return chat(
        [
          ...messages,
          {
            role: res.role,
            tool_calls: res.tool_calls,
          },
          ...toolResults,
        ],
        imageBuffer
      );
    }

    const fullAnswer = res.content ?? "";

    // Validate that we have a non-empty response
    if (!fullAnswer.trim()) {
      return { 
        answer: "I apologize, but I couldn't generate a proper response. Could you please rephrase your message or try again?", 
        imageBuffer 
      };
    }

    return { answer: fullAnswer, imageBuffer };
  } catch (error) {
    const models = [
      "llama-3.3-70b-versatile",
      "llama-3.3-70b-specdec",
      "llama-3.2-90b-vision-preview",
    ];
    const randomModel = models[Math.floor(Math.random() * models.length)];
    // If we hit rate limit, retry with llama-3.2-90b-vision-preview
    const fallbackResponse = await groq.chat.completions.create({
      model: randomModel,
      messages: [
        {
          role: "system",
          content: sysPrompt,
        },
        ...messages,
      ],
      max_tokens: 1024,
    });
    const fullAnswer = fallbackResponse.choices[0].message.content ?? "";

    // Validate fallback response as well
    if (!fullAnswer.trim()) {
      return { 
        answer: "I encountered an error and couldn't generate a proper response. Please try again in a moment.", 
        imageBuffer 
      };
    }

    return { answer: fullAnswer, imageBuffer };
  }
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const cacheManager = CacheManager.getInstance();
  const bufferKey = crypto.createHash('sha256').update(audioBuffer).digest('hex');
  
  // Check cache first
  const cachedTranscription = cacheManager.get(bufferKey, 'transcription');
  if (cachedTranscription) {
    return cachedTranscription;
  }

  // If not in cache, perform transcription
  const file = new File([audioBuffer], "audio.wav", { type: "audio/wav" });
  const response = await groq.audio.transcriptions.create({
    model: "whisper-large-v3-turbo",
    file,
  });

  // Save to cache
  cacheManager.set(bufferKey, response.text, 'transcription');
  
  return response.text;
}

export async function vision(imageUrl: string): Promise<string> {
  const cacheManager = CacheManager.getInstance();
  
  // Check cache first
  const cachedResult = cacheManager.get(imageUrl, 'image');
  if (cachedResult) {
    return cachedResult;
  }

  // If not in cache, perform vision analysis
  const [descriptionResponse, ocrResponse] = await Promise.all([
    // Get image description using Llama
    groq.chat.completions.create({
      model: "llama-3.2-90b-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please describe this image in a few words. Be concise and clear.",
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
    }),
    // Get OCR text using OCR.space with multi-language support
    fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        'apikey': process.env.OCR_SPACE_API_KEY || '',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        url: imageUrl,
        detectOrientation: 'true',
        scale: 'true',
        OCREngine: '2',
        isTable: 'true',
        language: 'auto' // This enables multi-language detection
      })
    }).then(res => res.json())
  ]);

  const description = descriptionResponse.choices[0]?.message?.content || "No description available";
  const ocrText = ocrResponse?.ParsedResults?.[0]?.ParsedText?.trim() || "No text found";
  const result = `Image Description: ${description}\n${ocrText ? `Text found in image: ${ocrText}` : ''}`;
  
  // Save to cache
  cacheManager.set(imageUrl, result, 'image');
  
  return result;
}
