/**
 * @description Initialize background services on app startup
 * 
 * Called from layout.tsx to ensure:
 * - Authorization sync service starts automatically
 * - Cache is populated on first startup
 * - Metrics tracking begins
 */

import { initializeAuthSync } from "./authorizationSyncService";

let isInitialized = false;

/**
 * Initialize all background services
 * Safe to call multiple times (uses guard)
 */
export async function initializeServices() {
  if (isInitialized) {
    return;
  }

  try {
    console.log("🔧 Initializing background services...");

    // Start authorization sync service
    await initializeAuthSync();

    isInitialized = true;
    console.log("✅ Background services initialized");
  } catch (error) {
    console.error("❌ Failed to initialize background services:", error);
    // Continue anyway - services are optional for basic operation
  }
}

/**
 * Check if services are initialized
 */
export function areServicesInitialized(): boolean {
  return isInitialized;
}
