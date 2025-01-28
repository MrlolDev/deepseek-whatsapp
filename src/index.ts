import type { ChatCompletionMessageParam } from "groq-sdk/src/resources/chat/index.js";
import { chat, transcribeAudio, vision } from "./ai.js";
import whatsapp from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import puppeteer from "puppeteer";
import "dotenv/config";

const client = new whatsapp.Client({
  authStrategy: new whatsapp.LocalAuth(),
  puppeteer: {
    executablePath: puppeteer.executablePath(),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
    ],
  },
});

client.once("ready", () => {
  console.log("Client is ready!");
});

client.on("qr", (qr) => {
  console.log("QR Code");
  qrcode.generate(qr, { small: true });
});

client.on("message", async (message) => {
  // Ignore group messages
  const mentions = await message.getMentions();
  const isGroup = message.from.includes("@g.us");
  const mentionsMe = mentions.some((mention) => mention.isMe);
  if (isGroup && !mentionsMe) {
    return;
  }

  try {
    let userInput = "";
    let imageContent = null;

    // Handle different message types
    let media = null;
    if (message.hasMedia) {
      media = await message.downloadMedia();

      // Handle voice messages
      if (message.type == "ptt") {
        userInput = await transcribeAudio(Buffer.from(media.data, "base64"));
        console.log("Voice message:", userInput);
      }
    }
    // Handle text messages
    if (message.type === "chat") {
      userInput = message.body;
    }

    // If no valid content, ignore the message
    if (!userInput && !imageContent) {
      return;
    }

    // Get chat history
    const wChat = await message.getChat();
    if (userInput.startsWith("/clear")) {
      await wChat.sendStateTyping();
      await wChat.clearMessages();
      await wChat.sendMessage(
        "Chat history cleared. This will remove all messages from the chat."
      );
      return;
    }
    await wChat.sendStateTyping();
    const history = await wChat.fetchMessages({
      limit: isGroup ? 100 : 20,
    });

    // Format messages for the AI
    let messages: ChatCompletionMessageParam[] = [];
    for (const msg of history) {
      if (msg.hasMedia) {
        const media = await msg.downloadMedia();

        // Handle voice messages in history
        if (msg.type == "ptt") {
          const transcription = await transcribeAudio(
            Buffer.from(media.data, "base64")
          );
          let content = transcription;
          if (isGroup && !msg.fromMe) {
            content = `[${msg.author}] ${content}`;
          }
          messages.push({
            role: "user",
            content,
          });
        }
        // Handle images in history
        else if (msg.type === "image") {
          // Convert the base64 image to a data URL
          const dataUrl = `data:${media.mimetype};base64,${media.data}`;
          const imageDescription = await vision(dataUrl);
          let content = msg.body
            ? `[Image description: ${imageDescription}] ${msg.body}`
            : `[Image description: ${imageDescription}]`;
          if (isGroup && !msg.fromMe) {
            content = `[${msg.author}] ${content}`;
          }
          messages.push({
            role: msg.fromMe ? "assistant" : "user",
            content,
          });
        }
      } else {
        let content = msg.body;
        if (content.startsWith("/clear")) {
          messages = []; // remove all the previous messages
        }
        if (isGroup && !msg.fromMe) {
          content = `[${msg.author}] ${content}`;
        }
        messages.push({
          role: msg.fromMe ? "assistant" : "user",
          content,
        });
      }
    }

    // Get AI response
    console.log(messages);
    const response = await chat(messages);
    console.log(response);

    // Send the response
    await message.reply(response.answer);
  } catch (error) {
    console.error("Error processing message:", error);
    await message.reply(
      "Sorry, I encountered an error processing your message."
    );
  }
});

client.initialize();
