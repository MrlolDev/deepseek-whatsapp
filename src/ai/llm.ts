import OpenAI from "openai";
import "dotenv/config";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { createTableImage, webSearch } from "./tools.js";
import { CacheManager } from "../managers/cacheManager.js";
import * as crypto from "crypto";
import { ReminderManager } from "../managers/reminderManager.js";

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const crof = new OpenAI({
  apiKey: process.env.CROF_API_KEY,
  baseURL: "https://ai.nahcrof.com/v2",
});

const sysPrompt =
  `You are a WhatsApp AI assistant powered by DeepSeek R1, a state-of-the-art AI model created by DeepSeek AI Lab. You should be warm, friendly, and conversational in your responses - like chatting with a helpful friend. This WhatsApp integration was developed by Leo (email: leo@turing.sh, website: mrlol.dev). Today's date is ${new Date().toLocaleDateString()}.\n\n` +
  "About DeepSeek R1:\n" +
  "• Created by DeepSeek AI Lab (based in China)\n" +
  "• State-of-the-art reasoning model (79.8% AIME 2024, 97.3% MATH-500)\n" +
  "• Advanced problem-solving and coding capabilities (96.3% Codeforces)\n" +
  "• Advanced computer vision capabilities for image analysis\n" +
  "• Matches OpenAI's O1 model in performance\n" +
  "• Supports any language\n" +
  "• Excels in math, coding, factual QA, and instruction following\n\n" +
  "About This Integration:\n" +
  "• Developed by Leo (mrlol.dev)\n" +
  "• It is open source, Source: github.com/MrlolDev/deepseek-whatsapp\n" +
  "• Hosted on US-based Groq infrastructure\n" +
  "• No permanent message storage\n" +
  "• The user can type /clear to remove chat history\n" +
  "• Free service, supported by donations (contact Leo at mrlol.dev)\n\n" +
  "Current Features:\n" +
  "• Text chat - Natural conversations on any topic\n" +
  "• Image viewing - Can see and describe images\n" +
  "• Audio transcription - Can process voice messages\n" +
  "• PDF reading - Can analyze and summarize PDFs\n" +
  "• Group chat support - Responds when mentioned\n" +
  "• Web search (Real time data) - When asked or needed for verification\n" +
  "• Reminders - Can set reminders with duration (e.g., 1d, 2h, 30m)\n\n" +
  "Premium Features for Donors:\n" +
  "• Access to more advanced AI model with enhanced reasoning capabilities\n" +
  "• Early access to beta features and updates\n" +
  "• Priority response times\n" +
  "• Extended context window for longer conversations\n" +
  "• Support development and get exclusive features (donate at mrlol.dev)\n\n" +
  "Important Guidelines:\n" +
  "1. In groups, messages show as [+1234567890]\n" +
  `2. Mentions appear as @NUMBER or @+${process.env.PHONE_NUMBER}\n` +
  "3. Use simple math notation (* / ^)\n" +
  "4. Keep responses brief and to the point - avoid unnecessary details\n" +
  "5. Access full chat history through messages array\n" +
  "6. [Image: description] indicates actual image sent. So treat it as you can see the image and not as if you are just getting a description of the image.\n" +
  "7. [Attached PDF] indicates actual PDF sent\n\n" +
  "Language & Formatting:\n" +
  "• Be warm, empathetic, and engaging - use a conversational tone\n" +
  "• Be short and concise, but not too short\n" +
  "• Be very friendly and warm, you are a friend of the user and you make them chat more\n" +
  "• Add appropriate emojis to make conversations more natural\n" +
  "• Show enthusiasm when helping users\n" +
  "• Match the user's level of formality and energy\n" +
  "• Always respond in user's language - no language mixing\n" +
  "• Use WhatsApp formatting: *bold*, _italic_, ~strike~, ```code```\n" +
  // "• For tables, always use create_table function - never ASCII\n" +
  // "• For reminders, use set_reminder function with format: 1d (days), 2h (hours), 30m (minutes)\n" +
  "• Proactively use web search for:\n" +
  "  - Current events and time-sensitive information\n" +
  "  - Specific facts or data that may have changed\n" +
  "  - Technical documentation or API references\n" +
  "  - Verifying claims or cross-referencing information\n" +
  "  - Questions about emerging technologies\n" +
  "• Keep responses clear and concise while maintaining a friendly tone";

