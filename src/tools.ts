interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  description: string;
  metaDescription?: string;
  keywords?: string[];
  mainContent?: string;
}

export async function webSearch(query: string): Promise<SearchResult[]> {
  try {
    // Using DuckDuckGo HTML search
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Search failed with status ${response.status}`);
    }

    const html = await response.text();

    // Extract search results using regex
    const results = Array.from(
      html.matchAll(
        /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>.*?<a class="result__snippet"[^>]*>([^<]+)<\/a>/g
      )
    )
      .slice(0, 5)
      .map((match) => ({
        link: decodeURIComponent(match[1].replace("/d.js?q=", "")).split(
          "&duc="
        )[0],
        title: match[2],
        snippet: match[3],
      }));

    // Process and enrich the results
    return await Promise.all(
      results.map(async (result) => {
        try {
          // Fetch the actual webpage to extract more content
          const pageResponse = await fetch(result.link);
          const pageText = await pageResponse.text();

          // Extract meta description and keywords from HTML
          const metaDescription = pageText.match(
            /<meta name="description" content="([^"]*)">/
          )?.[1];
          const keywords = pageText
            .match(/<meta name="keywords" content="([^"]*)">/)?.[1]
            ?.split(",");

          // Extract main content (simplified)
          const mainContent = pageText
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 1000); // First 1000 chars of main content

          return {
            title: result.title,
            link: result.link,
            snippet: result.snippet,
            description: result.snippet,
            metaDescription,
            keywords,
            mainContent,
          };
        } catch (error) {
          // If we can't fetch additional content, return basic result
          return {
            title: result.title,
            link: result.link,
            snippet: result.snippet,
            description: result.snippet,
          };
        }
      })
    );
  } catch (error) {
    console.error("Error performing web search:", error);
    throw new Error("Failed to perform web search");
  }
}
