interface SearchResult {
  title: string;
  link: string;
  description: string;
  extra_snippets: string[];
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
    const results = [];
    for (const result of data.web.results) {
      results.push({
        title: result.title,
        link: result.url,
        description: result.description,
        extra_snippets: result.extra_snippets,
      });
    }
    if (data.query.is_news_breaking) {
      for (const result of data.news.results) {
        results.push({
          title: result.title,
          link: result.url,
          description: result.description,
          extra_snippets: [],
        });
      }
    }
    return results as SearchResult[];
  } catch (error) {
    console.error("Error performing web search:", error);
    throw new Error("Failed to perform web search");
  }
}
