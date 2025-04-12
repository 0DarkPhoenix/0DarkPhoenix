import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";

// Get current file's directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Your NPM username
const NPM_USERNAME = "darkphoenix";
// Your GitHub username (for fetching repos)
const GITHUB_USERNAME = "0DarkPhoenix";

// Path to the cache file
const CACHE_DIR = join(__dirname, "../../.cache");
const CACHE_FILE_PATH = join(CACHE_DIR, "npm-packages.json");

// Fallback package names in case all else fails
const FALLBACK_PACKAGES = ["relativedelta"];

// Load or initialize the package cache
function loadPackageCache() {
	// Ensure cache directory exists
	if (!existsSync(CACHE_DIR)) {
		mkdirSync(CACHE_DIR, { recursive: true });
	}

	if (existsSync(CACHE_FILE_PATH)) {
		try {
			const cacheData = readFileSync(CACHE_FILE_PATH, "utf8");
			return JSON.parse(cacheData);
		} catch (error) {
			console.error("Error reading package cache file:", error.message);
			return { repositories: {} };
		}
	}

	return { repositories: {} };
}

// Save the package cache
function savePackageCache(cacheData) {
	try {
		writeFileSync(CACHE_FILE_PATH, JSON.stringify(cacheData, null, 2));
		console.log("Package cache updated successfully");
	} catch (error) {
		console.error("Error saving package cache:", error.message);
	}
}

async function fetchGitHubNpmPackages() {
	try {
		// Load the existing cache
		const cache = loadPackageCache();
		const packageMap = cache.repositories || {};
		const cachedPackageNames = [];

		// Collect package names from cached data
		for (const [repoName, packageName] of Object.entries(packageMap)) {
			if (packageName) {
				cachedPackageNames.push(packageName);
			}
		}

		console.log(`Found ${cachedPackageNames.length} packages in cache`);

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
				if (packageMap[repo.name]) {
					console.log(
						`Using cached package name for ${repo.name}: ${packageMap[repo.name]}`,
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

					// Check if it's an NPM package (has name and not marked as private)
					if (packageJson.name && !packageJson.private) {
						console.log(
							`Found new NPM package: ${packageJson.name} in repo ${repo.name}`,
						);
						// Add to cache
						packageMap[repo.name] = packageJson.name;
						// Add to our list if not already there
						if (!cachedPackageNames.includes(packageJson.name)) {
							cachedPackageNames.push(packageJson.name);
						}
					} else {
						// Mark as not an NPM package in cache
						packageMap[repo.name] = null;
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
			cache.repositories = packageMap;
			cache.lastUpdated = new Date().toISOString();
			savePackageCache(cache);
		}

		// Filter out any null values and get just the package names
		const packageNames = Object.values(packageMap).filter(
			(name) => name !== null,
		);

		console.log(`Found ${packageNames.length} NPM packages total`);
		return packageNames.length > 0 ? packageNames : FALLBACK_PACKAGES;
	} catch (error) {
		console.error("Error fetching GitHub repositories:", error.message);
		console.log("Falling back to cached package list or hardcoded list");

		// Try to read from cache again
		const cache = loadPackageCache();
		const cachedNames = Object.values(cache.repositories || {}).filter(
			(name) => name !== null,
		);

		return cachedNames.length > 0 ? cachedNames : FALLBACK_PACKAGES;
	}
}

async function fetchNpmRegistryPackages(packageNames) {
	try {
		console.log(
			`Fetching additional packages from npm registry for user: ${NPM_USERNAME}`,
		);

		const response = await axios.get(
			`https://registry.npmjs.org/-/v1/search?text=maintainer:${NPM_USERNAME}&size=250`,
		);

		const npmPackages = response.data.objects.map((obj) => obj.package.name);
		console.log(
			`Found ${npmPackages.length} packages from npm registry search`,
		);

		// Combine with packages found from GitHub
		const combinedPackages = new Set([...packageNames, ...npmPackages]);
		console.log(`Combined total: ${combinedPackages.size} unique packages`);

		return Array.from(combinedPackages);
	} catch (error) {
		console.error("Error fetching packages from npm registry:", error.message);
		return packageNames; // Return original list if npm registry fetch fails
	}
}

async function fetchNpmPackageDownloads(packageNames) {
	try {
		// Create an array of promises for all package download requests
		const fetchPromises = packageNames.map(async (packageName) => {
			try {
				console.log(`Fetching download stats for package: ${packageName}`);

				// Fetch all time downloads
				const allTimeResponse = await axios.get(
					`https://api.npmjs.org/downloads/point/1000-01-01:2100-01-01/${packageName}`,
				);

				return {
					packageName,
					allTimeDownloads: allTimeResponse.data.downloads || 0,
				};
			} catch (error) {
				console.error(
					`Error fetching stats for ${packageName}:`,
					error.message,
				);
				return {
					packageName,
					allTimeDownloads: 0,
				};
			}
		});

		// Execute all requests concurrently
		const results = await Promise.all(fetchPromises);

		// Process results
		let totalDownloads = 0;
		const packagesWithData = [];

		for (const result of results) {
			if (result.allTimeDownloads > 0) {
				totalDownloads += result.allTimeDownloads;
				packagesWithData.push(result.packageName);
				console.log(
					`${result.packageName}: ${result.allTimeDownloads} downloads (all time)`,
				);
			}
		}
		return {
			packages: packagesWithData.length,
			downloads: totalDownloads,
		};
	} catch (error) {
		console.error("Error fetching npm package downloads:", error.message);
		return {
			packages: 0,
			downloads: 0,
		};
	}
}

async function fetchNpmPackages() {
	try {
		// Get package names dynamically from GitHub and/or cache
		let packageNames = await fetchGitHubNpmPackages();

		// Also check the npm registry for packages by the user
		packageNames = await fetchNpmRegistryPackages(packageNames);

		// If we have packages, fetch their download stats
		if (packageNames.length > 0) {
			const stats = await fetchNpmPackageDownloads(packageNames);

			console.log(`Total npm packages with data: ${stats.packages}`);
			console.log(`Total all-time downloads: ${stats.downloads}`);

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

			// Update with npm package data
			badgeData.npm = {
				packages: stats.packages,
				downloads: stats.downloads,
			};

			// Write updated data
			writeFileSync(badgeFilePath, JSON.stringify(badgeData, null, 2));
			console.log("Badge data updated successfully");
		} else {
			console.log("No npm packages found");
		}
	} catch (error) {
		console.error("Error in fetchNpmPackages:", error.message);
		process.exit(1);
	}
}

fetchNpmPackages();
