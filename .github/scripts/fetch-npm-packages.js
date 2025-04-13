import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";
import {
	CACHE_TYPES,
	loadSharedCache,
	saveSharedCache,
} from "./shared/cache-utils.js";

// Get current file's directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const githubToken = process.env.GITHUB_TOKEN;

// Your NPM username
const NPM_USERNAME = "darkphoenix";
// Your GitHub username (for fetching repos)
const GITHUB_USERNAME = "0DarkPhoenix";

// Fallback package names in case all else fails
const FALLBACK_PACKAGES = ["relativedelta"];

async function fetchGitHubNpmPackages() {
	try {
		// Load the shared cache
		const cache = loadSharedCache();
		const repositoriesCache = cache.repositories || {};
		const cachedPackageNames = [];

		// Collect npm package names from cached data
		for (const [repoName, repoData] of Object.entries(repositoriesCache)) {
			if (repoData && repoData.type === CACHE_TYPES.NPM && repoData.id) {
				cachedPackageNames.push(repoData.id);
			}
		}

		console.log(`Found ${cachedPackageNames.length} NPM packages in cache`);

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
						Authorization: `token ${githubToken}`,
					},
				},
			);

			const repos = reposResponse.data;
			console.log(`Found ${repos.length} repositories on GitHub`);

			// Check each repo not already in cache
			for (const repo of repos) {
				// Skip if we already have this repo in our cache as an NPM package
				if (
					repositoriesCache[repo.name] &&
					repositoriesCache[repo.name].type === CACHE_TYPES.NPM
				) {
					console.log(
						`Using cached package name for ${repo.name}: ${repositoriesCache[repo.name].id}`,
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

					// First check if it has a name and is not private
					if (packageJson.name && !packageJson.private) {
						// Now check if .npmignore exists - required to be considered an npm package
						let hasNpmIgnore = false;
						try {
							await axios.get(
								`https://api.github.com/repos/${GITHUB_USERNAME}/${repo.name}/contents/.npmignore`,
							);
							hasNpmIgnore = true;
							console.log(`Found .npmignore file in repo ${repo.name}`);

							// Only add to the package map if it has BOTH valid package.json AND .npmignore
							console.log(
								`Found valid NPM package: ${packageJson.name} in repo ${repo.name} (with .npmignore)`,
							);
							// Add to cache
							repositoriesCache[repo.name] = {
								type: CACHE_TYPES.NPM,
								id: packageJson.name,
							};
							// Add to our list if not already there
							if (!cachedPackageNames.includes(packageJson.name)) {
								cachedPackageNames.push(packageJson.name);
							}
						} catch (npmIgnoreError) {
							// .npmignore doesn't exist, so it's not considered an npm package
							if (
								npmIgnoreError.response &&
								npmIgnoreError.response.status === 404
							) {
								console.log(
									`No .npmignore found in repo ${repo.name}, not considering it as an npm package`,
								);
								// Mark as not an NPM package in cache
								repositoriesCache[repo.name] = {
									type: CACHE_TYPES.NPM,
									id: null,
								};
							}
						}
					} else {
						// Mark as not an NPM package in cache
						repositoriesCache[repo.name] = {
							type: CACHE_TYPES.NPM,
							id: null,
						};
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
			cache.repositories = repositoriesCache;
			cache.lastUpdated = new Date().toISOString();
			saveSharedCache(cache);
		}

		// Filter out any null values and get just the package names
		const packageNames = Object.values(repositoriesCache)
			.filter((repo) => repo.type === CACHE_TYPES.NPM && repo.id !== null)
			.map((repo) => repo.id);

		console.log(`Found ${packageNames.length} NPM packages total`);
		return packageNames.length > 0 ? packageNames : FALLBACK_PACKAGES;
	} catch (error) {
		console.error("Error fetching GitHub repositories:", error.message);
		console.log("Falling back to cached package list or hardcoded list");

		// Try to read from cache again
		const cache = loadSharedCache();
		const cachedNames = Object.values(cache.repositories || {})
			.filter(
				(repo) => repo && repo.type === CACHE_TYPES.NPM && repo.id !== null,
			)
			.map((repo) => repo.id);

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
