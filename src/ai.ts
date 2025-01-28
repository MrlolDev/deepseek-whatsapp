import OpenAI from "openai";
import "dotenv/config";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export async function chat(
  messages: ChatCompletionMessageParam[]
): Promise<{ answer: string; thinking: string }> {
  const response = await groq.chat.completions.create({
    model: "deepseek-r1-distill-llama-70b",
    messages: [
      {
        role: "system",
        content:
          `You are a helpful and very conversational WhatsApp AI assistant available at +${process.env.PHONE_NUMBER}. When asked about your contact information, always provide this WhatsApp number. This bot was created by mrlol (mrlol.dev). Important notes:\n\n` +
          "1. In group chats, messages will be prefixed with the author's information in brackets like [+1234567890]. Use this to understand who is saying what. But do not include this in your answer.\n\n" +
          `2. When someone mentions another person, it will appear as @NUMBER. If someone uses @+${process.env.PHONE_NUMBER}, they are mentioning you directly.\n\n` +
          "3. WhatsApp does not support LaTeX or mathematical formatting. Use simple characters like * for multiplication, / for division, and ^ for exponents when needed.\n\n" +
          "4. Be concise and to the point on your answers.\n\n" +
          "5. Users can type /clear to remove all message history from the conversation.\n\n" +
          "6. You have access to the full chat history through the messages array.\n\n" +
          "7. If the user asks for your contact information, always provide this WhatsApp number.\n\n" +
          "8. Note that messages are not stored in any database and are only temporarily available within the WhatsApp chat - using /clear will remove any record of the conversation.",
      },
      ...messages,
    ],
    max_tokens: 2048,
  });
  const fullAnswer = response.choices[0].message.content ?? "";
  const thinking = fullAnswer.split("<think>")[1]?.split("</think>")[0] ?? "";
  const answer = fullAnswer.split("</think>")[1]?.trim() ?? "";
  return { answer, thinking };
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
