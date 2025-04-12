import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";

// Get current file's directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Your VS Marketplace publisher name
const VS_MARKETPLACE_PUBLISHER = "DarkPhoenix";
// Your GitHub username
const GITHUB_USERNAME = "0DarkPhoenix";

// Path to the cache file
const CACHE_DIR = join(__dirname, "../../.cache");
const CACHE_FILE_PATH = join(CACHE_DIR, "vscode-extensions.json");

// Fallback extension IDs in case all else fails
const FALLBACK_EXTENSION_ID_ARRAY = [
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

// Load or initialize the extension cache
function loadExtensionCache() {
	// Ensure cache directory exists
	if (!existsSync(CACHE_DIR)) {
		mkdirSync(CACHE_DIR, { recursive: true });
	}

	if (existsSync(CACHE_FILE_PATH)) {
		try {
			const cacheData = readFileSync(CACHE_FILE_PATH, "utf8");
			return JSON.parse(cacheData);
		} catch (error) {
			console.error("Error reading extension cache file:", error.message);
			return { repositories: {} };
		}
	}

	return { repositories: {} };
}

// Save the extension cache
function saveExtensionCache(cacheData) {
	try {
		writeFileSync(CACHE_FILE_PATH, JSON.stringify(cacheData, null, 2));
		console.log("Extension cache updated successfully");
	} catch (error) {
		console.error("Error saving extension cache:", error.message);
	}
}

async function fetchGitHubVSCodeExtensions() {
	try {
		// Load the existing cache
		const cache = loadExtensionCache();
		const extensionMap = cache.repositories || {};
		const cachedExtensionIds = [];

		// Collect extension IDs from cached data
		for (const [repoName, extensionId] of Object.entries(extensionMap)) {
			if (extensionId) {
				cachedExtensionIds.push(extensionId);
			}
		}

		console.log(`Found ${cachedExtensionIds.length} extensions in cache`);

		// Check if we should fetch from GitHub
		const shouldCheckGitHub = true; // You can add logic here to decide (e.g., based on time)

		if (shouldCheckGitHub) {
			console.log(
				`Fetching repositories from GitHub for user: ${GITHUB_USERNAME}`,
			);

			// Fetch all repositories
			const reposResponse = await axios.get(
				`https://api.github.com/users/${GITHUB_USERNAME}/repos`,
				{
					headers: {
						Accept: "application/vnd.github.v3+json",
						// Add GitHub token if needed
						// 'Authorization': 'token YOUR_GITHUB_TOKEN'
					},
				},
			);

			const repos = reposResponse.data;
			console.log(`Found ${repos.length} repositories on GitHub`);

			// Check each repo not already in cache
			for (const repo of repos) {
				// Skip if we already have this repo in our cache
				if (extensionMap[repo.name]) {
					console.log(
						`Using cached extension ID for ${repo.name}: ${extensionMap[repo.name]}`,
					);
					continue;
				}

				try {
					// Check if repo contains package.json
					const packageJsonResponse = await axios.get(
						`https://api.github.com/repos/${GITHUB_USERNAME}/${repo.name}/contents/package.json`,
					);

					// Decode content from base64
					const content = Buffer.from(
						packageJsonResponse.data.content,
						"base64",
					).toString();
					const packageJson = JSON.parse(content);

					// Check if it's a VS Code extension
					if (
						packageJson.engines?.vscode ||
						packageJson.contributes ||
						packageJson.categories?.some(
							(cat) => cat.includes("Extension") || cat.includes("VSCode"),
						)
					) {
						// Extract extension ID from name field
						if (packageJson.name) {
							console.log(
								`Found new VS Code extension: ${packageJson.name} in repo ${repo.name}`,
							);
							// Add to cache
							extensionMap[repo.name] = packageJson.name;
							// Add to our list if not already there
							if (!cachedExtensionIds.includes(packageJson.name)) {
								cachedExtensionIds.push(packageJson.name);
							}
						}
					} else {
						// Mark as not a VS Code extension in cache
						extensionMap[repo.name] = null;
					}
				} catch (error) {
					// Check the HTTP status code from the error response
					if (error.response) {
						const statusCode = error.response.status;
						// Handle different status codes
						if (statusCode === 404) {
							console.log(`Skipping ${repo.name}: No package.json found (404)`);
						} else {
							console.log(`Skipping ${repo.name}: HTTP error ${statusCode}`);
						}
					} else if (error.request) {
						// Request was made but no response received
						console.log(
							`Skipping ${repo.name}: No response received from server`,
						);
					} else {
						// Error in setting up the request
						console.log(`Skipping ${repo.name}: ${error.message}`);
					}
				}
			}

			// Update the cache
			cache.repositories = extensionMap;
			cache.lastUpdated = new Date().toISOString();
			saveExtensionCache(cache);
		}

		// Filter out any null values and get just the extension IDs
		const extensionIds = Object.values(extensionMap).filter(
			(id) => id !== null,
		);

		console.log(`Found ${extensionIds.length} VS Code extension IDs total`);
		return extensionIds.length > 0 ? extensionIds : FALLBACK_EXTENSION_ID_ARRAY;
	} catch (error) {
		console.error("Error fetching GitHub repositories:", error.message);
		console.log("Falling back to cached extension list or hardcoded list");

		// Try to read from cache again
		const cache = loadExtensionCache();
		const cachedIds = Object.values(cache.repositories || {}).filter(
			(id) => id !== null,
		);

		return cachedIds.length > 0 ? cachedIds : FALLBACK_EXTENSION_ID_ARRAY;
	}
}

async function fetchVSMarketplaceExtensions() {
	try {
		// Get extension IDs dynamically from GitHub and/or cache
		const EXTENSION_ID_ARRAY = await fetchGitHubVSCodeExtensions();

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
