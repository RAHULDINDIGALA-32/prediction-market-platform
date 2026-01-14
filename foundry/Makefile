// Makefile for common project tasks

.PHONY: forge-test forge-clean forge-build forge-deploy forge-coverage dapp-install dapp-dev prisma-migrate backfill-nonces integration-test

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
	@echo "Deploying to localhost..."
	forge script script/DeployPlatform.s.sol --broadcast --rpc-url http://localhost:8545 -vv

deploy-testnet:
	@echo "Deploying to testnet. Usage: make forge-deploy-testnet RPC_URL=<url> PRIVATE_KEY=<key>"
	@if [ -z "$(RPC_URL)" ]; then echo "Error: RPC_URL not set"; exit 1; fi
	@if [ -z "$(PRIVATE_KEY)" ]; then echo "Error: PRIVATE_KEY not set"; exit 1; fi
	forge script script/DeployPlatform.s.sol --broadcast --rpc-url $(RPC_URL) --private-key $(PRIVATE_KEY) -vv

deploy-mainnet:
	@echo "WARNING: Deploying to mainnet!"
	@echo "Usage: make forge-deploy-mainnet RPC_URL=<url> PRIVATE_KEY=<key>"
	@if [ -z "$(RPC_URL)" ]; then echo "Error: RPC_URL not set"; exit 1; fi
	@if [ -z "$(PRIVATE_KEY)" ]; then echo "Error: PRIVATE_KEY not set"; exit 1; fi
	forge script script/DeployPlatform.s.sol --broadcast --rpc-url $(RPC_URL) --private-key $(PRIVATE_KEY) -vv

dapp-install:
	cd dapp && npm ci

dapp-dev:
	cd dapp && npm run dev

prisma-migrate:
	cd dapp && npx prisma migrate dev --name add-trader-nonce

backfill-nonces:
	cd dapp && npm run backfill:nonces

integration-test:
	# Start dev server first then run this
	node dapp/scripts/integrationTest.js
