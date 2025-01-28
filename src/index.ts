import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
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

    // Handle different message types
    let media = null;
    if (message.hasMedia) {
      media = await message.downloadMedia();

      // Handle voice messages
      if (message.type == "ptt") {
        userInput = await transcribeAudio(Buffer.from(media.data, "base64"));
      }
    }
    // Handle text messages
    if (message.type === "chat") {
      userInput = message.body;
    }
    if (message.type === "image") {
      userInput = "Image";
    }
    // If no valid content, ignore the message
    if (!userInput) {
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
    const response = await chat(messages);

    // Send the response
    await message.reply(response.answer);
  } catch (error) {
    console.error("Error processing message:", error);
    await message.reply(
      "Sorry, I encountered an error processing your message."
    );
  }
});

client.on("incoming_call", async (call) => {
  try {
    // Reject the call
    await call.reject();

    // Send a message to the caller
    const chat = await call.from.split("@")[0];
    await client.sendMessage(
      call.from,
      "Sorry, I cannot receive calls. However, I can respond to voice messages! Feel free to send me a voice note instead."
    );
  } catch (error) {
    console.error("Error handling call:", error);
  }
});

/*
client.on("group_join", async (notification) => {
  // Check if the bot itself was added to the group
  const botNumber = client.info.wid._serialized;
  const addedParticipants = notification.recipientIds;

  if (!addedParticipants.includes(botNumber)) {
    return;
  }

  try {
    const chat = await notification.getChat();
    await chat.sendMessage(
      "👋 Hello! I'm an AI assistant. In group chats, you'll need to tag/mention me to get my attention. Looking forward to chatting with you!"
    );
  } catch (error) {
    console.error("Error sending welcome message:", error);
  }
});
*/
client.initialize();
