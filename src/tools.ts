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
    const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
    if (!BRAVE_API_KEY) {
      throw new Error("BRAVE_API_KEY environment variable is not set");
    }

    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
      query
    )}`;
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
    return data.web.results.map((result: any) => ({
      title: result.title,
      link: result.url,
      snippet: result.description,
      description: result.description,
    }));
  } catch (error) {
    console.error("Error performing web search:", error);
    throw new Error("Failed to perform web search");
  }
}

(async () => {
  const results = await webSearch("What is the weather in Tokyo?");
  console.log(results);
})();
