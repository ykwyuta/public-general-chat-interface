#!/usr/bin/env node
/**
 * Brave Search MCP Server
 *
 * Provides web and local search via the Brave Search API.
 * Requires BRAVE_API_KEY environment variable.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API_KEY = process.env.BRAVE_API_KEY;
if (!API_KEY) {
  console.error('[brave-search] BRAVE_API_KEY is not set');
  process.exit(1);
}

const BASE_URL = 'https://api.search.brave.com/res/v1';

const TOOLS = [
  {
    name: 'brave_web_search',
    description: 'Search the web using Brave Search. Returns web results including titles, URLs, and descriptions.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query string',
        },
        count: {
          type: 'number',
          description: 'Number of results to return (1-20, default: 10)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (0-9, default: 0)',
        },
        country: {
          type: 'string',
          description: 'Country code for search results (e.g. "JP", "US")',
        },
        search_lang: {
          type: 'string',
          description: 'Language for search results (e.g. "ja", "en")',
        },
        freshness: {
          type: 'string',
          description: 'Filter by age: "pd" (past day), "pw" (past week), "pm" (past month), "py" (past year)',
        },
        safesearch: {
          type: 'string',
          enum: ['off', 'moderate', 'strict'],
          description: 'Safe search level (default: "moderate")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'brave_local_search',
    description: 'Search for local businesses and places using Brave Search. Returns nearby locations with addresses and ratings.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Local search query (e.g. "coffee shops in Tokyo")',
        },
        count: {
          type: 'number',
          description: 'Number of results to return (1-20, default: 5)',
        },
      },
      required: ['query'],
    },
  },
];

async function braveWebSearch(args) {
  const params = new URLSearchParams({ q: args.query });
  if (args.count != null) params.set('count', String(Math.min(20, Math.max(1, args.count))));
  if (args.offset != null) params.set('offset', String(Math.min(9, Math.max(0, args.offset))));
  if (args.country) params.set('country', args.country);
  if (args.search_lang) params.set('search_lang', args.search_lang);
  if (args.freshness) params.set('freshness', args.freshness);
  if (args.safesearch) params.set('safesearch', args.safesearch);

  const res = await fetch(`${BASE_URL}/web/search?${params}`, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': API_KEY,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brave Search API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const results = data.web?.results ?? [];

  if (results.length === 0) {
    return 'No results found.';
  }

  return results.map((r, i) => {
    const parts = [`${i + 1}. **${r.title}**`, `   URL: ${r.url}`];
    if (r.description) parts.push(`   ${r.description}`);
    if (r.page_age) parts.push(`   Published: ${r.page_age}`);
    return parts.join('\n');
  }).join('\n\n');
}

async function braveLocalSearch(args) {
  const count = Math.min(20, Math.max(1, args.count ?? 5));
  const params = new URLSearchParams({
    q: args.query,
    count: String(count),
    result_filter: 'locations',
  });

  const res = await fetch(`${BASE_URL}/web/search?${params}`, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': API_KEY,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brave Search API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const locations = data.locations?.results ?? [];

  if (locations.length === 0) {
    // Fall back to web search results
    const webResults = data.web?.results ?? [];
    if (webResults.length === 0) return 'No local results found.';
    return webResults.slice(0, count).map((r, i) => {
      const parts = [`${i + 1}. **${r.title}**`, `   URL: ${r.url}`];
      if (r.description) parts.push(`   ${r.description}`);
      return parts.join('\n');
    }).join('\n\n');
  }

  const poiIds = locations.map(l => l.id).filter(Boolean);
  if (poiIds.length > 0) {
    try {
      const poiParams = new URLSearchParams();
      poiIds.forEach(id => poiParams.append('ids', id));
      const poiRes = await fetch(`${BASE_URL}/local/pois?${poiParams}`, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': API_KEY,
        },
      });
      if (poiRes.ok) {
        const poiData = await poiRes.json();
        const pois = poiData.results ?? [];
        if (pois.length > 0) {
          return pois.map((p, i) => {
            const parts = [`${i + 1}. **${p.name}**`];
            if (p.address) {
              const addr = [p.address.streetAddress, p.address.addressLocality, p.address.addressRegion]
                .filter(Boolean).join(', ');
              if (addr) parts.push(`   Address: ${addr}`);
            }
            if (p.phone) parts.push(`   Phone: ${p.phone}`);
            if (p.rating?.ratingValue) parts.push(`   Rating: ${p.rating.ratingValue}/5 (${p.rating.ratingCount ?? 0} reviews)`);
            if (p.openingHours) parts.push(`   Hours: ${Array.isArray(p.openingHours) ? p.openingHours.join(', ') : p.openingHours}`);
            if (p.priceRange) parts.push(`   Price: ${p.priceRange}`);
            if (p.categories?.length) parts.push(`   Category: ${p.categories.join(', ')}`);
            return parts.join('\n');
          }).join('\n\n');
        }
      }
    } catch {
      // ignore POI detail fetch failure, fall through to basic locations
    }
  }

  return locations.map((l, i) => {
    const parts = [`${i + 1}. **${l.title}**`];
    if (l.url) parts.push(`   URL: ${l.url}`);
    if (l.description) parts.push(`   ${l.description}`);
    return parts.join('\n');
  }).join('\n\n');
}

const server = new Server(
  { name: 'brave-search', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let text;
    if (name === 'brave_web_search') {
      text = await braveWebSearch(args);
    } else if (name === 'brave_local_search') {
      text = await braveLocalSearch(args);
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: 'text', text }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
