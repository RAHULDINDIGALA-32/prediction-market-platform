export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unknown error occurred";
}

export function parseContractError(error: unknown): string {
  const message = getErrorMessage(error);
  
  // Common contract error patterns
  if (message.includes("Market__MarketNotOpen")) {
    return "Market is not open for trading";
  }
  if (message.includes("Market__MarketExpired")) {
    return "Market has expired";
  }
  if (message.includes("Market__QuoteAlreadyUsed")) {
    return "Quote has already been used. Please request a new quote.";
  }
  if (message.includes("Market__SlippageExceeded")) {
    return "Slippage exceeded. Price moved too much. Please try again.";
  }
  if (message.includes("Market__InvalidETHAmount")) {
    return "Invalid ETH amount sent";
  }
  if (message.includes("insufficient funds")) {
    return "Insufficient balance";
  }
  if (message.includes("user rejected")) {
    return "Transaction rejected";
  }
  if (message.includes("Quote expired")) {
    return "Quote has expired. Please request a new quote.";
  }
  
  return message;
}


