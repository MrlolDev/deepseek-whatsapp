import whatsapp from "whatsapp-web.js";

export class MessageManager {
    private static instance: MessageManager;
    private activeChats: Map<string, boolean>;
    private replyCache: Map<string, number>;
    private readonly TYPING_DURATION = 3000; // 3 seconds
    private readonly CACHE_EXPIRY = 30000; // 30 seconds

    private constructor() {
        this.activeChats = new Map();
        this.replyCache = new Map();
    }

    public static getInstance(): MessageManager {
        if (!MessageManager.instance) {
            MessageManager.instance = new MessageManager();
        }
        return MessageManager.instance;
    }

    public async handleMessageWithTyping(
        chat: whatsapp.Chat,
        responseCallback: () => Promise<void>
    ): Promise<void> {
        const chatId = chat.id._serialized;

        // Check if we're already processing this chat
        if (this.activeChats.get(chatId)) {
            return;
        }

        // Check if we recently replied to this chat
        const lastReplyTime = this.replyCache.get(chatId);
        if (lastReplyTime && Date.now() - lastReplyTime < this.CACHE_EXPIRY) {
            return;
        }

        try {
            this.activeChats.set(chatId, true);
            
            // Show typing indicator
            await chat.sendStateTyping();

            // Add a small delay to simulate typing
            await new Promise(resolve => setTimeout(resolve, this.TYPING_DURATION));

            // Execute the response callback
            await responseCallback();

            // Update the reply cache
            this.replyCache.set(chatId, Date.now());

            // Stop typing indicator
            await chat.clearState();
        } finally {
            this.activeChats.set(chatId, false);
        }
    }

    public clearCache(chatId: string): void {
        this.replyCache.delete(chatId);
    }

    // Clean up old cache entries periodically
    private cleanupCache(): void {
        const now = Date.now();
        for (const [chatId, timestamp] of this.replyCache.entries()) {
            if (now - timestamp > this.CACHE_EXPIRY) {
                this.replyCache.delete(chatId);
            }
        }
    }
}
