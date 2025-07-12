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

// Define state type (now empty since we use shared storage)
type State = {};

// Shared Durable Object for people database (minimal class name)
export class SharedPeopleDB extends DurableObject {
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

				// Check for existing email
				const existingPerson = this.people.find(p => 
					p.email.toLowerCase() === email.toLowerCase()
				);

				if (existingPerson) {
					return Response.json({ 
						error: `Email "${email}" already exists for ${existingPerson.name} (ID: ${existingPerson.id})`
					}, { status: 400 });
				}

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

			if (method === "PUT" && url.pathname === "/update") {
				const body = await request.json();
				const { id, name, age, gender, jobTitle, email } = body;

				const personIndex = this.people.findIndex(p => p.id === id);
				
				if (personIndex === -1) {
					return Response.json({ 
						error: `Person with ID ${id} not found`,
						availableIds: this.people.map(p => ({ id: p.id, name: p.name }))
					}, { status: 404 });
				}

				// Check email conflicts
				if (email) {
					const existingPerson = this.people.find(p => 
						p.email.toLowerCase() === email.toLowerCase() && p.id !== id
					);

					if (existingPerson) {
						return Response.json({ 
							error: `Email "${email}" already exists for ${existingPerson.name} (ID: ${existingPerson.id})`
						}, { status: 400 });
					}
				}

				// Update person
				const currentPerson = this.people[personIndex];
				const updatedPerson: Person = {
					id: currentPerson.id,
					name: name ?? currentPerson.name,
					age: age ?? currentPerson.age,
					gender: gender ?? currentPerson.gender,
					jobTitle: jobTitle ?? currentPerson.jobTitle,
					email: email ?? currentPerson.email,
				};

				this.people[personIndex] = updatedPerson;
				await this.ctx.storage.put("people", this.people);

				return Response.json({ 
					success: true, 
					person: updatedPerson,
					message: `Updated person ID ${id}`
				});
			}

			if (method === "DELETE" && url.pathname === "/delete") {
				const body = await request.json();
				const { id } = body;

				const personIndex = this.people.findIndex(p => p.id === id);
				
				if (personIndex === -1) {
					return Response.json({ 
						error: `Person with ID ${id} not found`,
						availableIds: this.people.map(p => ({ id: p.id, name: p.name }))
					}, { status: 404 });
				}

				const deletedPerson = this.people[personIndex];
				this.people = this.people.filter(p => p.id !== id);
				await this.ctx.storage.put("people", this.people);

				return Response.json({ 
					success: true, 
					deletedPerson,
					message: `Deleted person: ${deletedPerson.name} (ID: ${id})`
				});
			}

