import fs from "fs";
import path from "path";
import { getCountryCodeFromPhone } from "./utils.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CountryStats {
  messages: number;
  audios: number;
  images: number;
  stickers: number;
  documents: number;
}

interface DailyStats extends CountryStats {
  byCountry: {
    [countryCode: string]: CountryStats;
  };
}

interface Stats {
  totalMessages: number;
  totalAudios: number;
  totalImages: number;
  totalStickers: number;
  totalDocuments: number;
  byCountry: {
    [countryCode: string]: CountryStats;
  };
  byDate: {
    [date: string]: DailyStats;
  };
}

const STATS_FILE = path.join(__dirname, "../data/stats.json");

// Initialize empty stats object
const defaultStats: Stats = {
  totalMessages: 0,
  totalAudios: 0,
  totalImages: 0,
  totalStickers: 0,
  totalDocuments: 0,
  byCountry: {},
  byDate: {},
};

// Ensure stats file exists
function initializeStatsFile() {
  const dir = path.dirname(STATS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(STATS_FILE)) {
    fs.writeFileSync(STATS_FILE, JSON.stringify(defaultStats, null, 2));
  }
}

// Load stats from file
function loadStats(): Stats {
  try {
    initializeStatsFile();
    const data = fs.readFileSync(STATS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error loading stats:", error);
    return defaultStats;
  }
}

// Save stats to file
function saveStats(stats: Stats) {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  } catch (error) {
    console.error("Error saving stats:", error);
  }
}

// Update stats
export function updateStats(
  countryCode: string,
  messageType: "message" | "audio" | "image" | "sticker" | "document"
) {
  const stats = loadStats();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

  // Initialize daily stats if not exists
  if (!stats.byDate) {
    stats.byDate = {};
  }

  if (!stats.byDate[today]) {
    stats.byDate[today] = {
      messages: 0,
      audios: 0,
      images: 0,
      stickers: 0,
      documents: 0,
      byCountry: {},
    };
  }

  // Update total counts
  if (messageType === "message") stats.totalMessages++;
  if (messageType === "audio") stats.totalAudios++;
  if (messageType === "image") stats.totalImages++;
  if (messageType === "sticker") stats.totalStickers++;
  if (messageType === "document") stats.totalDocuments++;

  const country = getCountryCodeFromPhone(countryCode) || countryCode;

  // Initialize country stats if not exists
  if (!stats.byCountry[country]) {
    stats.byCountry[country] = {
      messages: 0,
      audios: 0,
      images: 0,
      stickers: 0,
      documents: 0,
    };
  }

  // Initialize daily country stats if not exists
  if (!stats.byDate[today].byCountry[country]) {
    stats.byDate[today].byCountry[country] = {
      messages: 0,
      audios: 0,
      images: 0,
      stickers: 0,
      documents: 0,
    };
  }

  // Update country-specific counts
  if (messageType === "message") {
    stats.byCountry[country].messages++;
    stats.byDate[today].messages++;
    stats.byDate[today].byCountry[country].messages++;
  }
  if (messageType === "audio") {
    stats.byCountry[country].audios++;
    stats.byDate[today].audios++;
    stats.byDate[today].byCountry[country].audios++;
  }
  if (messageType === "image") {
    stats.byCountry[country].images++;
    stats.byDate[today].images++;
    stats.byDate[today].byCountry[country].images++;
  }
  if (messageType === "sticker") {
    stats.byCountry[country].stickers++;
    stats.byDate[today].stickers++;
    stats.byDate[today].byCountry[country].stickers++;
  }
  if (messageType === "document") {
    stats.byCountry[country].documents++;
    stats.byDate[today].documents++;
    stats.byDate[today].byCountry[country].documents++;
  }

  saveStats(stats);
}

// Get current stats
export function getStats(): Stats {
  return loadStats();
}
