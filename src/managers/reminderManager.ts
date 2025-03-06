import fs from "fs";
import path from "path";
import { Client } from "whatsapp-web.js";

interface Reminder {
  id: string;
  phoneNumber: string;
  message: string;
  dueTime: number;
  notified: boolean;
}

interface ReminderData {
  reminders: Reminder[];
}

export class ReminderManager {
  private static instance: ReminderManager;
  private reminderFile: string;
  private data: ReminderData = { reminders: [] };
  private client: Client | null = null;
  private checkInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.reminderFile = path.join(process.cwd(), "reminders.json");
    this.initializeData();
  }

  public static getInstance(): ReminderManager {
    if (!ReminderManager.instance) {
      ReminderManager.instance = new ReminderManager();
    }
    return ReminderManager.instance;
  }

  public setClient(client: Client) {
    this.client = client;
    this.startCheckingReminders();
  }

  private initializeData(): void {
    try {
      if (fs.existsSync(this.reminderFile)) {
        const fileContent = fs.readFileSync(this.reminderFile, "utf-8");
        this.data = JSON.parse(fileContent);
      } else {
        this.saveData();
      }
    } catch (error) {
      console.error("Error initializing reminder data:", error);
      this.data = { reminders: [] };
    }
  }

  private saveData(): void {
    try {
      fs.writeFileSync(this.reminderFile, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error("Error saving reminder data:", error);
    }
  }

  private parseDuration(duration: string): number {
    const regex = /^(\d+)([dhm])$/;
    const match = duration.toLowerCase().match(regex);

    if (!match) {
      throw new Error("Invalid duration format. Use format like 1d, 2h, 30m");
    }

    const [, value, unit] = match;
    const amount = parseInt(value);

    switch (unit) {
      case "d":
        return amount * 24 * 60 * 60 * 1000; // days to ms
      case "h":
        return amount * 60 * 60 * 1000; // hours to ms
      case "m":
        return amount * 60 * 1000; // minutes to ms
      default:
        throw new Error("Invalid time unit");
    }
  }

  private formatTimeLeft(ms: number): string {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    ms -= days * 24 * 60 * 60 * 1000;

    const hours = Math.floor(ms / (60 * 60 * 1000));
    ms -= hours * 60 * 60 * 1000;

    const minutes = Math.floor(ms / (60 * 1000));

    const parts = [];
    if (days > 0) parts.push(`${days} day${days > 1 ? "s" : ""}`);
    if (hours > 0) parts.push(`${hours} hour${hours > 1 ? "s" : ""}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes > 1 ? "s" : ""}`);

    return parts.join(", ");
  }

  public async addReminder(
    phoneNumber: string,
    message: string,
    duration: string
  ): Promise<string> {
    try {
      const durationMs = this.parseDuration(duration);
      const dueTime = Date.now() + durationMs;
      const id = Math.random().toString(36).substring(7);

      this.data.reminders.push({
        id,
        phoneNumber,
        message,
        dueTime,
        notified: false,
      });
      this.saveData();

      // Send confirmation message
      if (this.client) {
        const timeLeft = this.formatTimeLeft(durationMs);
        await this.client.sendMessage(
          `${phoneNumber}@c.us`,
          `⏰ Reminder set! I'll remind you about: "${message}" in ${timeLeft}\n\n` +
            "Note: Your phone number will be temporarily stored until the reminder is completed. Use /clear_reminders to remove all your reminders."
        );
      }
      return id;
    } catch (error: any) {
      throw new Error(`Failed to set reminder: ${error.message}`);
    }
  }

  public clearUserReminders(phoneNumber: string): void {
    this.data.reminders = this.data.reminders.filter(
      (r) => r.phoneNumber !== phoneNumber
    );
    this.saveData();
  }

  private startCheckingReminders(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      this.checkReminders();
    }, 60000) as unknown as NodeJS.Timeout; // Type assertion to fix compatibility
  }

  private async checkReminders(): Promise<void> {
    if (!this.client) return;

    const now = Date.now();
    const remindersToNotify = this.data.reminders.filter(
      (r) => !r.notified && r.dueTime <= now
    );

    for (const reminder of remindersToNotify) {
      try {
        await this.client.sendMessage(
          `${reminder.phoneNumber}@c.us`,
          `⏰ *Reminder*\n${reminder.message}`
        );
        reminder.notified = true;
      } catch (error) {
        console.error("Error sending reminder:", error);
      }
    }

    // Clean up notified reminders
    this.data.reminders = this.data.reminders.filter((r) => !r.notified);
    this.saveData();
  }
}
