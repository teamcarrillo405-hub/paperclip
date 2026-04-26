// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
};

export type SearchGroundingResult = {
  query: string;
  results: SearchResult[];
  groundingContext: string;
  searchedAt: string;
};

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

type SearchProvider = "brave" | "serper" | "tavily";

export function detectProvider(): SearchProvider | null {
  if (process.env.BRAVE_SEARCH_API_KEY) return "brave";
  if (process.env.SERPER_API_KEY) return "serper";
  if (process.env.TAVILY_API_KEY) return "tavily";
  return null;
}

export function isSearchConfigured(): boolean {
  return detectProvider() !== null;
}

// ---------------------------------------------------------------------------
// Provider implementations
// ---------------------------------------------------------------------------

type BraveWebResult = {
  title?: string;
  url?: string;
  description?: string;
  page_age?: string;
};

type BraveApiResponse = {
  web?: {
    results?: BraveWebResult[];
  };
};

async function searchWithBrave(query: string): Promise<SearchResult[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY ?? "";
  const encodedQuery = encodeURIComponent(query);
  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodedQuery}&count=5`,
    {
      headers: {
        "X-Subscription-Token": key,
        Accept: "application/json",
      },
    },
  );
  if (!response.ok) return [];
  const data = (await response.json()) as BraveApiResponse;
  const webResults = data?.web?.results ?? [];
  return webResults.map((item) => ({
    title: item.title ?? "",
    url: item.url ?? "",
    snippet: item.description ?? "",
    publishedAt: item.page_age ?? undefined,
  }));
}

type SerperOrganicResult = {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
};

type SerperApiResponse = {
  organic?: SerperOrganicResult[];
};

async function searchWithSerper(query: string): Promise<SearchResult[]> {
  const key = process.env.SERPER_API_KEY ?? "";
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 5 }),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as SerperApiResponse;
  const organic = data?.organic ?? [];
  return organic.map((item) => ({
    title: item.title ?? "",
    url: item.link ?? "",
    snippet: item.snippet ?? "",
    publishedAt: item.date ?? undefined,
  }));
}

type TavilyResultItem = {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
};

type TavilyApiResponse = {
  results?: TavilyResultItem[];
};

async function searchWithTavily(query: string): Promise<SearchResult[]> {
  const key = process.env.TAVILY_API_KEY ?? "";
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: 5,
      search_depth: "basic",
    }),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as TavilyApiResponse;
  const results = data?.results ?? [];
  return results.map((item) => ({
    title: item.title ?? "",
    url: item.url ?? "",
    snippet: item.content ?? "",
    publishedAt: item.published_date ?? undefined,
  }));
}

// ---------------------------------------------------------------------------
// Grounding context builder
// ---------------------------------------------------------------------------

export function buildGroundingContext(query: string, results: SearchResult[]): string {
  if (results.length === 0) return "";
  const lines = results.map(
    (r, i) => `${i + 1}. ${r.title} (${r.url})\n${r.snippet}`,
  );
  return `\n\n[Web Search Results for: "${query}"]\n${lines.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// Main search function
// ---------------------------------------------------------------------------

export async function searchWeb(query: string): Promise<SearchGroundingResult> {
  const provider = detectProvider();
  const searchedAt = new Date().toISOString();

  if (!provider) {
    return {
      query,
      results: [],
      groundingContext:
        "No search provider configured. Set BRAVE_SEARCH_API_KEY, SERPER_API_KEY, or TAVILY_API_KEY.",
      searchedAt,
    };
  }

  let results: SearchResult[];
  switch (provider) {
    case "brave":
      results = await searchWithBrave(query);
      break;
    case "serper":
      results = await searchWithSerper(query);
      break;
    case "tavily":
      results = await searchWithTavily(query);
      break;
  }

  return {
    query,
    results,
    groundingContext: buildGroundingContext(query, results),
    searchedAt,
  };
}
