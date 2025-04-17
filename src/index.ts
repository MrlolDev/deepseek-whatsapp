import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from "openai/resources/index.mjs";
import { chat, transcribeAudio, vision } from "./ai/llm.js";
import whatsapp from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import puppeteer from "puppeteer";
import "dotenv/config";
import { updateStats } from "./managers/stats.js";
import { extractTextFromPDF } from "./utils.js";
import {
  initializeWhitelist,
  addToWhitelist,
  isAuthorized,
  ADMIN_NUMBER,
} from "./managers/whitelist.js";
import { PrivacyManager } from "./managers/privacyManager.js";
import { MessageManager } from "./managers/messageManager.js";
import { ReminderManager } from "./managers/reminderManager.js";

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
      "--user-data-dir=/tmp/whatsapp-webjs",
    ],
  },
});

client.once("ready", async () => {
  console.log("Client is ready!");
  await initializeWhitelist();
  const reminderManager = ReminderManager.getInstance();
  reminderManager.setClient(client);
  client.sendPresenceAvailable();
});

client.on("qr", (qr) => {
  console.log("QR Code");
  qrcode.generate(qr, { small: true });
});

client.on("message", async (message) => {
  // Get the sender's number without the @c.us
  const senderNumber = message.from.split("@")[0];

  // Get the chat
  const wChat = await message.getChat();

  // Use MessageManager to handle the message with typing indicator
  const messageManager = MessageManager.getInstance();
  await messageManager.handleMessageWithTyping(wChat, async () => {
    // Check if the user has accepted the privacy policy
    const privacyManager = PrivacyManager.getInstance();
    if (!privacyManager.hasAcceptedPolicy(senderNumber)) {
      await message.reply(privacyManager.getPrivacyPolicyMessage());
      privacyManager.markPolicyAccepted(senderNumber);
      return;
    }

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

    let sendSponsorMessage = false;
    // Check if the sender is authorized
    const authorized = await isAuthorized(senderNumber);
    if (!authorized) {
      // 10% chance to show donation message
      if (Math.random() < 0.1) {
        sendSponsorMessage = true;
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

      // Handle unsupported media types explicitly
      if (
        message.type === "call_log" ||
        message.type === "video" ||
        message.type == "location"
      ) {
        await message.reply(
          "Please send a valid message. I do not support calls, videos, or location messages."
        );
        return;
      }
      if (message.type == "groups_v4_invite") {
        await message.reply(
          "Please send a valid message. I do not support groups invites."
        );
        return;
      }

      // If no content was extracted, check if it's empty or unknown type
      if (!userInput) {
        return;
      }

      // Get chat history
      await wChat.sendSeen();
      if (userInput.startsWith("/clear")) {
        await wChat.clearMessages();
        await wChat.sendMessage(
          "Chat history cleared. This will remove all messages from the chat."
        );
        return;
      }
      const history = await wChat.fetchMessages({
        limit: 10,
      });

      // Format messages for the AI
      let messages: ChatCompletionMessageParam[] = [];

      // Limit total message history size to prevent token overflow

      for (const msg of history) {
        // Process messages from oldest to newest
        if (msg.body.startsWith("/clear")) {
          messages = []; // Keep system message, clear the rest
          continue;
        }

        let messageContent: ChatCompletionContentPart[] = [];

        try {
          if (msg.hasMedia) {
            const media = await msg.downloadMedia();

            // Handle different media types
            if (msg.type === "ptt" || msg.type === "audio") {
              messageContent = [
                {
                  type: "text",
                  text: await transcribeAudio(
                    Buffer.from(media.data, "base64")
                  ),
                },
              ];
            } else if (msg.type === "sticker") {
              const stickerDescription = await vision(media.data);
              messageContent.push({
                type: "image_url",
                image_url: {
                  url: `data:${media.mimetype};base64,${media.data}`,
                },
              } as ChatCompletionContentPart);
            } else if (
              msg.type === "document" &&
              media.mimetype === "application/pdf"
            ) {
              const pdfData = await extractTextFromPDF(
                Buffer.from(media.data, "base64")
              );
              messageContent.push({
                type: "text",
                text: msg.body
                  ? `[PDF: ${pdfData}] ${msg.body}`
                  : `[PDF: ${pdfData}]`,
              });
            } else if (msg.type === "image") {
              const dataUrl = `data:${media.mimetype};base64,${media.data}`;
              messageContent.push({
                type: "image_url",
                image_url: {
                  url: dataUrl,
                },
              } as ChatCompletionContentPart);
            }
          } else {
            messageContent = [
              {
                type: "text",
                text: msg.body,
              },
            ];
          }

          // Add group context if needed
          if (isGroup && !msg.fromMe) {
            messageContent.unshift({
              type: "text",
              text: `[${msg.author}]`,
            });
          }

          // Add the message to history
          if (msg.fromMe) {
            messages.push({
              role: "assistant",
              content: msg.body,
            } as ChatCompletionMessageParam);
          } else {
            messages.push({
              role: "user",
              content: messageContent,
            } as ChatCompletionMessageParam);
          }
        } catch (error) {
          console.warn("Error processing message in history:", error);
          // Continue with next message if one fails
          continue;
        }
      }

      // Get AI response
      const response = await chat(messages, senderNumber);

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

      if (sendSponsorMessage) {
        await client.sendMessage(
          message.from,
          "This service thrives on the generosity of our supporters! By contributing, you unlock premium features such as enhanced AI models, exclusive beta features, and priority support. To become a supporter, reach out to Leo on his social media at https://mrlol.dev. Remember, you can continue to enjoy this service for free, as it is an educational project created by a student."
        );
      }
    } catch (error) {
      console.error("Error processing message:", error);
      try {
        const wChat = await message.getChat();
        await wChat.clearMessages();
        const lastMessage = wChat.lastMessage;
        if (lastMessage) {
          return;
        }
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
});

client.on("incoming_call", async (call) => {
  try {
    // Reject the call
    await call.reject();

    // Send a message to the caller
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
