/**
 * @description Initialize services on app startup
 * 
 * NOTE: For serverless deployment(like Vercel), background services with setInterval won't work.
 * Instead, use Vercel Cron Functions to trigger sync via API endpoint:
 * 
 */

import { triggerAuthorizationSync } from "./authorizationSyncService";

let isInitialized = false;

/**
 * Initialize all services
 * Safe to call multiple times (uses guard)
 */
export async function initializeServices() {
  if (isInitialized) {
    return;
  }

  try {
    console.log("🔧 Initializing services...");

    // For local development, perform initial sync
    if (process.env.NODE_ENV === "development") {
      console.log("ℹ️  Local dev mode: Triggering initial authorization sync...");
      await triggerAuthorizationSync();
    }

    isInitialized = true;
    console.log("✅ Services initialized");
  } catch (error) {
    console.error("❌ Failed to initialize services:", error);
    // Continue anyway - services are optional for basic operation
  }
}

/**
 * Check if services are initialized
 */
export function areServicesInitialized(): boolean {
  return isInitialized;
}
