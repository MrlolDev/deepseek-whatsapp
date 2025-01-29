import pkg from "pdfjs-dist";
const { getDocument, GlobalWorkerOptions } = pkg;
/**
 * Maps country calling codes to ISO country codes
 */
const COUNTRY_CALLING_CODES: { [key: string]: string } = {
  "1": "US", // United States/Canada
  "7": "RU", // Russia
  "20": "EG", // Egypt
  "27": "ZA", // South Africa
  "30": "GR", // Greece
  "31": "NL", // Netherlands
  "32": "BE", // Belgium
  "33": "FR", // France
  "34": "ES", // Spain
  "36": "HU", // Hungary
  "39": "IT", // Italy
  "40": "RO", // Romania
  "41": "CH", // Switzerland
  "43": "AT", // Austria
  "44": "GB", // United Kingdom
  "45": "DK", // Denmark
  "46": "SE", // Sweden
  "47": "NO", // Norway
  "48": "PL", // Poland
  "49": "DE", // Germany
  "51": "PE", // Peru
  "52": "MX", // Mexico
  "54": "AR", // Argentina
  "55": "BR", // Brazil
  "56": "CL", // Chile
  "57": "CO", // Colombia
  "58": "VE", // Venezuela
  "60": "MY", // Malaysia
  "61": "AU", // Australia
  "62": "ID", // Indonesia
  "63": "PH", // Philippines
  "64": "NZ", // New Zealand
  "65": "SG", // Singapore
  "66": "TH", // Thailand
  "81": "JP", // Japan
  "82": "KR", // South Korea
  "84": "VN", // Vietnam
  "86": "CN", // China
  "90": "TR", // Turkey
  "91": "IN", // India
  "92": "PK", // Pakistan
  "93": "AF", // Afghanistan
  "94": "LK", // Sri Lanka
  "95": "MM", // Myanmar
  "98": "IR", // Iran
};

// Configure the worker
GlobalWorkerOptions.workerSrc = "";

/**
 * Gets the ISO country code from a phone number.
 * @param phoneNumber The phone number (e.g., +34253521)
 * @returns The ISO country code (e.g., 'ES') or null if not found
 */
export function getCountryCodeFromPhone(phoneNumber: string): string | null {
  // Remove all spaces, dashes and other common separators
  const cleanNumber = phoneNumber.replace(/[\s\-\(\)]/g, "");

  // Check if number starts with + or 00
  let numericPart: string | null = null;

  if (cleanNumber.startsWith("+")) {
    numericPart = cleanNumber.substring(1);
  } else if (cleanNumber.startsWith("00")) {
    numericPart = cleanNumber.substring(2);
  }

  if (!numericPart) return null;

  // Try matching from longest to shortest country codes (3 digits to 1 digit)
  for (let i = 3; i >= 1; i--) {
    const potentialCode = numericPart.substring(0, i);
    if (COUNTRY_CALLING_CODES[potentialCode]) {
      return COUNTRY_CALLING_CODES[potentialCode];
    }
  }

  return null;
}

export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  const uint8Array = new Uint8Array(pdfBuffer); // Convert Buffer to Uint8Array

  const loadingTask = getDocument({
    data: uint8Array,
    verbosity: 0,
    useSystemFonts: false,
    disableFontFace: true,
  });

  try {
    const pdf = await loadingTask.promise;
    let text = "";

    if (pdf.numPages === 0) {
      return "No pages found in the PDF.";
    }

    // Limit to first 5 pages
    const pagesToRead = Math.min(5, pdf.numPages);
    for (let i = 1; i <= pagesToRead; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(" ") + "\n";
    }

    return text;
  } catch (error) {
    console.error("Error processing PDF:", error);
    throw error;
  } finally {
    loadingTask.destroy();
  }
}
