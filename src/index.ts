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
		// Simple addition tool
		this.server.tool(
			"add",
			{ a: z.number(), b: z.number() },
			/**
			 * Adds two numbers together
			 * @param {Object} params - The parameters for addition
			 * @param {number} params.a - The first number to add
			 * @param {number} params.b - The second number to add
			 * @returns {Promise<Object>} The result of a + b or an error message
			 */
			async (params: any) => {
				try {
					// Validate input parameters
					const schema = z.object({
						a: z.number(),
						b: z.number(),
					});

					const validation = schema.safeParse(params);
					
					if (!validation.success) {
						const errors = validation.error.errors
							.map(err => `${err.path.join('.')}: ${err.message}`)
							.join(', ');
						
						return {
							content: [
								{
									type: "text",
									text: `❌ Invalid input for 'add' tool: ${errors}. Please provide two numbers (e.g., {"a": 5, "b": 3}).`,
								},
							],
							isError: true,
						};
					}

					const { a, b } = validation.data;
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
								text: `❌ Unexpected error in 'add' tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		// Calculator tool with multiple operations
		this.server.tool(
			"calculate",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]),
				a: z.number(),
				b: z.number(),
			},
			/**
			 * Performs various arithmetic operations on two numbers
			 * @param {Object} params - The parameters for calculation
			 * @param {("add"|"subtract"|"multiply"|"divide")} params.operation - The operation to perform
			 * @param {number} params.a - The first number
			 * @param {number} params.b - The second number
			 * @returns {Promise<Object>} The result of the calculation or an error message
			 */
			async (params: any) => {
				try {
					// Validate input parameters
					const schema = z.object({
						operation: z.enum(["add", "subtract", "multiply", "divide"]),
						a: z.number(),
						b: z.number(),
					});

					const validation = schema.safeParse(params);
					
					if (!validation.success) {
						const errors = validation.error.errors
							.map(err => `${err.path.join('.')}: ${err.message}`)
							.join(', ');
						
						return {
							content: [
								{
									type: "text",
									text: `❌ Invalid input for 'calculate' tool: ${errors}. Please provide: operation (add/subtract/multiply/divide), a (number), b (number).`,
								},
							],
							isError: true,
						};
					}

					const { operation, a, b } = validation.data;
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
									isError: true,
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
								isError: true,
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
								text: `❌ Unexpected error in 'calculate' tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
							},
						],
						isError: true,
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