			if (method === "GET" && url.pathname === "/stats") {
				const ageGroups = {
					"18-25": this.people.filter(p => p.age >= 18 && p.age <= 25).length,
					"26-35": this.people.filter(p => p.age >= 26 && p.age <= 35).length,
					"36-45": this.people.filter(p => p.age >= 36 && p.age <= 45).length,
					"46+": this.people.filter(p => p.age >= 46).length,
				};

				const genderCount = this.people.reduce((acc, p) => {
					acc[p.gender] = (acc[p.gender] || 0) + 1;
					return acc;
				}, {} as Record<string, number>);

				return Response.json({ 
					totalPeople: this.people.length,
					ageGroups,
					genderCount,
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

/**
 * People Database MCP Server
 * 
 * Provides full CRUD operations for managing a people database.
 * Each user session has their own independent database instance.
 * 
 * Available operations:
 * - CREATE: Add new people to the database
 * - READ: Search and list people in the database
 * - UPDATE: Modify existing people's information
 * - DELETE: Remove people from the database
 */
export class MyMCP extends McpAgent<Env, State, {}> {
	server = new McpServer({
		name: "People Database Server",
		version: "1.0.0",
	});

	// Initialize empty state (using shared storage)
	initialState: State = {};

	// Helper to get shared database instance
	private getSharedDatabase() {
		const id = this.env.SHARED_PEOPLE_DB.idFromName("global-people-db");
		return this.env.SHARED_PEOPLE_DB.get(id);
	}

	async init() {
		// Add a simple test tool to verify the server is working
		this.server.tool(
			"test_connection",
			"Test if the MCP server is working correctly. Use this to verify the connection.",
			{},
			async () => {
				return {
					content: [
						{
							type: "text",
							text: "✅ MCP Server with Shared Database is working! Available tools: lookup_person, add_person, update_person, delete_person, list_people, database_stats",
						},
					],
				};
			}
		);

		/**
		 * SEARCH/READ: Find a person by name (partial match)
		 */
		this.server.tool(
			"lookup_person",
			"Search for a person in the database by name. Supports partial matching to find people even if you don't know their full name.",
			{ name: z.string().describe("Name or partial name to search for") },
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
									text: `❌ ${data.error}. Available people: ${data.availablePeople?.join(", ") || "None"}`,
								},
							],
						};
					}

					const person = data.person;
					return {
						content: [
							{
								type: "text",
								text: `👤 **${person.name}** (ID: ${person.id}) [Shared DB]
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
								text: `❌ Error accessing shared database: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			}
		);

		/**
		 * CREATE: Add a new person to the database
		 */
		this.server.tool(
			"add_person",
			"Add a new person to the database. Requires name, age, gender, job title, and email. Email must be unique.",
			{
				name: z.string().describe("Full name of the person"),
				age: z.number().min(1).max(120).describe("Age between 1 and 120"),
				gender: z.string().describe("Gender identity"),
				jobTitle: z.string().describe("Job title or profession"),
				email: z.string().email().describe("Valid email address"),
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
									text: `❌ ${data.error}`,
								},
							],
						};
					}

					return {
						content: [
							{
								type: "text",
								text: `✅ ${data.message} [Shared DB]
📧 Email: ${email}
🎂 Age: ${age}
⚧ Gender: ${gender}
💼 Job Title: ${jobTitle}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Error accessing shared database: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			}
		);

		/**
		 * UPDATE: Modify an existing person's information
		 */
		this.server.tool(
			"update_person",
			"Update an existing person's information. You can change any field (name, age, gender, job title, email) by providing the person's ID and the new values.",
			{
				id: z.number().describe("The ID of the person to update"),
				name: z.string().optional().describe("New name (optional)"),
				age: z.number().min(1).max(120).optional().describe("New age between 1 and 120 (optional)"),
				gender: z.string().optional().describe("New gender (optional)"),
				jobTitle: z.string().optional().describe("New job title (optional)"),
				email: z.string().email().optional().describe("New email address (optional)"),
			},
			async ({ id, name, age, gender, jobTitle, email }) => {
				try {
					const db = this.getSharedDatabase();
					const response = await db.fetch("http://db/update", {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ id, name, age, gender, jobTitle, email }),
					});

					const data = await response.json();

					if (!response.ok) {
						return {
							content: [
								{
									type: "text",
									text: `❌ ${data.error}`,
								},
							],
						};
					}

					const person = data.person;
					return {
						content: [
							{
								type: "text",
								text: `✅ ${data.message} [Shared DB]
👤 **${person.name}** (ID: ${person.id})
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
								text: `❌ Error accessing shared database: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			}
		);

		/**
		 * DELETE: Remove a person from the database
		 */
		this.server.tool(
			"delete_person",
			"Permanently remove a person from the database. This action cannot be undone. You need to provide the person's ID number.",
			{
				id: z.number().describe("The ID of the person to delete"),
			},
			async ({ id }) => {
				try {
					const db = this.getSharedDatabase();
					const response = await db.fetch("http://db/delete", {
						method: "DELETE",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ id }),
					});

					const data = await response.json();

					if (!response.ok) {
						return {
							content: [
								{
									type: "text",
									text: `❌ ${data.error}`,
								},
							],
						};
					}

					const deletedPerson = data.deletedPerson;
					return {
						content: [
							{
								type: "text",
								text: `✅ ${data.message} [Shared DB]
📧 Email: ${deletedPerson.email}
👥 Remaining people: ${this.people?.length || 'Unknown'}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Error accessing shared database: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			}
		);

		/**
		 * LIST: Display all people in the database
		 */
		this.server.tool(
			"list_people",
			"Display all people currently in the database. Shows a summary with ID, name, age, gender, and job title for each person.",
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
									text: `❌ ${data.error}`,
								},
							],
						};
					}

					if (data.people.length === 0) {
						return {
							content: [
								{
									type: "text",
									text: "📭 No people in the shared database.",
								},
							],
						};
					}

					const peopleList = data.people
						.map((p: Person) => `${p.id}. **${p.name}** (${p.age}, ${p.gender}) - ${p.jobTitle}`)
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
								text: `❌ Error accessing shared database: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			}
		);

		/**
		 * STATS: Show database statistics and information
		 */
		this.server.tool(
			"database_stats",
			"Show detailed statistics about the database including total count, age distribution, gender breakdown, and help information about available operations.",
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
									text: `❌ ${data.error}`,
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
🌍 **SHARED DATABASE**: All users see the same data

**Age Distribution:**
${Object.entries(data.ageGroups).map(([range, count]) => `${range}: ${count} people`).join("\n")}

**Gender Distribution:**
${Object.entries(data.genderCount).map(([gender, count]) => `${gender}: ${count} people`).join("\n")}

**Available Operations:**
🔍 lookup_person - Search by name
➕ add_person - Add new person  
✏️ update_person - Modify existing person
🗑️ delete_person - Remove person
📋 list_people - Show all people
📊 database_stats - Show this information`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Error accessing shared database: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			}
		);
	}

	// Handle state updates
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