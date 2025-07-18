import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

// Define state type with people database
type State = {
	people: Person[];
};

/**
 * People Database MCP Server - Per Session Version
 * Each session maintains its own database instance.
 */
export class MyMCP extends McpAgent<Env, State, {}> {
	server = new McpServer({
		name: "People Database Server",
		version: "1.0.0",
	});

	// Initialize state with default people
	initialState: State = {
		people: [
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
		],
	};

	async init() {
		// Test connection tool
		this.server.tool(
			"test_connection",
			"Test if the MCP server is working correctly. Use this to verify the connection.",
			{},
			async () => {
				return {
					content: [
						{
							type: "text",
							text: "✅ MCP Server is working! Per-session storage active. Available tools: lookup_person, add_person, update_person, delete_person, list_people, database_stats",
						},
					],
				};
			}
		);

		// Person lookup tool
		this.server.tool(
			"lookup_person",
			"Search for a person in the database by name. Supports partial matching to find people even if you don't know their full name.",
			{ name: z.string().describe("Name or partial name to search for") },
			async ({ name }) => {
				const searchTerm = name.toLowerCase();
				const person = this.state.people.find(p => 
					p.name.toLowerCase().includes(searchTerm)
				);

				if (!person) {
					return {
						content: [
							{
								type: "text",
								text: `❌ No person found with name containing "${name}". Available people: ${this.state.people.map(p => p.name).join(", ")}`,
							},
						],
					};
				}

				return {
					content: [
						{
							type: "text",
							text: `👤 **${person.name}** (ID: ${person.id})
📧 Email: ${person.email}
🎂 Age: ${person.age}
⚧ Gender: ${person.gender}
💼 Job Title: ${person.jobTitle}`,
						},
					],
				};
			}
		);

		// Add person tool
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
				// Check if person with same email already exists
				const existingPerson = this.state.people.find(p => 
					p.email.toLowerCase() === email.toLowerCase()
				);

				if (existingPerson) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Cannot add person: Email "${email}" already exists for ${existingPerson.name} (ID: ${existingPerson.id})`,
							},
						],
					};
				}

				// Generate new ID
				const newId = Math.max(...this.state.people.map(p => p.id), 0) + 1;
				
				// Create new person
				const newPerson: Person = {
					id: newId,
					name,
					age,
					gender,
					jobTitle,
					email,
				};

				// Add to state
				this.setState({
					...this.state,
					people: [...this.state.people, newPerson],
				});

				return {
					content: [
						{
							type: "text",
							text: `✅ Added new person: **${name}** (ID: ${newId})
📧 Email: ${email}
🎂 Age: ${age}
⚧ Gender: ${gender}
💼 Job Title: ${jobTitle}`,
						},
					],
				};
			}
		);

		// Update person tool
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
				// Find the person to update
				const personIndex = this.state.people.findIndex(p => p.id === id);
				
				if (personIndex === -1) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Person with ID ${id} not found. Available IDs: ${this.state.people.map(p => `${p.id} (${p.name})`).join(", ")}`,
							},
						],
					};
				}

				// Check if new email conflicts with existing person
				if (email) {
					const existingPerson = this.state.people.find(p => 
						p.email.toLowerCase() === email.toLowerCase() && p.id !== id
					);

					if (existingPerson) {
						return {
							content: [
								{
									type: "text",
									text: `❌ Cannot update: Email "${email}" already exists for ${existingPerson.name} (ID: ${existingPerson.id})`,
								},
							],
						};
					}
				}

				// Get current person data
				const currentPerson = this.state.people[personIndex];
				
				// Create updated person with only provided fields changed
				const updatedPerson: Person = {
					id: currentPerson.id,
					name: name ?? currentPerson.name,
					age: age ?? currentPerson.age,
					gender: gender ?? currentPerson.gender,
					jobTitle: jobTitle ?? currentPerson.jobTitle,
					email: email ?? currentPerson.email,
				};

				// Update state
				const updatedPeople = [...this.state.people];
				updatedPeople[personIndex] = updatedPerson;
				
				this.setState({
					...this.state,
					people: updatedPeople,
				});

				return {
					content: [
						{
							type: "text",
							text: `✅ Updated person ID ${id}: **${updatedPerson.name}** (ID: ${updatedPerson.id})
📧 Email: ${updatedPerson.email}
🎂 Age: ${updatedPerson.age}
⚧ Gender: ${updatedPerson.gender}
💼 Job Title: ${updatedPerson.jobTitle}`,
						},
					],
				};
			}
		);

		// Delete person tool
		this.server.tool(
			"delete_person",
			"Permanently remove a person from the database. This action cannot be undone. You need to provide the person's ID number.",
			{
				id: z.number().describe("The ID of the person to delete"),
			},
			async ({ id }) => {
				// Find the person to delete
				const personIndex = this.state.people.findIndex(p => p.id === id);
				
				if (personIndex === -1) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Person with ID ${id} not found. Available IDs: ${this.state.people.map(p => `${p.id} (${p.name})`).join(", ")}`,
							},
						],
					};
				}

				// Get person details before deletion
				const personToDelete = this.state.people[personIndex];
				
				// Remove from state
				const updatedPeople = this.state.people.filter(p => p.id !== id);
				
				this.setState({
					...this.state,
					people: updatedPeople,
				});

				return {
					content: [
						{
							type: "text",
							text: `✅ Deleted person: **${personToDelete.name}** (ID: ${id})
📧 Email: ${personToDelete.email}
👥 Remaining people: ${updatedPeople.length}`,
						},
					],
				};
			}
		);

		// List people tool
		this.server.tool(
			"list_people",
			"Display all people currently in the database. Shows a summary with ID, name, age, gender, and job title for each person.",
			{},
			async () => {
				if (this.state.people.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: "📭 No people in the database. Use add_person to add someone.",
							},
						],
					};
				}

				const peopleList = this.state.people
					.map(p => `${p.id}. **${p.name}** (${p.age}, ${p.gender}) - ${p.jobTitle}`)
					.join("\n");

				return {
					content: [
						{
							type: "text",
							text: `👥 **People Database (${this.state.people.length} people)**\n\n${peopleList}`,
						},
					],
				};
			}
		);

		// Database stats tool
		this.server.tool(
			"database_stats",
			"Show detailed statistics about the database including total count, age distribution, gender breakdown, and help information about available operations.",
			{},
			async () => {
				const ageGroups = {
					"18-25": this.state.people.filter(p => p.age >= 18 && p.age <= 25).length,
					"26-35": this.state.people.filter(p => p.age >= 26 && p.age <= 35).length,
					"36-45": this.state.people.filter(p => p.age >= 36 && p.age <= 45).length,
					"46+": this.state.people.filter(p => p.age >= 46).length,
				};

				const genderCount = this.state.people.reduce((acc, p) => {
					acc[p.gender] = (acc[p.gender] || 0) + 1;
					return acc;
				}, {} as Record<string, number>);

				return {
					content: [
						{
							type: "text",
							text: `📊 **Database Statistics**
👥 Total People: ${this.state.people.length}
🕒 Session Started: ${new Date().toISOString()}
📝 Storage: Per-session (each user has their own database)

**Age Distribution:**
${Object.entries(ageGroups).map(([range, count]) => `${range}: ${count} people`).join("\n")}

**Gender Distribution:**
${Object.entries(genderCount).map(([gender, count]) => `${gender}: ${count} people`).join("\n")}

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