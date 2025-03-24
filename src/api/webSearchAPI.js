/**
 * Performs a web search against your Cloudflare worker
 * (`websearch.arman-dogru.workers.dev`) which in turn calls Google Custom Search.
 *
 * @param {string} query - The user’s search query
 * @returns {Promise<Array<{ title: string, snippet: string, link: string }>>}
 */
async function googleSearchAPI(query) {
  try {
    const response = await fetch(
      `https://websearch.arman-dogru.workers.dev/?query=${encodeURIComponent(query)}`,
      {
        method: "GET",
      }
    );
    if (!response.ok) {
      throw new Error(`WebSearch request failed: ${response.statusText}`);
    }

    // This should return an array of objects: [{ title, snippet, link }, ...]
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error in googleSearchAPI:", error);
    return [];
  }
}

/**
 * Crawls a given page URL using your Cloudflare worker
 * (`openlink.arman-dogru.workers.dev`) which cleans the HTML and returns text.
 *
 * @param {string} url - The URL to crawl
 * @returns {Promise<string>} - The plain text content from the page
 */
async function crawlWebPage(url) {
  try {
    const response = await fetch(
      `https://openlink.arman-dogru.workers.dev/?url=${encodeURIComponent(url)}`,
      {
        method: "GET",
      }
    );
    if (!response.ok) {
      throw new Error(`Crawl request failed: ${response.statusText}`);
    }

    // The worker response should already be text-only (cleaned HTML).
    return await response.text();
  } catch (error) {
    console.error("Error in crawlWebPage:", error);
    throw error;
  }
}

/**
 * Merges the snippet from the search result with the crawled text content.
 * You can adjust formatting or structure as needed.
 *
 * @param {string} snippet - The short snippet from the search result
 * @param {string} crawledContent - Plain text from the crawled page
 * @returns {string} - A combined text result
 */
function generateContextResult(snippet, crawledContent) {
  return `Snippet: ${snippet}\nCrawled Content: ${crawledContent}`;
}

/**
 * Main function to handle searching the web with a given query,
 * crawling each result's link, and returning a final text corpus
 * that merges the snippet + crawled content for each item.
 *
 * @param {string} query - The user’s search query
 * @returns {Promise<Array<{ title: string, url: string, combinedText: string }>>}
 */
export const searchWeb = async (query) => {
  try {
    // 1. Fetch search results from your Cloudflare-based webSearch worker
    const searchResults = await googleSearchAPI(query);

    // 2. For each result, crawl the URL to get the cleaned text
    const finalResults = [];
    for (const result of searchResults) {
      let crawledContent = "";
      try {
        crawledContent = await crawlWebPage(result.link);
      } catch (error) {
        console.error(`Error crawling link "${result.link}":`, error);
      }

      // 3. Combine snippet + crawled content
      const combinedText = generateContextResult(result.snippet, crawledContent);

      // Prepare the final structure
      finalResults.push({
        title: result.title,
        url: result.link,
        combinedText,
      });
    }

    // 4. Return the array of aggregated content
    return finalResults;
  } catch (error) {
    console.error("Error in searchWeb:", error);
    // Fallback in case something goes wrong
    return [];
  }
};