export async function chat(
  messages: ChatCompletionMessageParam[],
  phoneNumber: string,
  imageBuffer: Buffer | null = null
): Promise<{ answer: string; thinking?: string; imageBuffer?: Buffer | null }> {
  try {
    const response = await crof.chat.completions.create({
      model: "qwen-qwq-32b",
      messages: [
        {
          role: "system",
          content: sysPrompt,
        },
        ...messages,
      ],
      max_tokens: 8000,
      tool_choice: "auto",
      tools: [
        {
          type: "function",
          function: {
            name: "web_search",
            description:
              "Search the web for information. You can provide multiple queries to get more comprehensive results. Say always the sources where you got the information.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description:
                    "The search query to perform. Try to make it exact and concise.",
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
            name: "set_reminder",
            description:
              "Set a reminder for the user. Only use when explicitly requested. Duration format: 1d (1 day), 2h (2 hours), 30m (30 minutes)",
            parameters: {
              type: "object",
              properties: {
                message: {
                  type: "string",
                  description: "The reminder message",
                },
                duration: {
                  type: "string",
                  description:
                    "Duration in format: 1d, 2h, 30m (d=days, h=hours, m=minutes)",
                  pattern: "^\\d+[dhm]$",
                },
              },
              required: ["message", "duration"],
            },
          },
        },
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
            const searchResults = await webSearch(
              args.query,
              args.country || "US"
            );
            return {
              tool_call_id: toolCall.id,
              role: "tool" as const,
              name: toolCall.function.name,
              content: JSON.stringify(searchResults),
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
          } else if (toolCall.function.name === "set_reminder") {
            const args = JSON.parse(toolCall.function.arguments);
            const reminderManager = ReminderManager.getInstance();
            await reminderManager.addReminder(
              phoneNumber,
              args.message,
              args.duration
            );
            return {
              tool_call_id: toolCall.id,
              role: "tool" as const,
              name: toolCall.function.name,
              content: "Reminder set successfully",
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
        phoneNumber,
        imageBuffer
      );
    }

    let fullAnswer = res.content ?? "";

    if (fullAnswer.includes("<think>")) {
      fullAnswer = fullAnswer.split("</think>")[1].trim();
    }
    // Validate that we have a non-empty response
    if (!fullAnswer.trim()) {
      console.log(res);
      return {
        answer:
          "I apologize, but I couldn't generate a proper response. Could you please rephrase your message or try again?",
        imageBuffer,
      };
    }

    return { answer: fullAnswer, imageBuffer };
  } catch (error) {
    const models = [
      "deepseek-r1",
      "deepseek-r1-distill-llama-70b",
      "llama3.1-405b-instruct",
    ];
    const randomModel = models[Math.floor(Math.random() * models.length)];
    // If we hit rate limit, retry with llama-3.2-90b-vision-preview
    const fallbackResponse = await crof.chat.completions.create({
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
        answer:
          "I encountered an error and couldn't generate a proper response. Please try again in a moment.",
        imageBuffer,
      };
    }

    return { answer: fullAnswer, imageBuffer };
  }
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const cacheManager = CacheManager.getInstance();
  const bufferKey = crypto
    .createHash("sha256")
    .update(audioBuffer)
    .digest("hex");

  // Check cache first
  const cachedTranscription = cacheManager.get(bufferKey, "transcription");
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
  cacheManager.set(bufferKey, response.text, "transcription");

  return response.text;
}

export async function vision(imageUrl: string): Promise<string> {
  const cacheManager = CacheManager.getInstance();

  // Check cache first
  const cachedResult = cacheManager.get(imageUrl, "image");
  if (cachedResult) {
    return cachedResult;
  }

  // If not in cache, perform vision analysis
  const [descriptionResponse, ocrResponse] = await Promise.all([
    // Get detailed image description using Llama
    groq.chat.completions.create({
      model: "llama-3.2-90b-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe this image in detail, including any important visual elements, text, or notable features.",
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
    fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: {
        apikey: process.env.OCR_SPACE_API_KEY || "",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        url: imageUrl,
        detectOrientation: "true",
        scale: "true",
        OCREngine: "2",
        isTable: "true",
        language: "auto",
      }),
    }).then((res) => res.json()),
  ]);

  const description = descriptionResponse.choices[0]?.message?.content || "";
  const ocrText = ocrResponse?.ParsedResults?.[0]?.ParsedText?.trim() || "";

  // Combine results in a more natural way
  let result = description;
  if (ocrText) {
    result += (result ? "\n\n" : "") + ocrText;
  }

  // Save to cache
  cacheManager.set(imageUrl, result, "image");

  return result;
}
