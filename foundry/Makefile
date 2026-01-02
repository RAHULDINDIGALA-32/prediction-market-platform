// Makefile for common project tasks

.PHONY: forge-test forge-clean dapp-install dapp-dev prisma-migrate backfill-nonces integration-test

forge-test:
	cd foundry && forge test -v

forge-clean:
	cd foundry && forge clean

forge-coverage:
	forge coverage

forge-deploy:
	# Example: make forge-deploy RPC_URL=<rpc> PK=<private_key>
	forge script script/Deploy.s.sol --broadcast --rpc-url $(RPC_URL) --private-key $(PK)

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
