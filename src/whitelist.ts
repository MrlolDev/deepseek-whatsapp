import fs from "fs/promises";
import path from "path";

const WHITELIST_FILE = path.join(process.cwd(), "whitelist.json");
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "";

interface Whitelist {
  authorizedNumbers: string[];
}

// Initialize whitelist file if it doesn't exist
async function initializeWhitelist(): Promise<void> {
  try {
    await fs.access(WHITELIST_FILE);
  } catch {
    const initialData: Whitelist = {
      authorizedNumbers: [ADMIN_NUMBER],
    };
    await fs.writeFile(WHITELIST_FILE, JSON.stringify(initialData, null, 2));
  }
}

// Load the whitelist from file
async function loadWhitelist(): Promise<string[]> {
  const data = await fs.readFile(WHITELIST_FILE, "utf-8");
  const whitelist: Whitelist = JSON.parse(data);
  return whitelist.authorizedNumbers;
}

// Clean phone number by removing spaces, + and - signs
function cleanPhoneNumber(number: string): string {
  return number.replace(/[\s+-]/g, "");
}

// Add a new number to the whitelist
async function addToWhitelist(number: string): Promise<boolean> {
  const whitelist = await loadWhitelist();
  const cleanedNumber = cleanPhoneNumber(number);
  if (whitelist.includes(cleanedNumber)) {
    return false;
  }

  whitelist.push(cleanedNumber);
  await fs.writeFile(
    WHITELIST_FILE,
    JSON.stringify({ authorizedNumbers: whitelist }, null, 2)
  );
  return true;
}

// Check if a number is authorized
async function isAuthorized(number: string): Promise<boolean> {
  const whitelist = await loadWhitelist();
  const cleanedNumber = cleanPhoneNumber(number);
  return whitelist.some((authorizedNumber) =>
    cleanedNumber.includes(cleanPhoneNumber(authorizedNumber))
  );
}

export { initializeWhitelist, addToWhitelist, isAuthorized, ADMIN_NUMBER };
