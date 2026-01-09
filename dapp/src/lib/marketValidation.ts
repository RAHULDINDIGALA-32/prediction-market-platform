export interface MarketCreationInput {
  title: string;
  description: string;
  category: string;
  resolutionSource: string;
  resolutionRules: string[];
  endTime: number; // Unix timestamp
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const ALLOWED_CATEGORIES = ["crypto", "politics", "sports", "economics", "other"];

/**
 * Validate market creation input
 */
export function validateMarketCreation(input: MarketCreationInput): ValidationResult {
  const errors: string[] = [];

  // Title validation
  if (!input.title || input.title.trim().length === 0) {
    errors.push("Title is required");
  } else if (input.title.length > 200) {
    errors.push("Title must be 200 characters or less");
  }

  // Description validation
  if (!input.description || input.description.trim().length === 0) {
    errors.push("Description is required");
  } else if (input.description.length > 5000) {
    errors.push("Description must be 5000 characters or less");
  }

  // Category validation
  if (!input.category || !ALLOWED_CATEGORIES.includes(input.category)) {
    errors.push(`Category must be one of: ${ALLOWED_CATEGORIES.join(", ")}`);
  }

  // Resolution source validation
  if (!input.resolutionSource || input.resolutionSource.trim().length === 0) {
    errors.push("Resolution source is required");
  } else if (input.resolutionSource.length > 500) {
    errors.push("Resolution source must be 500 characters or less");
  }

  // Resolution rules validation
  if (!input.resolutionRules || input.resolutionRules.length === 0) {
    errors.push("At least one resolution rule is required");
  } else {
    input.resolutionRules.forEach((rule, index) => {
      if (!rule || rule.trim().length === 0) {
        errors.push(`Resolution rule ${index + 1} cannot be empty`);
      } else if (rule.length > 500) {
        errors.push(`Resolution rule ${index + 1} must be 500 characters or less`);
      }
    });
  }

  // End time validation
  const now = Math.floor(Date.now() / 1000);
  if (!input.endTime || input.endTime <= now) {
    errors.push("End time must be in the future");
  }

  // Max duration validation (365 days)
  const maxEndTime = now + 365 * 24 * 60 * 60;
  if (input.endTime > maxEndTime) {
    errors.push("Market duration cannot exceed 365 days");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

