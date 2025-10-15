#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const CHGIS_BASE_URL = "http://tgaz.fudan.edu.cn/tgaz";

class CHGISServer {
  constructor() {
    this.server = new Server(
      {
        name: "chgis-gazetteer-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "search_place_by_id",
            description: "Query historical place details by unique ID",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Place unique ID (format: hvd_numbers, e.g., hvd_32180)",
                  pattern: "^hvd_\\d+$",
                },
                format: {
                  type: "string",
                  description: "Return data format",
                  enum: ["json", "xml"],
                  default: "json",
                },
              },
              required: ["id"],
            },
          },
          {
            name: "search_places",
            description: "Search places by name, year, administrative level, etc.",
            inputSchema: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Place name (supports Chinese, Pinyin, etc.)",
                },
                year: {
                  type: "integer",
                  description: "Historical year (range: -222 to 1911)",
                  minimum: -222,
                  maximum: 1911,
                },
                feature_type: {
                  type: "string",
                  description: "Administrative level type (e.g., zhou, xian, fu)",
                },
                parent: {
                  type: "string",
                  description: "Parent place or administrative division",
                },
                source: {
                  type: "string",
                  description: "Data source (e.g., CHGIS, RAS)",
                  enum: ["CHGIS", "RAS"],
                },
                format: {
                  type: "string",
                  description: "Return data format",
                  enum: ["json", "xml", "html"],
                  default: "json",
                },
              },
              required: [],
            },
          },
          {
            name: "get_place_historical_context",
            description: "Get historical context and hierarchical relationships of a place",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Place unique ID (format: hvd_numbers)",
                  pattern: "^hvd_\\d+$",
                },
              },
              required: ["id"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "search_place_by_id":
            return await this.searchPlaceById(args);
          case "search_places":
            return await this.searchPlaces(args);
          case "get_place_historical_context":
            return await this.getPlaceHistoricalContext(args);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error.message}`
        );
      }
    });
  }

  async searchPlaceById(args) {
    const { id, format = "json" } = args;

    if (!id || !id.match(/^hvd_\d+$/)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Invalid ID format. Expected format: hvd_numbers (e.g., hvd_32180)"
      );
    }

    const url = `${CHGIS_BASE_URL}/placename/${format}/${id}`;

    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'Accept': format === 'json' ? 'application/json' : 'application/xml',
        },
      });

      if (format === 'json') {
        const data = response.data;
        return {
          content: [
            {
              type: "text",
              text: this.formatPlaceDetails(data),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `# Place Details (XML Format)\n\n\`\`\`xml\n${response.data}\n\`\`\``,
            },
          ],
        };
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `No place record found for ID ${id}`
        );
      }
      throw error;
    }
  }

  async searchPlaces(args) {
    const { name, year, feature_type, parent, source, format = "json" } = args;

    const params = new URLSearchParams();
    if (name) params.append("n", name);
    if (year) params.append("yr", year.toString());
    if (feature_type) params.append("ftyp", feature_type);
    if (parent) params.append("p", parent);
    if (source) params.append("src", source);
    params.append("fmt", format);

    if (params.toString() === "") {
      throw new McpError(
        ErrorCode.InvalidParams,
        "At least one search parameter must be provided"
      );
    }

    const url = `${CHGIS_BASE_URL}/placename?${params.toString()}`;

    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'Accept': format === 'json' ? 'application/json' : 'text/html',
        },
      });

      if (format === 'json') {
        const data = response.data;
        return {
          content: [
            {
              type: "text",
              text: this.formatSearchResults(data),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `# Search Results (${format.toUpperCase()} Format)\n\n\`\`\`${format}\n${response.data}\n\`\`\``,
            },
          ],
        };
      }
    } catch (error) {
      throw error;
    }
  }

  async getPlaceHistoricalContext(args) {
    const { id } = args;

    const url = `${CHGIS_BASE_URL}/placename/xml/${id}`;

    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'Accept': 'application/xml',
        },
      });

      return {
        content: [
          {
            type: "text",
            text: this.formatHistoricalContext(response.data, id),
          },
        ],
      };
    } catch (error) {
      if (error.response && error.response.status === 404) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `No place record found for ID ${id}`
        );
      }
      throw error;
    }
  }

  formatPlaceDetails(data) {
    let output = `# Place Details\n\n`;
    output += `**System ID**: ${data.sys_id}\n`;
    output += `**URI**: ${data.uri}\n`;
    output += `**Data Source**: ${data["data source"] || data.system}\n`;
    output += `**License**: ${data.license || "CC BY-NC 4.0"}\n\n`;

    if (data.spellings && data.spellings.length > 0) {
      output += `## Place Names\n\n`;
      data.spellings.forEach(spelling => {
        const script = spelling.script || "Unknown script";
        output += `- **${script}**: ${spelling["written form"]}\n`;
      });
      output += "\n";
    }

    if (data["feature-type"]) {
      const ft = data["feature-type"];
      output += `## Administrative Type\n\n`;
      output += `- **Chinese Name**: ${ft.name}\n`;
      output += `- **Pinyin**: ${ft.transcription}\n`;
      if (ft.translation) {
        output += `- **English Translation**: ${ft.translation}\n`;
      }
      output += "\n";
    }

    if (data.temporal) {
      const temp = data.temporal;
      output += `## Time Period\n\n`;
      output += `- **Start Year**: ${temp.begin}\n`;
      output += `- **End Year**: ${temp.end}\n`;
      output += `- **Duration**: ${temp.end - temp.begin} years\n\n`;
    }

    if (data.spatial) {
      const spatial = data.spatial;
      output += `## Geographic Information\n\n`;
      output += `- **Coordinate Type**: ${spatial["object-type"]}\n`;
      if (spatial["degrees-latitude"] && spatial["degrees-longitude"]) {
        output += `- **Coordinates**: ${spatial["degrees-longitude"]}°E, ${spatial["degrees-latitude"]}°N\n`;
      }
      if (spatial["present-location"]) {
        output += `- **Present Location**: ${spatial["present-location"].trim()}\n`;
      }
      output += "\n";
    }

    return output;
  }

  formatSearchResults(data) {
    let output = `# CHGIS Place Search Results\n\n`;
    output += `**Query Description**: ${data.memo}\n`;
    output += `**Displayed Results**: ${data["count of displayed results"]}\n`;
    output += `**Total Results**: ${data["count of total results"]}\n\n`;

    if (data.placenames && data.placenames.length > 0) {
      output += `## Search Results\n\n`;
      data.placenames.forEach((place, index) => {
        output += `### ${index + 1}. ${place.name}\n\n`;
        output += `- **System ID**: ${place.sys_id}\n`;
        output += `- **Pinyin**: ${place.transcription}\n`;
        output += `- **Years**: ${place.years}\n`;
        output += `- **Feature Type**: ${place["feature type"]}\n`;
        output += `- **Parent Unit**: ${place["parent name"]}\n`;
        if (place["xy coordinates"]) {
          output += `- **Coordinates**: ${place["xy coordinates"]}\n`;
        }
        output += `- **Data Source**: ${place["data source"]}\n`;
        output += `- **Detail Link**: ${place.uri}\n\n`;
      });
    } else {
      output += `No matching place records found.\n`;
    }

    return output;
  }

  formatHistoricalContext(xmlData, id) {
    let output = `# Place Historical Context\n\n`;
    output += `**System ID**: ${id}\n\n`;

    const spellingsMatch = xmlData.match(/<written-form[^>]*>([^<]+)<\/written-form>/g);
    if (spellingsMatch) {
      output += `## Historical Names\n\n`;
      spellingsMatch.forEach(match => {
        const name = match.match(/>([^<]+)</)[1];
        const script = match.match(/script="([^"]+)"/);
        const scriptText = script ? script[1] : "Unknown script";
        output += `- **${scriptText}**: ${name}\n`;
      });
      output += "\n";
    }

    const beginMatch = xmlData.match(/<begin>([^<]+)<\/begin>/);
    const endMatch = xmlData.match(/<end>([^<]+)<\/end>/);
    if (beginMatch && endMatch) {
      output += `## Time Period\n\n`;
      output += `- **Start Year**: ${beginMatch[1]}\n`;
      output += `- **End Year**: ${endMatch[1]}\n`;
      output += `- **Duration**: ${parseInt(endMatch[1]) - parseInt(beginMatch[1])} years\n\n`;
    }

    const partOfMatches = xmlData.match(/<part-of[^>]*>[\s\S]*?<\/part-of>/g);
    if (partOfMatches && partOfMatches.length > 0) {
      output += `## Historical Administrative Relationships\n\n`;
      partOfMatches.forEach((partOf, index) => {
        const parentName = partOf.match(/<parent-name>([^<]+)<\/parent-name>/);
        const fromYear = partOf.match(/from="([^"]+)"/);
        const toYear = partOf.match(/to="([^"]+)"/);

        if (parentName) {
          output += `### ${index + 1}. ${parentName[1]}\n`;
          if (fromYear && toYear) {
            output += `- **Period**: ${fromYear[1]} - ${toYear[1]}\n`;
          }
          output += "\n";
        }
      });
    }

    const subordinateMatches = xmlData.match(/<subordinate-unit[^>]*>[\s\S]*?<\/subordinate-unit>/g);
    if (subordinateMatches && subordinateMatches.length > 0) {
      output += `## Subordinate Units\n\n`;
      subordinateMatches.forEach((subordinate, index) => {
        const name = subordinate.match(/<name>([^<]+)<\/name>/);
        const transcribedName = subordinate.match(/<transcribed-name>([^<]+)<\/transcribed-name>/);
        const fromYear = subordinate.match(/from="([^"]+)"/);
        const toYear = subordinate.match(/to="([^"]+)"/);

        if (name) {
          output += `### ${index + 1}. ${name[1]}\n`;
          if (transcribedName) {
            output += `- **Pinyin**: ${transcribedName[1]}\n`;
          }
          if (fromYear && toYear) {
            output += `- **Jurisdiction Period**: ${fromYear[1]} - ${toYear[1]}\n`;
          }
          output += "\n";
        }
      });
    }

    output += `\n---\n\n*Data source: CHGIS (China Historical Geographic Information System)*`;
    return output;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("CHGIS MCP Server running on stdio");
  }
}

const server = new CHGISServer();
server.run().catch(console.error);