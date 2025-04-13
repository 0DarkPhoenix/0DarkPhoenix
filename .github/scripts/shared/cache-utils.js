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
