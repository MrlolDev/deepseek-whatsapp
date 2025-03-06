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
    const CELL_PADDING = 20;
    const HEADER_HEIGHT = 40;
    const ROW_HEIGHT = 35;
    const TITLE_HEIGHT = tableData.title ? 50 : 0;
    const TABLE_MARGIN = 60;
    const EXTRA_WIDTH_PADDING = 40;

    // Calculate dimensions
    const columnWidths = calculateColumnWidths(tableData);
    const tableWidth =
      columnWidths.reduce((sum, width) => sum + width, 0) +
      CELL_PADDING * 2 * tableData.headers.length +
      TABLE_MARGIN * 2 +
      EXTRA_WIDTH_PADDING;
    const tableHeight =
      TITLE_HEIGHT +
      HEADER_HEIGHT +
      tableData.rows.length * ROW_HEIGHT +
      TABLE_MARGIN * 2;

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
      ctx.fillText(tableData.title, tableWidth / 2, TABLE_MARGIN + 30);
    }

    // Draw headers
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(
      TABLE_MARGIN,
      TABLE_MARGIN + TITLE_HEIGHT,
      tableWidth - TABLE_MARGIN * 2,
      HEADER_HEIGHT
    );
    ctx.fillStyle = "#333333";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "left";

    let xOffset = TABLE_MARGIN + CELL_PADDING;
    tableData.headers.forEach((header, index) => {
      ctx.fillText(
        header,
        xOffset,
        TABLE_MARGIN + TITLE_HEIGHT + HEADER_HEIGHT / 2 + 5
      );
      xOffset += columnWidths[index] + CELL_PADDING * 2;
    });

    // Draw rows
    ctx.font = "14px Arial";
    tableData.rows.forEach((row, rowIndex) => {
      const y =
        TABLE_MARGIN + TITLE_HEIGHT + HEADER_HEIGHT + rowIndex * ROW_HEIGHT;

      // Alternate row background
      if (rowIndex % 2 === 0) {
        ctx.fillStyle = "#ffffff";
      } else {
        ctx.fillStyle = "#f8f9fa";
      }
      ctx.fillRect(TABLE_MARGIN, y, tableWidth - TABLE_MARGIN * 2, ROW_HEIGHT);

      // Draw cell text
      ctx.fillStyle = "#333333";
      let xOffset = TABLE_MARGIN + CELL_PADDING;
      row.forEach((cell, cellIndex) => {
        ctx.fillText(String(cell), xOffset, y + ROW_HEIGHT / 2 + 5);
        xOffset += columnWidths[cellIndex] + CELL_PADDING * 2;
      });
    });

    // Draw grid lines
    ctx.strokeStyle = "#e5e7eb";
    ctx.beginPath();

    // Vertical lines
    xOffset = TABLE_MARGIN;
    tableData.headers.forEach((_, index) => {
      xOffset += columnWidths[index] + CELL_PADDING * 2;
      ctx.moveTo(xOffset, TABLE_MARGIN + TITLE_HEIGHT);
      ctx.lineTo(xOffset, tableHeight - TABLE_MARGIN);
    });

    // Horizontal lines
    for (let i = 0; i <= tableData.rows.length; i++) {
      const y = TABLE_MARGIN + TITLE_HEIGHT + HEADER_HEIGHT + i * ROW_HEIGHT;
      ctx.moveTo(TABLE_MARGIN, y);
      ctx.lineTo(tableWidth - TABLE_MARGIN, y);
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
    columnWidths[index] = Math.max(columnWidths[index], header.length * 8);
  });

  // Calculate based on content
  tableData.rows.forEach((row) => {
    row.forEach((cell, index) => {
      columnWidths[index] = Math.max(
        columnWidths[index],
        String(cell).length * 8
      );
    });
  });

  return columnWidths;
}
