
-include .env

.PHONY: all build test fclean deploy-local deploy-sepolia verify-contracts

all: build test

test:
	forge test -v

test-verbose:
	forge test -vvv

build:
	forge build

fclean:
	forge clean

coverage:
	forge coverage --report lcov

deploy-local:
	@echo "Deploying to localhost."
	forge script script/DeployPlatform.s.sol \
	--rpc-url http://localhost:8545 -vv \
	--broadcast

deploy-sepolia:
	@echo "Deploying to Sepolia testnet..."
	forge script script/DeployPlatform.s.sol \
	--rpc-url $(SEPOLIA_RPC_URL) \
	--account defaultAcc \
	--broadcast \
	--etherscan-api-key $(ETHERSCAN_API_KEY) \
	--verify

verify-contracts:
	@echo "verifying Contracts..."
	forge verify-contract $(MARKET_FACTORY_ADDRESS) src/MarketFactory.sol:MarketFactory --etherscan-api-key $(ETHERSCAN_API_KEY) \
	--rpc-url $(SEPOLIA_RPC_URL) --show-standard-json-input > marketFactory.json 
	forge verify-contract $(ORACLE_ADDRESS) src/OracleAdapter.sol:OracleAdapter --etherscan-api-key $(ETHERSCAN_API_KEY) \
	--rpc-url $(SEPOLIA_RPC_URL) --show-standard-json-input > oracle.json
	forge verify-contract $(ORACLE_BUDGET_ADDRESS) src/OracleBudget.sol:OracleBudget --etherscan-api-key $(ETHERSCAN_API_KEY) \
	--rpc-url $(SEPOLIA_RPC_URL) --show-standard-json-input > oracleBudget.json
	forge verify-contract $(SETTLEMENT_ENGINE_ADDRESS) src/SettlementEngine.sol:SettlementEngine --etherscan-api-key \
	$(ETHERSCAN_API_KEY) --rpc-url $(SEPOLIA_RPC_URL) --show-standard-json-input > settlementEngine.json
	forge verify-contract $(VAULT_ADDRESS) src/Vault.sol:Vault --etherscan-api-key $(ETHERSCAN_API_KEY) \
	--rpc-url $(SEPOLIA_RPC_URL) --show-standard-json-input > vault.json
	forge verify-contract $(PLATFORM_TREASURY_ADDRESS) src/PlatformTreasury.sol:PlatformTreasury --etherscan-api-key \
	$(ETHERSCAN_API_KEY) --rpc-url $(SEPOLIA_RPC_URL) --show-standard-json-input > platformTreasury.json
	forge verify-contract $(QUOTE_VERIFIER_ADDRESS) src/QuoteVerifier.sol:QuoteVerifier --etherscan-api-key $(ETHERSCAN_API_KEY) \
	--rpc-url $(SEPOLIA_RPC_URL) --show-standard-json-input > quoteVerifier.json
	  

