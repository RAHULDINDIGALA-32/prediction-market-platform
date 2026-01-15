
-include .env

JSON_DIR := json-contracts

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

# Contract Deployment Commands
deploy-local:
	@echo "Deploying to localhost."
	forge script script/DeployPlatform.s.sol \
	--rpc-url http://localhost:8545 -vv \
	--broadcast

deploy-sepolia:
	@echo "Deploying to Sepolia testnet..."
	forge script script/DeployPlatform.s.sol \
	--rpc-url $(SEPOLIA_RPC_URL) \
	--private-key $(PRIVATE_KEY) \
	--broadcast \
	--etherscan-api-key $(ETHERSCAN_API_KEY) \
	--verify

resume-deploy-sepolia:
	@echo "Deploying to Sepolia testnet..."
	forge script script/DeployPlatform.s.sol \
	--rpc-url $(SEPOLIA_RPC_URL) \
	--private-key $(PRIVATE_KEY) \
	--broadcast \
	--resume


# Contract Verification Commands
verify-vault:
	VAULT_ARGS=$$(cast abi-encode \
		"constructor(address,address)" \
		$(SETTLEMENT_ENGINE_ADDRESS) \
		$(MARKET_FACTORY_ADDRESS) \
	) && \
	forge verify-contract \
		$(VAULT_ADDRESS) \
		src/Vault.sol:Vault \
		--chain sepolia \
		--constructor-args $$VAULT_ARGS \
		--etherscan-api-key $(ETHERSCAN_API_KEY)

verify-platform-treasury:
	TREASURY_ARGS=$$(cast abi-encode \
		"constructor(address)" \
		$(OWNER_ADDRESS) \
	) && \
	forge verify-contract \
		$(PLATFORM_TREASURY_ADDRESS) \
		src/PlatformTreasury.sol:PlatformTreasury \
		--chain sepolia \
		--constructor-args $$TREASURY_ARGS \
		--etherscan-api-key $(ETHERSCAN_API_KEY) 


verify-oracle-budget:
	ORACLE_BUDGET_ARGS=$$(cast abi-encode \
		"constructor(address,address)" \
		$(ORACLE_ADDRESS) \
		$(OWNER_ADDRESS) \
	) && \
	forge verify-contract \
		$(ORACLE_BUDGET_ADDRESS) \
		src/OracleBudget.sol:OracleBudget \
		--chain sepolia \
		--constructor-args $$ORACLE_BUDGET_ARGS \
		--etherscan-api-key $(ETHERSCAN_API_KEY)

verify-quote-verifier:
	QUOTE_VERIFIER_ARGS=$$(cast abi-encode \
		"constructor(address)" \
		$(OWNER_ADDRESS) \
	) && \
	forge verify-contract \
		$(QUOTE_VERIFIER_ADDRESS) \
		src/QuoteVerifier.sol:QuoteVerifier \
		--chain sepolia \
		--constructor-args $$QUOTE_VERIFIER_ARGS \
		--etherscan-api-key $(ETHERSCAN_API_KEY) 

verify-oracle-adapter:
	ORACLE_ADAPTER_ARGS=$$(cast abi-encode \
		"constructor(uint256,uint256,uint256,uint256,address,address,address,address)" \
		$(PROPOSER_BOND) \
		$(DISPUTE_WINDOW) \
		$(DISPUTER_BOND) \
		$(RESOLUTION_DEADLINE) \
		$(SETTLEMENT_ENGINE_ADDRESS) \
		$(ORACLE_BUDGET_ADDRESS) \
		$(PLATFORM_TREASURY_ADDRESS) \
		$(OWNER_ADDRESS) \
	) && \
	forge verify-contract \
		$(ORACLE_ADDRESS) \
		src/OracleAdapter.sol:OracleAdapter \
		--chain sepolia \
		--constructor-args $$ORACLE_ADAPTER_ARGS \
		--etherscan-api-key $(ETHERSCAN_API_KEY)

verify-settlement-engine:
	SETTLEMENT_ENGINE_ARGS=$$(cast abi-encode \
		"constructor(address,address,address)" \
		$(ORACLE_ADDRESS) \
		$(VAULT_ADDRESS) \
		$(MARKET_FACTORY_ADDRESS) \
	) && \
	forge verify-contract \
		$(SETTLEMENT_ENGINE_ADDRESS) \
		src/SettlementEngine.sol:SettlementEngine \
		--chain sepolia \
		--constructor-args $$SETTLEMENT_ENGINE_ARGS \
		--etherscan-api-key $(ETHERSCAN_API_KEY)

verify-factory-contract:
	FACTORY_ARGS=$$(cast abi-encode \
		"constructor(address,address,address,address,address,address,address)" \
		$(VAULT_ADDRESS) \
		$(ORACLE_ADDRESS) \
		$(ORACLE_BUDGET_ADDRESS) \
		$(PLATFORM_TREASURY_ADDRESS) \
		$(QUOTE_VERIFIER_ADDRESS) \
		$(SETTLEMENT_ENGINE_ADDRESS) \
		$(OWNER_ADDRESS) \
	) && \
	forge verify-contract \
		$(MARKET_FACTORY_ADDRESS) \
		src/MarketFactory.sol:MarketFactory \
		--chain sepolia \
		--constructor-args $$FACTORY_ARGS \
		--etherscan-api-key $(ETHERSCAN_API_KEY)

# verify-factory-contract:
# 	FACTORY_ARGS=$$(cast abi-encode \
# 		"constructor(address,address,address,address,address,address,address)" \
# 		$(VAULT_ADDRESS) \
# 		$(ORACLE_ADDRESS) \
# 		$(ORACLE_BUDGET_ADDRESS) \
# 		$(PLATFORM_TREASURY_ADDRESS) \
# 		$(QUOTE_VERIFIER_ADDRESS) \
# 		$(SETTLEMENT_ENGINE_ADDRESS) \
# 		$(OWNER_ADDRESS) \
# 	) && \
# 	forge verify-contract \
# 		$(MARKET_FACTORY_ADDRESS) \
# 		src/MarketFactory.sol:MarketFactory \
# 		--chain sepolia \
# 		--constructor-args $$FACTORY_ARGS \
# 		--etherscan-api-key $(ETHERSCAN_API_KEY) \
# 		--show-standard-json-input \
# 		> $(JSON_DIR)/marketFactory.json

verify-all-contracts: verify-vault verify-platform-treasury verify-oracle-budget verify-quote-verifier verify-oracle-adapter verify-settlement-engine verify-factory-contract
	@echo "All contracts verified!"

