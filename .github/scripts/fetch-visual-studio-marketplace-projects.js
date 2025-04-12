import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";

// Get current file's directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Your VS Marketplace publisher name
const VS_MARKETPLACE_PUBLISHER = "DarkPhoenix";

const EXTENSION_ID_ARRAY = [
	"dark-modern-darker",
	"quick-fix-helper",
	"codebee-tools",
	"debian-changelog-item-creator",
	"f-string-converter-plus",
	"i18n-tools-international",
	"select-pasted-text",
	"split-mui-imports",
	"template-string-formatter-plus",
];

async function fetchVSMarketplaceExtensions() {
	try {
		console.log(
			`Fetching VS Marketplace extensions for publisher: ${VS_MARKETPLACE_PUBLISHER}`,
		);

		// VS Marketplace API endpoint for querying extensions
		const url =
			"https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery/";

		const options = {
			headers: {
				Accept: "application/json;api-version=3.0-preview.1",
				"Content-Type": "application/json",
			},
		};

		// Create an array of promises for all extension requests
		const fetchPromises = EXTENSION_ID_ARRAY.map((extensionId) => {
			console.log(`Preparing request for extension: ${extensionId}`);

			const body = {
				filters: [
					{
						pageNumber: 1,
						pageSize: 100,
						criteria: [
							{
								filterType: 7,
								value: `${VS_MARKETPLACE_PUBLISHER}.${extensionId}`,
							},
						],
					},
				],
				flags: 402,
			};

			return axios.post(url, body, options);
		});

		// Execute all requests concurrently
		const responses = await Promise.all(fetchPromises);

		// Initialize counters
		let totalInstalls = 0;
		let totalDownloads = 0;
		const allExtensions = [];

		// Process all responses
		responses.forEach((response, index) => {
			const extensionId = EXTENSION_ID_ARRAY[index];

			// Check if we have any results
			if (!response.data.results || !response.data.results[0]) {
				console.log(`No results found for extension: ${extensionId}`);
				return;
			}

			const extensions = response.data.results[0].extensions || [];

			if (extensions.length > 0) {
				// Add to our collection
				allExtensions.push(...extensions);

				// Process statistics for this extension
				for (const extension of extensions) {
					const statistics = extension.statistics || [];

					const installStat = statistics.find(
						(stat) => stat.statisticName === "install",
					);
					const updateStat = statistics.find(
						(stat) => stat.statisticName === "updateCount",
					);

					const installs = installStat ? installStat.value : 0;
					const updates = updateStat ? updateStat.value : 0;

					totalInstalls += installs;
					totalDownloads += installs + updates;

					console.log(
						`${extension.displayName}: ${installs} installs, ${installs + updates} downloads`,
					);
				}
			} else {
				console.log(`Extension not found: ${extensionId}`);
			}
		});

		console.log(`Total extensions found: ${allExtensions.length}`);
		console.log(`Total installs: ${totalInstalls}`);
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

		// Update with VS Marketplace data
		badgeData.vsmarketplace = {
			extensions: allExtensions.length,
			installs: totalInstalls,
			downloads: totalDownloads,
		};

		// Write updated data
		writeFileSync(badgeFilePath, JSON.stringify(badgeData, null, 2));
		console.log("Badge data updated successfully");
	} catch (error) {
		console.error("Error fetching VS Marketplace extensions:", error.message);
		if (error.response) {
			console.error("Response status:", error.response.status);
			console.error(
				"Response data:",
				JSON.stringify(error.response.data, null, 2),
			);
		}
		process.exit(1);
	}
}

fetchVSMarketplaceExtensions();
