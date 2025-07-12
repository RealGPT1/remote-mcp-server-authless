import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Dummy people database
const PEOPLE_DATABASE = [
	{
		id: 1,
		name: "Sarah Johnson",
		age: 28,
		gender: "Female",
		jobTitle: "Software Engineer",
		email: "sarah.johnson@techcorp.com"
	},
	{
		id: 2,
		name: "Michael Chen",
		age: 34,
		gender: "Male",
		jobTitle: "Product Manager",
		email: "m.chen@innovate.io"
	},
	{
		id: 3,
		name: "Emma Rodriguez",
		age: 31,
		gender: "Female",
		jobTitle: "UX Designer",
		email: "emma.r@designstudio.com"
	},
	{
		id: 4,
		name: "James Wilson",
		age: 42,
		gender: "Male",
		jobTitle: "Data Scientist",
		email: "jwilson@datatech.org"
	},
	{
		id: 5,
		name: "Alex Thompson",
		age: 26,
		gender: "Non-binary",
		jobTitle: "DevOps Engineer",
		email: "alex.thompson@cloudops.net"
	}
];

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Authless Calculator",
		version: "1.0.0",
	});

	async init() {
		// Simple addition tool
		this.server.tool(
			"add",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ type: "text", text: String(a + b) }],
			})
		);

		// Calculator tool with multiple operations
		this.server.tool(
			"calculate",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]),
				a: z.number(),
				b: z.number(),
			},
			async ({ operation, a, b }) => {
				let result: number;
				switch (operation) {
					case "add":
						result = a + b;
						break;
					case "subtract":
						result = a - b;
						break;
					case "multiply":
						result = a * b;
						break;
					case "divide":
						if (b === 0)
							return {
								content: [
									{
										type: "text",
										text: "Error: Cannot divide by zero",
									},
								],
							};
						result = a / b;
						break;
				}
				return { content: [{ type: "text", text: String(result) }] };
			}
		);

		// Person lookup tool
		this.server.tool(
			"lookup_person",
			{ name: z.string() },
			async ({ name }) => {
				// Search for person by name (case-insensitive partial match)
				const searchTerm = name.toLowerCase();
				const person = PEOPLE_DATABASE.find(p => 
					p.name.toLowerCase().includes(searchTerm)
				);

				if (!person) {
					return {
						content: [
							{
								type: "text",
								text: `No person found with name containing "${name}". Available people: ${PEOPLE_DATABASE.map(p => p.name).join(", ")}`,
							},
						],
					};
				}

				return {
					content: [
						{
							type: "text",
							text: `👤 **${person.name}**
📧 Email: ${person.email}
🎂 Age: ${person.age}
⚧ Gender: ${person.gender}
💼 Job Title: ${person.jobTitle}`,
						},
					],
				};
			}
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};