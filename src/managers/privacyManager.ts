import crypto from "crypto";
import fs from "fs";
import path from "path";

interface PrivacyData {
  [key: string]: {
    policyAccepted: boolean;
    timestamp: string;
  };
}

export class PrivacyManager {
  private static instance: PrivacyManager;
  private privacyFile: string;
  private data: PrivacyData = {};

  private constructor() {
    this.privacyFile = path.join(process.cwd(), "privacy-data.json");
    this.initializeData();
  }

  public static getInstance(): PrivacyManager {
    if (!PrivacyManager.instance) {
      PrivacyManager.instance = new PrivacyManager();
    }
    return PrivacyManager.instance;
  }

  private initializeData(): void {
    try {
      if (fs.existsSync(this.privacyFile)) {
        const fileContent = fs.readFileSync(this.privacyFile, "utf-8");
        this.data = JSON.parse(fileContent);
      } else {
        this.saveData();
      }
    } catch (error) {
      console.error("Error initializing privacy data:", error);
      this.data = {};
    }
  }

  private saveData(): void {
    try {
      fs.writeFileSync(this.privacyFile, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error("Error saving privacy data:", error);
    }
  }

  private hashPhoneNumber(phoneNumber: string): string {
    return crypto.createHash("sha256").update(phoneNumber).digest("hex");
  }

  public hasAcceptedPolicy(phoneNumber: string): boolean {
    const hashedNumber = this.hashPhoneNumber(phoneNumber);
    return this.data[hashedNumber]?.policyAccepted || false;
  }

  public markPolicyAccepted(phoneNumber: string): void {
    const hashedNumber = this.hashPhoneNumber(phoneNumber);
    this.data[hashedNumber] = {
      policyAccepted: true,
      timestamp: new Date().toISOString(),
    };
    this.saveData();
  }

  public getPrivacyPolicyMessage(): string {
    return `🔐 *Privacy Policy Notice*

Welcome! Before we continue, I want to inform you about our privacy practices:

1. Your phone number is never stored in its original form
2. We use secure one-way encryption to only remember if we've shown you this message
3. Your messages are processed for AI responses but not permanently stored
4. We don't share any of your information with third parties

By continuing to use this bot, you:
• Accept these privacy terms
• Agree to any future updates to our privacy policy without requiring notification
• Acknowledge your responsibility to periodically review our privacy policy

If you want to delete all the records of this conversation please use /clear.

For more details, visit our full privacy policy at: https://mrloldev.github.io/deepseek-whatsapp/privacy-policy.html

Thank you for your trust! You can now start using the bot by asking again your question.`;
  }
}
