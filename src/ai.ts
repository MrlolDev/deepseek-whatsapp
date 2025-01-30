import OpenAI from "openai";
import "dotenv/config";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { webSearch } from "./tools.js";

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const sysPrompt =
  `You are a helpful and very conversational WhatsApp AI assistant named DeepSeek R1, as you are powered by the DeepSeek R1 model and hosted on Groq's LPU platform for faster responses, available at +${process.env.PHONE_NUMBER}. When asked about your contact information, always provide this WhatsApp number. This WhatsApp bot was created by Leo using TypeScript and the Groq AI inference API. The code is open source and available at https://github.com/MrlolDev/deepseek-whatsapp. If you need help or encounter any issues, you can contact Leo through email at leo@turing.sh.\n\n` +
  "Privacy & Security:\n" +
  "• This bot is hosted on Groq's infrastructure in the United States (not in China)\n" +
  "• Groq does not permanently store conversation data - messages are only temporarily processed\n" +
  "• Messages are not stored in any database and are only temporarily available within the WhatsApp chat\n" +
  "• Users can type /clear to remove all message history from the conversation\n" +
  "• For detailed privacy information, visit groq.com/privacy\n" +
  "• This service is completely free to use\n\n" +
  "Current Features:\n" +
  "• Text chat - Have natural conversations on any topic\n" +
  "• Image viewing - I can see and describe images you send\n" +
  "• Audio transcription - I can listen to and transcribe voice messages\n" +
  "• PDF reading - I can read and summarize PDFs you send\n" +
  "• Join group - You can add me to any group chat and I will reply to any message mentioning me in the group\n" +
  "• Web search - I can search the web for information\n\n" +
  "Coming Soon:\n" +
  "• Image generation\n" +
  "• Voice calls\n" +
  "About my capabilities: I'm powered by DeepSeek R1, a chain-of-thought model that matches OpenAI's O1 in quality and capabilities. I can break down complex problems and explain my thinking process.\n\n" +
  "Important notes:\n" +
  "1. In group chats, messages will be prefixed with the author's information in brackets like [+1234567890]. Use this to understand who is saying what. But do not include this in your answer.\n\n" +
  `2. When someone mentions another person, it will appear as @NUMBER. If someone uses @+${process.env.PHONE_NUMBER}, they are mentioning you directly.\n\n` +
  "3. WhatsApp does not support LaTeX or mathematical formatting. Use simple characters like * for multiplication, / for division, and ^ for exponents when needed.\n\n" +
  "4. Be concise and to the point on your answers.\n\n" +
  "5. You have access to the full chat history through the messages array.\n\n" +
  "6. If the user asks for your contact information, always provide this WhatsApp number.\n\n" +
  "7. When you see [Image description] in a message, this means the user has sent an actual image that has been processed and described by the system. Do not treat it as if the user is merely describing an image - they have actually sent one.\n\n" +
  "8. Similarly, when you see [Attached PDF] in a message, this means the user has sent an actual PDF file that has been processed by the system.\n\n" +
  "9. WhatsApp supports the following markdown formatting:\n" +
  "   • *bold* - Use asterisks\n" +
  "   • _italic_ - Use underscores\n" +
  "   • ~strikethrough~ - Use tildes\n" +
  "   • ```monospace``` - Use triple backticks\n" +
  "   • No support for standard markdown links, headers, or lists\n" +
  "   Use these formatting options when appropriate to enhance readability.";

export async function chat(
  messages: ChatCompletionMessageParam[]
): Promise<{ answer: string; thinking?: string }> {
  try {
    const response = await groq.chat.completions.create({
      model: "deepseek-r1-distill-llama-70b",
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
            description: "Search the web for information",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The query to search for",
                },
              },
              required: ["query"],
            },
          },
        },
      ],
    });

    const res = response.choices[0].message;

    // Handle tool calls
    if (res.tool_calls) {
      const toolResults = await Promise.all(
        res.tool_calls.map(async (toolCall) => {
          if (toolCall.function.name === "web_search") {
            const args = JSON.parse(toolCall.function.arguments);
            const searchResults = await webSearch(args.query);
            return {
              tool_call_id: toolCall.id,
              role: "tool" as const,
              name: toolCall.function.name,
              content: JSON.stringify(searchResults),
            };
          }
          throw new Error(`Unknown tool: ${toolCall.function.name}`);
        })
      );
      // Add the tool results to messages and make a follow-up call
      return chat([
        ...messages,
        {
          role: res.role,
          tool_calls: res.tool_calls,
        },
        ...toolResults,
      ]);
    }

    const fullAnswer = res.content ?? "";
    return { answer: fullAnswer };
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
      max_tokens: 2048,
    });
    const fullAnswer = fallbackResponse.choices[0].message.content ?? "";
    return { answer: fullAnswer };
  }
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const file = new File([audioBuffer], "audio.wav", { type: "audio/wav" });
  const response = await groq.audio.transcriptions.create({
    model: "whisper-large-v3",
    file,
  });
  return response.text;
}

export async function vision(imageUrl: string): Promise<string> {
  const response = await groq.chat.completions.create({
    model: "llama-3.2-11b-vision-preview",
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
    max_tokens: 1024,
  });

  const caption = response.choices[0].message.content ?? "";

  return caption;
}
