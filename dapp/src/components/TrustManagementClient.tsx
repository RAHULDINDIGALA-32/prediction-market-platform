'use client';

import { useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { Loader2, Plus, Trash2, CheckCircle2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
import { MARKET_FACTORY_ABI, QUOTE_VERIFIER_ABI, ORACLE_ADAPTER_ABI } from '@/lib/adminABIs';

interface Creator {
  id: string;
  address: string;
  createdAt: string;
}

interface Signer {
  id: string;
  address: string;
  createdAt: string;
}

interface Resolver {
  id: string;
  address: string;
  createdAt: string;
}

export default function TrustManagementClient() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();

  // Form states
  const [creatorAddress, setCreatorAddress] = useState('');
  const [resolverAddress, setResolverAddress] = useState('');
  const [signerAddress, setSignerAddress] = useState('');
  const [signerPrivateKey, setSignerPrivateKey] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [transactionError, setTransactionError] = useState<string | null>(null);

  // Contract addresses from env
  const marketFactoryAddress = process.env.NEXT_PUBLIC_MARKET_FACTORY_ADDRESS as `0x${string}`;
  const quoteVerifierAddress = process.env.NEXT_PUBLIC_QUOTE_VERIFIER_ADDRESS as `0x${string}`;
  const oracleAdapterAddress = process.env.NEXT_PUBLIC_ORACLE_ADAPTER_ADDRESS as `0x${string}`;
  
  // Admin-only access control
  const adminAddress = process.env.NEXT_PUBLIC_ADMIN_ADDRESS?.toLowerCase();
  const isAdmin = address && adminAddress && address.toLowerCase() === adminAddress;

  /**
   * Execute a contract transaction using wagmi's walletClient
   * Returns the transaction hash after confirmation
   */
  const executeContractTransaction = async (
    contractAddress: `0x${string}`,
    abi: unknown[],
    methodName: string,
    args: unknown[]
  ): Promise<string> => {
    if (!walletClient || !publicClient) {
      throw new Error('Wallet or public client not available');
    }

    // Create contract interface to encode function data
    const contract = new ethers.Contract(contractAddress, abi as ethers.InterfaceAbi);
    const functionFragment = contract.interface.getFunction(methodName);
    if (!functionFragment) {
      throw new Error(`Method ${methodName} not found on contract`);
    }

    // Encode the function call
    const data = contract.interface.encodeFunctionData(methodName, args);

    // Send transaction via wallet client
    const txHash = await walletClient.sendTransaction({
      account: walletClient.account!,
      to: contractAddress,
      data: data as `0x${string}`,
    });

    // Wait for transaction confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== 'success') {
      throw new Error('Transaction failed');
    }

    return txHash;
  };

  // CREATORS Panel
  const { data: creators, isLoading: loadingCreators } = useQuery({
    queryKey: ['creators'],
    queryFn: async () => {
      const res = await fetch('/api/admin/creators');
      if (!res.ok) throw new Error('Failed to fetch creators');
      const data = await res.json();
      return data.creators || [];
    },
    enabled: isConnected,
  });

  const addCreatorMutation = useMutation({
    mutationFn: async () => {
      setTransactionError(null);

      // Step 1: Execute contract transaction
      const txHash = await executeContractTransaction(
        marketFactoryAddress,
        MARKET_FACTORY_ABI,
        'setCreatorWhitelist',
        [creatorAddress.toLowerCase(), true]
      );

      // Step 2: Only after successful on-chain tx, update database
      const res = await fetch('/api/admin/creators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminAddress: address,
          creatorAddress: creatorAddress.toLowerCase(),
          isWhitelisted: true,
          txHash,
        }),
      });
      if (!res.ok) throw new Error('Failed to record creator in database');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creators'] });
      setCreatorAddress('');
    },
    onError: (error: Error) => {
      setTransactionError(error.message || 'Transaction failed');
    },
  });

  const removeCreatorMutation = useMutation({
    mutationFn: async () => {
      setTransactionError(null);

      // Step 1: Execute contract transaction
      const txHash = await executeContractTransaction(
        marketFactoryAddress,
        MARKET_FACTORY_ABI,
        'setCreatorWhitelist',
        [creatorAddress.toLowerCase(), false]
      );

      // Step 2: Only after successful on-chain tx, update database
      const res = await fetch('/api/admin/creators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminAddress: address,
          creatorAddress,
          isWhitelisted: false,
          txHash,
        }),
      });
      if (!res.ok) throw new Error('Failed to remove creator from database');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creators'] });
    },
    onError: (error: Error) => {
      setTransactionError(error.message || 'Transaction failed');
    },
  });

  // RESOLVERS Panel
  const { data: resolvers, isLoading: loadingResolvers } = useQuery({
    queryKey: ['resolvers'],
    queryFn: async () => {
      const res = await fetch('/api/admin/resolvers');
      if (!res.ok) throw new Error('Failed to fetch resolvers');
      const data = await res.json();
      return data.resolvers || [];
    },
    enabled: isConnected,
  });

  const addResolverMutation = useMutation({
    mutationFn: async () => {
      setTransactionError(null);

      // Step 1: Execute contract transaction
      const txHash = await executeContractTransaction(
        oracleAdapterAddress,
        ORACLE_ADAPTER_ABI,
        'setResolver',
        [resolverAddress.toLowerCase(), true]
      );

      // Step 2: Only after successful on-chain tx, update database
      const res = await fetch('/api/admin/resolvers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminAddress: address,
          resolverAddress: resolverAddress.toLowerCase(),
          isAllowed: true,
          txHash,
        }),
      });
      if (!res.ok) throw new Error('Failed to record resolver in database');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resolvers'] });
      setResolverAddress('');
    },
    onError: (error: Error) => {
      setTransactionError(error.message || 'Transaction failed');
    },
  });

  const removeResolverMutation = useMutation({
    mutationFn: async () => {
      setTransactionError(null);

      // Step 1: Execute contract transaction
      const txHash = await executeContractTransaction(
        oracleAdapterAddress,
        ORACLE_ADAPTER_ABI,
        'setResolver',
        [resolverAddress.toLowerCase(), false]
      );

      // Step 2: Only after successful on-chain tx, update database
      const res = await fetch('/api/admin/resolvers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminAddress: address,
          resolverAddress,
          isAllowed: false,
          txHash,
        }),
      });
      if (!res.ok) throw new Error('Failed to remove resolver from database');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resolvers'] });
    },
    onError: (error: Error) => {
      setTransactionError(error.message || 'Transaction failed');
    },
  });

  // SIGNERS Panel
  const { data: signers, isLoading: loadingSigners } = useQuery({
    queryKey: ['signers'],
    queryFn: async () => {
      const res = await fetch('/api/admin/signers');
      if (!res.ok) throw new Error('Failed to fetch signers');
      const data = await res.json();
      return data.signers || [];
    },
    enabled: isConnected,
  });

  const addSignerMutation = useMutation({
    mutationFn: async () => {
      setTransactionError(null);

      // Step 1: Execute contract transaction
      const txHash = await executeContractTransaction(
        quoteVerifierAddress,
        QUOTE_VERIFIER_ABI,
        'addSigner',
        [signerAddress.toLowerCase()]
      );

      // Step 2: Only after successful on-chain tx, update database with encrypted private key
      const res = await fetch('/api/admin/signers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminAddress: address,
          signerAddress: signerAddress.toLowerCase(),
          action: 'add',
          privateKey: signerPrivateKey,
          txHash,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to record signer in database');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signers'] });
      setSignerAddress('');
      setSignerPrivateKey('');
    },
    onError: (error: Error) => {
      setTransactionError(error.message || 'Transaction failed');
    },
  });

  const removeSignerMutation = useMutation({
    mutationFn: async () => {
      setTransactionError(null);

      // Step 1: Execute contract transaction
      const txHash = await executeContractTransaction(
        quoteVerifierAddress,
        QUOTE_VERIFIER_ABI,
        'removeSigner',
        [signerAddress.toLowerCase()]
      );

      // Step 2: Only after successful on-chain tx, update database
      const res = await fetch('/api/admin/signers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminAddress: address,
          signerAddress,
          action: 'remove',
          txHash,
        }),
      });
      if (!res.ok) throw new Error('Failed to remove signer from database');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signers'] });
    },
    onError: (error: Error) => {
      setTransactionError(error.message || 'Transaction failed');
    },
  });

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Admin Management</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Manage Market creators, Oracle resolvers and Trade Quote signers
          </p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-md text-zinc-500 dark:text-zinc-400 mb-4">
              Connect wallet to continue
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Admin-only access enforcement
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Admin Management</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Manage Market creators, Oracle resolvers and Trade Quote signers
          </p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <div className="flex items-center justify-center gap-2 text-red-600 dark:text-red-400 mb-4">
              <AlertCircle className="h-5 w-5" />
              <span className="font-semibold">Access Denied</span>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Only the admin address can access this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Admin Management</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Manage Market creators, Oracle resolvers and Trade Quote signers
        </p>
      </div>

      {transactionError && (
        <Card className="border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-900 dark:text-red-100">{transactionError}</p>
              <p className="text-xs text-red-800 dark:text-red-200 mt-1">Check your wallet and contract addresses</p>
            </div>
            <button
              onClick={() => setTransactionError(null)}
              className="ml-auto text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
            >
              ✕
            </button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="creators" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="creators">Creators</TabsTrigger>
          <TabsTrigger value="resolvers">Resolvers</TabsTrigger>
           <TabsTrigger value="signers">Signers</TabsTrigger>
        </TabsList>

        {/* CREATORS TAB */}
        <TabsContent value="creators" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Creator</CardTitle>
              <CardDescription>
                Whitelist an address to create prediction markets
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="creator-address">Creator Address</Label>
                <Input
                  id="creator-address"
                  placeholder="0x..."
                  value={creatorAddress}
                  onChange={(e) => setCreatorAddress(e.target.value)}
                />
              </div>
              <Button
                onClick={async () => {
                  if (!ethers.isAddress(creatorAddress)) {
                    setTransactionError('Invalid address');
                    return;
                  }
                  await addCreatorMutation.mutateAsync();
                }}
                disabled={!creatorAddress || addCreatorMutation.isPending || !walletClient}
              >
                {addCreatorMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Creator
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Whitelisted Creators</CardTitle>
              <CardDescription>{creators?.length || 0} creator(s)</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingCreators ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : creators && creators.length > 0 ? (
                <div className="space-y-3">
                  {creators.map((creator: Creator) => (
                    <motion.div
                      key={creator.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <div>
                          <p className="font-mono text-sm">{creator.address}</p>
                          <p className="text-xs text-zinc-500">
                            Added {new Date(creator.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          setCreatorAddress(creator.address);
                          await removeCreatorMutation.mutateAsync();
                        }}
                        disabled={removeCreatorMutation.isPending || !walletClient}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 text-center py-8">
                  No creators whitelisted yet
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SIGNERS TAB */}
        <TabsContent value="signers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Signer</CardTitle>
              <CardDescription>
                Authorize an address to sign trade quotes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signer-address">Signer Address</Label>
                <Input
                  id="signer-address"
                  placeholder="0x..."
                  value={signerAddress}
                  onChange={(e) => setSignerAddress(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signer-pk">Private Key</Label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      id="signer-pk"
                      type={showPrivateKey ? 'text' : 'password'}
                      placeholder="0x..."
                      value={signerPrivateKey}
                      onChange={(e) => setSignerPrivateKey(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                  >
                    {showPrivateKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ Private key will be encrypted and never stored in plain text
                </p>
              </div>

              <Button
                onClick={async () => {
                  if (!ethers.isAddress(signerAddress)) {
                    setTransactionError('Invalid signer address');
                    return;
                  }
                  if (!signerPrivateKey) {
                    setTransactionError('Private key required');
                    return;
                  }
                  await addSignerMutation.mutateAsync();
                }}
                disabled={!signerAddress || !signerPrivateKey || addSignerMutation.isPending || !walletClient}
              >
                {addSignerMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Signer
                  </>
                )}
              </Button>
              {(addSignerMutation.isError || transactionError) && (
                <p className="text-sm text-red-500">
                  {transactionError || (addSignerMutation.error as Error)?.message}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Authorized Signers</CardTitle>
              <CardDescription>{signers?.length || 0} signer(s)</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSigners ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : signers && signers.length > 0 ? (
                <div className="space-y-3">
                  {signers.map((signer: Signer) => (
                    <motion.div
                      key={signer.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-blue-500" />
                        <div>
                          <p className="font-mono text-sm">{signer.address}</p>
                          <p className="text-xs text-zinc-500">
                            Added {new Date(signer.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          setSignerAddress(signer.address);
                          await removeSignerMutation.mutateAsync();
                        }}
                        disabled={removeSignerMutation.isPending || !walletClient}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 text-center py-8">
                  No signers authorized yet
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* RESOLVERS TAB */}
        <TabsContent value="resolvers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Resolver</CardTitle>
              <CardDescription>
                Authorize an address to resolve disputed markets
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="resolver-address">Resolver Address</Label>
                <Input
                  id="resolver-address"
                  placeholder="0x..."
                  value={resolverAddress}
                  onChange={(e) => setResolverAddress(e.target.value)}
                />
              </div>
              <Button
                onClick={async () => {
                  if (!ethers.isAddress(resolverAddress)) {
                    setTransactionError('Invalid address');
                    return;
                  }
                  await addResolverMutation.mutateAsync();
                }}
                disabled={!resolverAddress || addResolverMutation.isPending || !walletClient}
              >
                {addResolverMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Resolver
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Oracle Resolvers</CardTitle>
              <CardDescription>{resolvers?.length || 0} resolver(s)</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingResolvers ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : resolvers && resolvers.length > 0 ? (
                <div className="space-y-3">
                  {resolvers.map((resolver: Resolver) => (
                    <motion.div
                      key={resolver.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-purple-500" />
                        <div>
                          <p className="font-mono text-sm">{resolver.address}</p>
                          <p className="text-xs text-zinc-500">
                            Added {new Date(resolver.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          setResolverAddress(resolver.address);
                          await removeResolverMutation.mutateAsync();
                        }}
                        disabled={removeResolverMutation.isPending || !walletClient}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 text-center py-8">
                  No resolvers authorized yet
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
