import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";

// Get current file's directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get username from environment variable or use default
const MODRINTH_USERNAME = "dark_phoenix_";

async function fetchModrinthProjects() {
	try {
		console.log(`Fetching Modrinth projects for user: ${MODRINTH_USERNAME}`);

		// API endpoint to get user's projects
		const response = await axios.get(
			`https://api.modrinth.com/v2/user/${MODRINTH_USERNAME}/projects`,
		);
		const projects = response.data;

		console.log(`Found ${projects.length} projects`);

		// Calculate total downloads
		let totalDownloads = 0;

		for (const project of projects) {
			totalDownloads += project.downloads || 0;
		}

		console.log(`Total downloads: ${totalDownloads}`);

		// Ensure the shields directory exists
		const shieldsDir = join(__dirname, "../../shields");
		if (!existsSync(shieldsDir)) {
			mkdirSync(shieldsDir, { recursive: true });
		}

		// Read existing data or create new object
		let badgeData = {};
		const badgeFilePath = join(shieldsDir, "downloads.json");

		if (existsSync(badgeFilePath)) {
			const fileContent = readFileSync(badgeFilePath, "utf8");
			try {
				badgeData = JSON.parse(fileContent);
			} catch (e) {
				console.error("Error parsing existing badge data, creating new file");
			}
		}

		// Update with Modrinth data
		badgeData.modrinth = {
			projects: projects.length,
			downloads: totalDownloads,
		};

		// Write updated data
		writeFileSync(badgeFilePath, JSON.stringify(badgeData, null, 2));
		console.log("Badge data updated successfully");
	} catch (error) {
		console.error("Error fetching Modrinth projects:", error.message);
		if (error.response) {
			console.error("Response status:", error.response.status);
			console.error("Response data:", error.response.data);
		}
		process.exit(1);
	}
}

fetchModrinthProjects();
