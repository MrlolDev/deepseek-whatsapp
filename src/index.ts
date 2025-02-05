import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { chat, transcribeAudio, vision } from "./ai.js";
import whatsapp from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import puppeteer from "puppeteer";
import "dotenv/config";
import { updateStats } from "./stats.js";
import { extractTextFromPDF } from "./utils.js";
import {
  initializeWhitelist,
  addToWhitelist,
  isAuthorized,
  ADMIN_NUMBER,
} from "./whitelist.js";

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

client.once("ready", async () => {
  console.log("Client is ready!");
  await initializeWhitelist();
  client.sendPresenceAvailable();
});

client.on("qr", (qr) => {
  console.log("QR Code");
  qrcode.generate(qr, { small: true });
});

client.on("message", async (message) => {
  // Get the sender's number without the @c.us
  const senderNumber = message.from.split("@")[0];

  // Check if it's an admin command to add a number
  if (senderNumber === ADMIN_NUMBER && message.body.startsWith("/add")) {
    const newNumber = message.body.split(" ")[1];
    if (!newNumber) {
      await message.reply("Please provide a phone number to add.");
      return;
    }

    const added = await addToWhitelist(newNumber);
    await message.reply(
      added
        ? `Number ${newNumber} has been added to the whitelist.`
        : `Number ${newNumber} is already in the whitelist.`
    );
    return;
  }

  // Check if the sender is authorized
  const authorized = await isAuthorized(senderNumber);
  if (!authorized) {
    // 10% chance to show donation message
    if (Math.random() < 0.1) {
      await message.reply(
        "This service is supported by donations. If you'd like to support the development and get whitelisted access, please contact Leo on his social media at https://mrlol.dev\n\nYour message will be processed normally."
      );
    }
  }

  // Ignore group messages
  const mentions = await message.getMentions();
  const isGroup = message.from.includes("@g.us");
  const mentionsMe = mentions.some((mention) => mention.isMe);

  if (isGroup && !mentionsMe) {
    return;
  }

  try {
    let userInput = "";
    // Get country code from the sender's number
    const countryCode = message.from.split("@")[0].slice(0, 2);

    // Handle different message types
    let media = null;
    if (message.hasMedia) {
      media = await message.downloadMedia();

      // Handle voice messages
      if (message.type == "ptt") {
        userInput = await transcribeAudio(Buffer.from(media.data, "base64"));
        updateStats(countryCode, "audio");
      }

      if (message.type === "image") {
        userInput = "Image";
        updateStats(countryCode, "image");
      }
      if (message.type == "audio") {
        userInput = await transcribeAudio(Buffer.from(media.data, "base64"));
        updateStats(countryCode, "audio");
      }
    }

    // Handle text messages
    if (message.type === "chat") {
      userInput = message.body;
      updateStats(countryCode, "message");
    }

    if (message.type == "sticker") {
      userInput = "Sticker";
      updateStats(countryCode, "sticker");
    }

    if (message.type == "document") {
      userInput = "Document";
      updateStats(countryCode, "document");
    }
    // If no valid content, ignore the message
    if (!userInput) {
      await message.reply(
        "Please send a valid message. I do not support this type of message."
      );
      return;
    }

    // Get chat history
    const wChat = await message.getChat();
    await wChat.sendSeen();
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
      limit: isGroup ? 25 : 5,
    });

    // Format messages for the AI
    let messages: ChatCompletionMessageParam[] = [];
    for (const msg of history) {
      if (msg.body.startsWith("/clear")) {
        messages = []; // remove all the previous messages
        continue;
      }
      if (msg.hasMedia) {
        const media = await msg.downloadMedia();

        // Handle voice messages in history
        if (msg.type == "ptt" || msg.type == "audio") {
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
        } else if (msg.type == "sticker") {
          const stickerDescription = await vision(media.data);
          let content = msg.body
            ? `[Sticker description: ${stickerDescription}] ${msg.body}`
            : `[Sticker description: ${stickerDescription}]`;
          if (isGroup && !msg.fromMe) {
            content = `[${msg.author}] ${content}`;
          }
          messages.push({
            role: msg.fromMe ? "assistant" : "user",
            content,
          });
        } else if (msg.type == "document") {
          if (media.mimetype === "application/pdf") {
            const pdfData = await extractTextFromPDF(
              Buffer.from(media.data, "base64")
            );
            let content = msg.body
              ? `[Attached PDF: ${pdfData}] ${msg.body}`
              : `[Attached PDF: ${pdfData}]`;
            if (isGroup && !msg.fromMe) {
              content = `[${msg.author}] ${content}`;
            }
            messages.push({
              role: msg.fromMe ? "assistant" : "user",
              content,
            });
          }
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
    if (response.imageBuffer) {
      let msg = await message.reply(
        new whatsapp.MessageMedia(
          "image/png",
          response.imageBuffer.toString("base64")
        )
      );
      await msg.reply(response.answer);
    } else {
      await message.reply(response.answer);
    }
  } catch (error) {
    console.error("Error processing message:", error);
    try {
      const wChat = await message.getChat();
      await wChat.clearMessages();
      // Try reply first, fallback to direct message
      try {
        await message.reply(
          "Sorry, I encountered an error processing your message. Please try again."
        );
      } catch (replyError) {
        await wChat.sendMessage(
          "Sorry, I encountered an error processing your message. Please try again."
        );
      }
    } catch (error) {
      console.error("Error handling message error:", error);
    }
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
