import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DurableObject } from "cloudflare:workers";
import { z } from "zod";

// Define person type
type Person = {
	id: number;
	name: string;
	age: number;
	gender: string;
	jobTitle: string;
	email: string;
};

// Define state type (empty since we removed counter)
type State = {};

// Shared Durable Object for people database
export class SharedPeopleDatabase extends DurableObject {
	private people: Person[] = [];
	private initialized = false;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	// Initialize with default data if empty
	private async initializeIfNeeded() {
		if (this.initialized) return;

		// Load existing data from storage
		const stored = await this.ctx.storage.get<Person[]>("people");
		
		if (stored) {
			this.people = stored;
		} else {
			// Initialize with default people
			this.people = [
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
			await this.ctx.storage.put("people", this.people);
		}
		
		this.initialized = true;
	}

	// Handle requests to the shared database
	async fetch(request: Request): Promise<Response> {
		await this.initializeIfNeeded();

		const url = new URL(request.url);
		const method = request.method;

		try {
			if (method === "GET" && url.pathname === "/search") {
				const name = url.searchParams.get("name");
				if (!name) {
					return Response.json({ error: "Name parameter required" }, { status: 400 });
				}

				const searchTerm = name.toLowerCase();
				const person = this.people.find(p => 
					p.name.toLowerCase().includes(searchTerm)
				);

				if (!person) {
					return Response.json({ 
						error: `No person found with name containing "${name}"`,
						availablePeople: this.people.map(p => p.name)
					}, { status: 404 });
				}

				return Response.json({ person });
			}

			if (method === "GET" && url.pathname === "/list") {
				return Response.json({ people: this.people });
			}

			if (method === "POST" && url.pathname === "/add") {
				const body = await request.json();
				const { name, age, gender, jobTitle, email } = body;

				// Generate new ID
				const newId = Math.max(...this.people.map(p => p.id), 0) + 1;
				
				const newPerson: Person = {
					id: newId,
					name,
					age,
					gender,
					jobTitle,
					email,
				};

				this.people.push(newPerson);
				await this.ctx.storage.put("people", this.people);

				return Response.json({ 
					success: true, 
					person: newPerson,
					message: `Added new person: ${name} (ID: ${newId})`
				});
			}

			if (method === "GET" && url.pathname === "/stats") {
				return Response.json({ 
					totalPeople: this.people.length,
					lastUpdated: new Date().toISOString()
				});
			}

			return Response.json({ error: "Not found" }, { status: 404 });

		} catch (error) {
			return Response.json({ 
				error: "Internal server error", 
				details: error instanceof Error ? error.message : "Unknown error"
			}, { status: 500 });
		}
	}
}

// Define our MCP agent with tools
export class MyMCP extends McpAgent<Env, State, {}> {
	server = new McpServer({
		name: "People Database Server",
		version: "1.0.0",
	});

	// Initialize empty state
	initialState: State = {};

	// Helper to get shared database instance
	private getSharedDatabase() {
		const id = this.env.SHARED_PEOPLE_DB.idFromName("global-people-db");
		return this.env.SHARED_PEOPLE_DB.get(id);
	}

	async init() {
		// Counter resource - exposes current counter value
		this.server.resource(`counter`, `mcp://resource/counter`, (uri) => {
			return {
				contents: [{ uri: uri.href, text: String(this.state.counter) }],
			};
		});

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

		// Person lookup tool - now uses shared database
		this.server.tool(
			"lookup_person",
			{ name: z.string() },
			async ({ name }) => {
				try {
					const db = this.getSharedDatabase();
					const response = await db.fetch(`http://db/search?name=${encodeURIComponent(name)}`);
					const data = await response.json();

					if (!response.ok) {
						return {
							content: [
								{
									type: "text",
									text: `${data.error}. Available people: ${data.availablePeople?.join(", ") || "None"}`,
								},
							],
						};
					}

					const person = data.person;
					return {
						content: [
							{
								type: "text",
								text: `👤 **${person.name}** (Shared Database)
📧 Email: ${person.email}
🎂 Age: ${person.age}
⚧ Gender: ${person.gender}
💼 Job Title: ${person.jobTitle}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error accessing shared database: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			}
		);

		// Add person tool - now uses shared database
		this.server.tool(
			"add_person",
			{
				name: z.string(),
				age: z.number().min(1).max(120),
				gender: z.string(),
				jobTitle: z.string(),
				email: z.string().email(),
			},
			async ({ name, age, gender, jobTitle, email }) => {
				try {
					const db = this.getSharedDatabase();
					const response = await db.fetch("http://db/add", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ name, age, gender, jobTitle, email }),
					});

					const data = await response.json();

					if (!response.ok) {
						return {
							content: [
								{
									type: "text",
									text: `Error adding person: ${data.error}`,
								},
							],
						};
					}

					return {
						content: [
							{
								type: "text",
								text: `✅ ${data.message} (Shared Database)`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error accessing shared database: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			}
		);

		// List all people tool - now uses shared database
		this.server.tool(
			"list_people",
			{},
			async () => {
				try {
					const db = this.getSharedDatabase();
					const response = await db.fetch("http://db/list");
					const data = await response.json();

					if (!response.ok) {
						return {
							content: [
								{
									type: "text",
									text: `Error: ${data.error}`,
								},
							],
						};
					}

					if (data.people.length === 0) {
						return {
							content: [
								{
									type: "text",
									text: "No people in the shared database.",
								},
							],
						};
					}

					const peopleList = data.people
						.map((p: Person) => `${p.id}. ${p.name} (${p.age}, ${p.gender}) - ${p.jobTitle}`)
						.join("\n");

					return {
						content: [
							{
								type: "text",
								text: `👥 **Shared People Database (${data.people.length} people)**\n\n${peopleList}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error accessing shared database: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			}
		);

		// Database stats tool - shows shared database info
		this.server.tool(
			"database_stats",
			{},
			async () => {
				try {
					const db = this.getSharedDatabase();
					const response = await db.fetch("http://db/stats");
					const data = await response.json();

					if (!response.ok) {
						return {
							content: [
								{
									type: "text",
									text: `Error: ${data.error}`,
								},
							],
						};
					}

					return {
						content: [
							{
								type: "text",
								text: `📊 **Shared Database Statistics**
👥 Total People: ${data.totalPeople}
🕒 Last Updated: ${data.lastUpdated}
🌍 Global Access: All users see the same data`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error accessing shared database: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			}
		);

		// Counter tool - adds to the persistent counter (still per-session)
		this.server.tool(
			"count",
			{ a: z.number() },
			async ({ a }) => {
				this.setState({ 
					...this.state, 
					counter: this.state.counter + a 
				});
				return {
					content: [{ 
						type: "text", 
						text: `Added ${a}, total is now ${this.state.counter} (Personal Counter)` 
					}],
				};
			}
		);
	}

	// Handle state updates (now empty since no state)
	onStateUpdate(state: State) {
		console.log({ stateUpdate: state });
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