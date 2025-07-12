import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * MCP Agent that provides calculator tools for arithmetic operations.
 * This server runs on Cloudflare Workers and exposes mathematical tools
 * that can be used by MCP clients like Claude.
 */
export class MyMCP extends McpAgent {
	/**
	 * The MCP server instance that handles tool registration and execution
	 */
	server = new McpServer({
		name: "Authless Calculator",
		version: "1.0.0",
	});

	/**
	 * Initialize the MCP server with available tools.
	 * This method registers all mathematical tools that clients can use.
	 */
	async init() {
		/**
		 * Simple addition tool that adds two numbers together
		 * @example add({"a": 5, "b": 3}) => "5 + 3 = 8"
		 */
		this.server.tool(
			"add",
			{ a: z.number(), b: z.number() },
			async (params) => {
				try {
					// Debug: log what we're receiving
					console.log('Add tool params:', params);
					
					// Handle different parameter formats
					const a = params.a ?? params[0];
					const b = params.b ?? params[1];
					
					if (a === undefined || b === undefined) {
						return {
							content: [
								{
									type: "text",
									text: `❌ Missing parameters. Received: ${JSON.stringify(params)}. Expected: {"a": number, "b": number}`,
								},
							],
						};
					}
					
					const result = a + b;
					return {
						content: [
							{
								type: "text",
								text: `${a} + ${b} = ${result}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Error in addition: ${error instanceof Error ? error.message : 'Unknown error'}`,
							},
						],
					};
				}
			}
		);

		/**
		 * Calculator tool with multiple operations (add, subtract, multiply, divide)
		 * @example calculate({"operation": "multiply", "a": 6, "b": 7}) => "6 × 7 = 42"
		 */
		this.server.tool(
			"calculate",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]),
				a: z.number(),
				b: z.number(),
			},
			async (params) => {
				try {
					// Debug: log what we're receiving
					console.log('Calculate tool params:', params);
					
					// Handle different parameter formats
					const operation = params.operation;
					const a = params.a;
					const b = params.b;
					
					if (operation === undefined || a === undefined || b === undefined) {
						return {
							content: [
								{
									type: "text",
									text: `❌ Missing parameters. Received: ${JSON.stringify(params)}. Expected: {"operation": "add|subtract|multiply|divide", "a": number, "b": number}`,
								},
							],
						};
					}
					
					let result: number;
					let operationSymbol: string;

					switch (operation) {
						case "add":
							result = a + b;
							operationSymbol = "+";
							break;
						case "subtract":
							result = a - b;
							operationSymbol = "-";
							break;
						case "multiply":
							result = a * b;
							operationSymbol = "×";
							break;
						case "divide":
							if (b === 0) {
								return {
									content: [
										{
											type: "text",
											text: "❌ Error: Cannot divide by zero. Please provide a non-zero divisor.",
										},
									],
								};
							}
							result = a / b;
							operationSymbol = "÷";
							break;
						default:
							return {
								content: [
									{
										type: "text",
										text: `❌ Error: Unknown operation '${operation}'. Supported operations: add, subtract, multiply, divide.`,
									},
								],
							};
					}

					// Format result nicely for division to avoid long decimals
					const formattedResult = operation === "divide" && result % 1 !== 0 
						? parseFloat(result.toFixed(6)) 
						: result;

					return {
						content: [
							{
								type: "text",
								text: `${a} ${operationSymbol} ${b} = ${formattedResult}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Unexpected error in calculation: ${error instanceof Error ? error.message : 'Unknown error'}`,
							},
						],
					};
				}
			}
		);
	}
}

/**
 * Cloudflare Worker fetch handler that routes requests to the appropriate MCP endpoints.
 * 
 * @param {Request} request - The incoming HTTP request
 * @param {Env} env - Cloudflare Worker environment variables
 * @param {ExecutionContext} ctx - Cloudflare Worker execution context
 * @returns {Promise<Response>} The HTTP response
 */
export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		// Handle Server-Sent Events (SSE) endpoint for MCP communication
		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		// Handle standard MCP endpoint
		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		// Return 404 for unknown paths
		return new Response("Not found", { status: 404 });
	},
};