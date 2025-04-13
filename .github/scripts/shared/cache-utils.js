import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Get current file's directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the shared cache file
const CACHE_DIR = join(__dirname, "../../../.cache");
const SHARED_CACHE_FILE_PATH = join(CACHE_DIR, "shared-projects.json");

// Cache types
export const CACHE_TYPES = {
	NPM: "npm",
	VSCODE: "vscode",
};

// Load or initialize the shared cache
export function loadSharedCache() {
	// Ensure cache directory exists
	if (!existsSync(CACHE_DIR)) {
		mkdirSync(CACHE_DIR, { recursive: true });
	}

	if (existsSync(SHARED_CACHE_FILE_PATH)) {
		try {
			const cacheData = readFileSync(SHARED_CACHE_FILE_PATH, "utf8");
			return JSON.parse(cacheData);
		} catch (error) {
			console.error("Error reading shared cache file:", error.message);
			return { repositories: {} };
		}
	}

	return { repositories: {} };
}

// Save the shared cache
export function saveSharedCache(cacheData) {
	try {
		writeFileSync(SHARED_CACHE_FILE_PATH, JSON.stringify(cacheData, null, 2));
		console.log("Shared cache updated successfully");
	} catch (error) {
		console.error("Error saving shared cache:", error.message);
	}
}

// Add this new function to cache-utils.js
export function updateRepositoryCache(repoName, type, id) {
	const cache = loadSharedCache();

	// Create repositories object if it doesn't exist
	if (!cache.repositories) {
		cache.repositories = {};
	}

	// Only update if not already set or if we have a new ID
	if (
		!cache.repositories[repoName] ||
		cache.repositories[repoName].type !== type ||
		cache.repositories[repoName].id !== id
	) {
		// Preserve the existing object but update only relevant properties
		cache.repositories[repoName] = {
			...(cache.repositories[repoName] || {}),
			type,
			id,
		};

		// Update timestamp
		cache.lastUpdated = new Date().toISOString();

		// Save the updated cache
		saveSharedCache(cache);
		return true; // Indicate cache was updated
	}

	return false; // Indicate no change was needed
}
