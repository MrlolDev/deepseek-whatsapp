import { createCanvas } from "canvas";

interface SearchResult {
  title: string;
  link: string;
  description: string;
  extra_snippets: string[];
  news?: boolean;
  web_result?: boolean;
}

interface TableData {
  headers: string[];
  rows: (string | number)[][];
  title?: string;
}

export async function webSearch(
  query: string,
  country: string = "US"
): Promise<SearchResult[]> {
  try {
    const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
    if (!BRAVE_API_KEY) {
      throw new Error("BRAVE_API_KEY environment variable is not set");
    }

    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
      query
    )}&count=10&country=${country}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": BRAVE_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Search failed with status ${response.status}`);
    }

    const data = await response.json();
    const results = [];
    for (const result of data.web.results) {
      results.push({
        title: result.title,
        link: result.url,
        description: result.description,
        extra_snippets: result.extra_snippets,
        web_result: true,
      });
    }
    if (data.query.is_news_breaking) {
      for (const result of data.news.results) {
        results.push({
          title: result.title,
          link: result.url,
          description: result.description,
          extra_snippets: [],
          news: true,
        });
      }
    }
    return results as SearchResult[];
  } catch (error) {
    console.error("Error performing web search:", error);
    throw new Error("Failed to perform web search");
  }
}

export async function createTableImage(tableData: TableData): Promise<Buffer> {
  try {
    // Set up styling constants
    const CELL_PADDING = 10;
    const HEADER_HEIGHT = 40;
    const ROW_HEIGHT = 35;
    const TITLE_HEIGHT = tableData.title ? 50 : 0;

    // Calculate dimensions
    const columnWidths = calculateColumnWidths(tableData);
    const tableWidth =
      columnWidths.reduce((sum, width) => sum + width, 0) + CELL_PADDING * 2;
    const tableHeight =
      TITLE_HEIGHT + HEADER_HEIGHT + tableData.rows.length * ROW_HEIGHT;

    // Create canvas
    const canvas = createCanvas(tableWidth, tableHeight);
    const ctx = canvas.getContext("2d");

    // Set background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, tableWidth, tableHeight);

    // Draw title if exists
    if (tableData.title) {
      ctx.fillStyle = "#333333";
      ctx.font = "bold 16px Arial";
      ctx.textAlign = "center";
      ctx.fillText(tableData.title, tableWidth / 2, 30);
    }

    // Draw headers
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(0, TITLE_HEIGHT, tableWidth, HEADER_HEIGHT);
    ctx.fillStyle = "#333333";
    ctx.font = "bold 14px Arial";

    let xOffset = CELL_PADDING;
    tableData.headers.forEach((header, index) => {
      ctx.fillText(header, xOffset, TITLE_HEIGHT + HEADER_HEIGHT / 2 + 5);
      xOffset += columnWidths[index];
    });

    // Draw rows
    ctx.font = "14px Arial";
    tableData.rows.forEach((row, rowIndex) => {
      const y = TITLE_HEIGHT + HEADER_HEIGHT + rowIndex * ROW_HEIGHT;

      // Alternate row background
      if (rowIndex % 2 === 0) {
        ctx.fillStyle = "#ffffff";
      } else {
        ctx.fillStyle = "#f8f9fa";
      }
      ctx.fillRect(0, y, tableWidth, ROW_HEIGHT);

      // Draw cell text
      ctx.fillStyle = "#333333";
      let xOffset = CELL_PADDING;
      row.forEach((cell, cellIndex) => {
        ctx.fillText(String(cell), xOffset, y + ROW_HEIGHT / 2 + 5);
        xOffset += columnWidths[cellIndex];
      });
    });

    // Draw grid lines
    ctx.strokeStyle = "#e5e7eb";
    ctx.beginPath();

    // Vertical lines
    xOffset = 0;
    tableData.headers.forEach((_, index) => {
      xOffset += columnWidths[index];
      ctx.moveTo(xOffset, TITLE_HEIGHT);
      ctx.lineTo(xOffset, tableHeight);
    });

    // Horizontal lines
    for (let i = 0; i <= tableData.rows.length; i++) {
      const y = TITLE_HEIGHT + HEADER_HEIGHT + i * ROW_HEIGHT;
      ctx.moveTo(0, y);
      ctx.lineTo(tableWidth, y);
    }

    ctx.stroke();

    return canvas.toBuffer("image/png");
  } catch (error) {
    console.error("Error creating table image:", error);
    throw new Error("Failed to create table image");
  }
}

function calculateColumnWidths(tableData: TableData): number[] {
  const columnWidths: number[] = Array(tableData.headers.length).fill(100); // Default width

  // Calculate based on headers
  tableData.headers.forEach((header, index) => {
    columnWidths[index] = Math.max(columnWidths[index], header.length * 10);
  });

  // Calculate based on content
  tableData.rows.forEach((row) => {
    row.forEach((cell, index) => {
      columnWidths[index] = Math.max(
        columnWidths[index],
        String(cell).length * 10
      );
    });
  });

  return columnWidths;
}
