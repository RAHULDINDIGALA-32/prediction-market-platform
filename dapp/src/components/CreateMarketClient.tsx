"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useChainId } from "wagmi";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Loader2, Plus, X, ExternalLink } from "lucide-react";
import { formatAddress } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

interface MarketCreationInput {
  title: string;
  description: string;
  category: string;
  resolutionSource: string;
  resolutionRules: string[];
  endTime: string; // ISO datetime string
  lmsrB: string; // LMSR liquidity parameter (in ETH)
  subsidyAmount: string; // Creator's subsidy (in ETH) = lmsrB * ln(2) ≈ lmsrB * 0.693
}

interface Market {
  id: string;
  address?: string;
  ipfsCid?: string;
}

interface PreparedMarketData {
  metadataHash: string;
  ipfsCid: string;
  metadata: Record<string, unknown>;
}

export default function CreateMarketClient() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [formData, setFormData] = useState<MarketCreationInput>({
    title: "",
    description: "",
    category: "",
    resolutionSource: "",
    resolutionRules: [""],
    endTime: "",
    lmsrB: "",
    subsidyAmount: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdMarket, setCreatedMarket] = useState<Market | null>(null);
  const [preparedData, setPreparedData] = useState<PreparedMarketData | null>(null);

  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Calculate total ETH required: MARKET_CREATION_FEE (0.03 ETH) + subsidy
      const MARKET_CREATION_FEE = BigInt(Math.floor(0.03 * 1e18));

  // Admin address from env
  const adminAddress = process.env.NEXT_PUBLIC_ADMIN_ADDRESS?.toLowerCase();
  const isAdmin = address && adminAddress && address.toLowerCase() === adminAddress;

  // Check if user is authorized (creator in database OR admin)
  const { data: isAuthorized, isLoading: checkingAuth } = useQuery({
    queryKey: ["isAuthorized", address],
    queryFn: async () => {
      if (!address) return false;
      
      // Admin is always authorized to create markets
      if (isAdmin) return true;
      
      // Check if user is a creator in database
      const res = await fetch(`/api/admin/check-creator?address=${address}`);
      return res.ok;
    },
    enabled: !!address && isConnected,
  });

  const addResolutionRule = () => {
    setFormData({
      ...formData,
      resolutionRules: [...formData.resolutionRules, ""],
    });
  };

  const removeResolutionRule = (index: number) => {
    setFormData({
      ...formData,
      resolutionRules: formData.resolutionRules.filter((_, i) => i !== index),
    });
  };

  const updateResolutionRule = (index: number, value: string) => {
    const newRules = [...formData.resolutionRules];
    newRules[index] = value;
    setFormData({ ...formData, resolutionRules: newRules });
  };

  // Handle LMSR-B change (bidirectional calculation)
  // subsidy = lmsrB * ln(2) ≈ lmsrB * 0.693147
  const handleLmsrBChange = (value: string) => {
    if (value && !isNaN(parseFloat(value))) {
      const lmsrB = parseFloat(value);
      const subsidy = (lmsrB * 0.693147).toFixed(6);
      setFormData({ ...formData, lmsrB: value, subsidyAmount: subsidy });
    } else {
      setFormData({ ...formData, lmsrB: value, subsidyAmount: "" });
    }
  };

  // Handle Subsidy Amount change (bidirectional calculation)
  // lmsrB = subsidyAmount / ln(2) ≈ subsidyAmount / 0.693147
  const handleSubsidyChange = (value: string) => {
    if (value && !isNaN(parseFloat(value))) {
      const subsidy = parseFloat(value);
      const lmsrB = (subsidy / 0.693147).toFixed(6);
      setFormData({ ...formData, subsidyAmount: value, lmsrB });
    } else {
      setFormData({ ...formData, subsidyAmount: value, lmsrB: "" });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = "Title is required";
    } else if (formData.title.length > 200) {
      newErrors.title = "Title must be 200 characters or less";
    }

    if (!formData.description.trim()) {
      newErrors.description = "Description is required";
    } else if (formData.description.length > 5000) {
      newErrors.description = "Description must be 5000 characters or less";
    }

    if (!formData.category) {
      newErrors.category = "Category is required";
    }

    if (!formData.resolutionSource.trim()) {
      newErrors.resolutionSource = "Resolution source is required";
    }

    if (formData.resolutionRules.length === 0 || formData.resolutionRules.every((r) => !r.trim())) {
      newErrors.resolutionRules = "At least one resolution rule is required";
    }

    if (!formData.endTime) {
      newErrors.endTime = "End time is required";
    } else {
      const endTime = new Date(formData.endTime);
      const now = new Date();
      // Enforce minimum 24 hours from now
      const minEndTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      if (endTime < minEndTime) {
        newErrors.endTime = "Market must run for at least 24 hours";
      }
      // Enforce maximum 365 days from now
      const maxEndTime = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      if (endTime > maxEndTime) {
        newErrors.endTime = "Market duration cannot exceed 365 days";
      }
    }

    if (!formData.lmsrB) {
      newErrors.lmsrB = "LMSR-B is required";
    } else {
      const lmsrB = parseFloat(formData.lmsrB);
      if (isNaN(lmsrB) || lmsrB < 0) {
        newErrors.lmsrB = "LMSR-B must be non-negative";
      } else if (lmsrB === 0) {
        newErrors.lmsrB = "LMSR-B must be greater than 0";
      } else if (lmsrB < 0.1 || lmsrB > 1000) {
        newErrors.lmsrB = "LMSR-B must be between 0.1 and 1000 ETH";
      }
    }

    if (!formData.subsidyAmount) {
      newErrors.subsidyAmount = "Subsidy amount is required";
    } else {
      const subsidy = parseFloat(formData.subsidyAmount);
      if (isNaN(subsidy) || subsidy < 0) {
        newErrors.subsidyAmount = "Subsidy must be non-negative";
      } else if (subsidy === 0) {
        newErrors.subsidyAmount = "Subsidy must be greater than 0";
      } else if (subsidy < 0.069 || subsidy > 693) {
        newErrors.subsidyAmount = "Subsidy must be between 0.069 and 693 ETH";
      }
    }

    // Validate ratio (subsidy should be approximately B * 0.693)
    if (formData.lmsrB && formData.subsidyAmount) {
      const lmsrB = parseFloat(formData.lmsrB);
      const subsidy = parseFloat(formData.subsidyAmount);
      const expectedSubsidy = lmsrB * 0.693147;
      const ratio = subsidy / expectedSubsidy;
      if (ratio < 0.9 || ratio > 1.1) {
        newErrors.subsidyAmount = `Subsidy should be approximately ${(expectedSubsidy).toFixed(6)} ETH (B × 0.693). Use the interdependent fields to auto-calculate.`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const MARKET_FACTORY_ABI = [
    {
      type: "function",
      name: "createMarket",
      stateMutability: "payable",
      inputs: [
        { name: "metadataHash", type: "bytes32" },
        { name: "endTime", type: "uint256" },
        { name: "lmsrB", type: "uint256" },
        { name: "subsidyAmount", type: "uint256" },
      ],
      outputs: [{ name: "market", type: "address" }],
    },
  ] as const;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (!address) {
      return;
    }

    setIsSubmitting(true);
    setCreatedMarket(null);
    setPreparedData(null);
    setTxHash(undefined);
    setErrors({});

    try {
      // Step 1: Prepare market (validate, upload to IPFS)
      const endTime = Math.floor(new Date(formData.endTime).getTime() / 1000);

      const prepareResponse = await fetch("/api/markets/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          creatorAddress: address,
          title: formData.title.trim(),
          description: formData.description.trim(),
          category: formData.category,
          resolutionSource: formData.resolutionSource.trim(),
          resolutionRules: formData.resolutionRules.map((r) => r.trim()).filter((r) => r),
          endTime,
          lmsrB: formData.lmsrB,
          subsidyAmount: formData.subsidyAmount,
        }),
      });

      const prepareData = await prepareResponse.json();

      if (!prepareResponse.ok) {
        throw new Error(prepareData.error || "Failed to prepare market");
      }

      setPreparedData(prepareData);

      // Step 2: User signs transaction to create market on-chain
      const marketFactoryAddress = process.env.NEXT_PUBLIC_MARKET_FACTORY_ADDRESS as `0x${string}`;
      if (!marketFactoryAddress) {
        throw new Error("Market factory address not configured");
      }

      // Convert metadataHash from hex string to bytes32
      const metadataHash = prepareData.metadataHash as `0x${string}`;

      // Convert lmsrB and subsidyAmount from ETH (string) to wei (BigInt)
      // 1 ETH = 10^18 wei
      const lmsrBwei = BigInt(Math.floor(parseFloat(formData.lmsrB) * 1e18));
      const subsidyAmountWei = BigInt(Math.floor(parseFloat(formData.subsidyAmount) * 1e18));

    
      const totalValue = MARKET_CREATION_FEE + subsidyAmountWei;

      const hash = await writeContractAsync({
        address: marketFactoryAddress,
        abi: MARKET_FACTORY_ABI,
        functionName: "createMarket",
        args: [metadataHash, BigInt(endTime), lmsrBwei, subsidyAmountWei],
        value: totalValue,
      });

      setTxHash(hash);
      // Step 3: Wait for transaction confirmation
    } catch (error) {
      console.error("Market creation error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create market";
      setErrors({ submit: errorMessage });
      setIsSubmitting(false);
    }
  };

  // Register market after transaction confirms
  useEffect(() => {
    const registerMarket = async () => {
      if (!isConfirmed || !txHash) return;
      if (!preparedData || !address) return;

      try {
        const registerResponse = await fetch("/api/markets/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            creatorAddress: address,
            txHash,
            metadataHash: preparedData.metadataHash,
            ipfsCid: preparedData.ipfsCid,
            metadata: preparedData.metadata,
            chainId,
            lmsrB: formData.lmsrB,
            subsidyAmount: formData.subsidyAmount,
          }),
        });

        const registerData = await registerResponse.json();

        if (!registerResponse.ok) {
          throw new Error(registerData.error || "Failed to register market");
        }

        setCreatedMarket(registerData.market);
        setIsSubmitting(false);

        // Reset form
        setFormData({
          title: "",
          description: "",
          category: "",
          resolutionSource: "",
          resolutionRules: [""],
          endTime: "",
          lmsrB: "",
          subsidyAmount: "",
        });
        setPreparedData(null);
        setTxHash(undefined);
      } catch (error) {
        console.error("Market registration error:", error);
        const errorMessage = error instanceof Error ? error.message : "Market created but registration failed";
        setErrors({ submit: errorMessage });
        setIsSubmitting(false);
      }
    };

    if (isConfirmed && txHash && preparedData) {
      registerMarket();
    }
  }, [isConfirmed, txHash, preparedData, address, chainId, formData.lmsrB, formData.subsidyAmount]);

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Create Market</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Connect your wallet to create a new prediction market
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

  if (checkingAuth) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Create Market</h1>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-400" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isAuthorized === false) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Create Market</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Only authorized creators and admins can create markets
          </p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <div className="flex items-center justify-center gap-2 text-red-600 dark:text-red-400 mb-4">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-semibold">Unauthorized</span>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Your address ({formatAddress(address!)}) is not authorized to create markets.
              <br />
              Please contact an administrator to be added as a creator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const endTimeDate = formData.endTime ? new Date(formData.endTime) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Create Market</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Create a new binary prediction market. All metadata is stored on IPFS for immutability.
        </p>
      </div>

      {createdMarket && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-800 dark:bg-emerald-900/20"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-emerald-900 dark:text-emerald-100 mb-2">
                Market Created Successfully!
              </h3>
              <div className="space-y-2 text-sm text-emerald-800 dark:text-emerald-200">
                <div>
                  <span className="font-medium">Market Address:</span>{" "}
                  <code className="bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded">
                    {formatAddress(createdMarket.address as `0x${string}`)}
                  </code>
                </div>
                <div>
                  <span className="font-medium">IPFS CID:</span>{" "}
                  <code className="bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded">
                    {createdMarket.ipfsCid}
                  </code>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/markets/${createdMarket.id}`, "_blank")}
                  >
                    View Market <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Market Basics */}
        <Card>
          <CardHeader>
            <CardTitle>Market Basics</CardTitle>
            <CardDescription>
              Define the market question and basic information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Market Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Will ETH be above $5,000 on 31 Dec 2026?"
                maxLength={200}
                className={errors.title ? "border-red-500" : ""}
              />
              <div className="flex justify-between mt-1">
                {errors.title && (
                  <span className="text-xs text-red-500">{errors.title}</span>
                )}
                <span className="text-xs text-zinc-500 ml-auto">
                  {formData.title.length}/200
                </span>
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description *</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Detailed description of what this market is about..."
                rows={6}
                maxLength={5000}
                className={`w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-300 ${
                  errors.description ? "border-red-500" : ""
                }`}
              />
              <div className="flex justify-between mt-1">
                {errors.description && (
                  <span className="text-xs text-red-500">{errors.description}</span>
                )}
                <span className="text-xs text-zinc-500 ml-auto">
                  {formData.description.length}/5000
                </span>
              </div>
            </div>

            <div>
              <Label htmlFor="category">Category *</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger className={errors.category ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="crypto">Crypto</SelectItem>
                  <SelectItem value="politics">Politics</SelectItem>
                  <SelectItem value="sports">Sports</SelectItem>
                  <SelectItem value="economics">Economics</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              {errors.category && (
                <span className="text-xs text-red-500 mt-1 block">{errors.category}</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Resolution Rules */}
        <Card>
          <CardHeader>
            <CardTitle>Resolution Rules</CardTitle>
            <CardDescription>
              Define how this market will be resolved. Be specific and unambiguous.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="resolutionSource">Resolution Source *</Label>
              <Input
                id="resolutionSource"
                value={formData.resolutionSource}
                onChange={(e) => setFormData({ ...formData, resolutionSource: e.target.value })}
                placeholder="e.g., Coinbase ETH/USD spot price"
                className={errors.resolutionSource ? "border-red-500" : ""}
              />
              {errors.resolutionSource && (
                <span className="text-xs text-red-500 mt-1 block">{errors.resolutionSource}</span>
              )}
            </div>

            <div>
              <Label>Resolution Rules *</Label>
              <div className="space-y-2 mt-2">
                {formData.resolutionRules.map((rule, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={rule}
                      onChange={(e) => updateResolutionRule(index, e.target.value)}
                      placeholder={`Rule ${index + 1}...`}
                      className="flex-1"
                    />
                    {formData.resolutionRules.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => removeResolutionRule(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addResolutionRule}
                className="mt-2"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Rule
              </Button>
              {errors.resolutionRules && (
                <span className="text-xs text-red-500 mt-1 block">{errors.resolutionRules}</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Timing */}
        <Card>
          <CardHeader>
            <CardTitle>Timing</CardTitle>
            <CardDescription>
              When does trading stop for this market?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="endTime">End Time (UTC) *</Label>
              <Input
                id="endTime"
                type="datetime-local"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                className={errors.endTime ? "border-red-500" : ""}
              />
              {errors.endTime && (
                <span className="text-xs text-red-500 mt-1 block">{errors.endTime}</span>
              )}
              {endTimeDate && (
                <p className="text-xs text-zinc-300 mt-1">
                  Trading stops at: {endTimeDate.toLocaleString("en-US", { timeZone: "UTC" })} UTC
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Market Liquidity & Subsidy */}
        <Card>
          <CardHeader>
            <CardTitle>Market Liquidity & Creator Subsidy</CardTitle>
            <CardDescription>
              Set the LMSR-B parameter (liquidity) or subsidy amount. They are linked: Max. Loss (or Subsidy) ≈ B × 0.693
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="lmsrB">LMSR-B Parameter (ETH) *</Label>
              <Input
                id="lmsrB"
                type="number"
                step="0.000001"
                min="0.1"
                max="1000"
                value={formData.lmsrB}
                onChange={(e) => handleLmsrBChange(e.target.value)}
                placeholder="e.g., 1.5 (liquidity parameter)"
                className={errors.lmsrB ? "border-red-500" : ""}
              />
              {errors.lmsrB && (
                <span className="text-xs text-red-500 mt-1 block">{errors.lmsrB}</span>
              )}
              <p className="text-xs text-zinc-400 mt-1">
                Determines market liquidity and pricing. Higher B = more liquid market.
              </p>
            </div>

            <div>
              <Label htmlFor="subsidyAmount">Creator Subsidy / Max Loss (ETH) *</Label>
              <Input
                id="subsidyAmount"
                type="number"
                step="0.000001"
                min="0.069"
                max="693"
                value={formData.subsidyAmount}
                onChange={(e) => handleSubsidyChange(e.target.value)}
                placeholder="e.g., 1.039 (subsidy = B × ln(2))"
                className={errors.subsidyAmount ? "border-red-500" : ""}
              />
              {errors.subsidyAmount && (
                <span className="text-xs text-red-500 mt-1 block">{errors.subsidyAmount}</span>
              )}
              <p className="text-xs text-zinc-400 mt-1">
                Amount you deposit to bootstrap liquidity. This is your maximum loss if market resolves equally.
              </p>
            </div>

            {formData.lmsrB && formData.subsidyAmount && (
              <div className="bg-zinc-100 dark:bg-zinc-900 rounded-lg p-3 border border-zinc-200 dark:border-zinc-800">
                <div className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
                  <div>
                    <span className="font-semibold">LMSR-B:</span> {parseFloat(formData.lmsrB).toFixed(6)} ETH
                  </div>
                  <div>
                    <span className="font-semibold">Your Subsidy (Max Loss):</span> {parseFloat(formData.subsidyAmount).toFixed(6)} ETH
                  </div>
                  <div className="text-zinc-500 dark:text-zinc-500 pt-1 border-t border-zinc-300 dark:border-zinc-700">
                    Ratio: {(parseFloat(formData.subsidyAmount) / parseFloat(formData.lmsrB)).toFixed(6)} (should be ≈ 0.693)
                  </div>
                  <div className="pt-2 border-t border-zinc-300 dark:border-zinc-700">
                    <div className="font-semibold mb-1 text-zinc-700 dark:text-zinc-300">Total Amount Required:</div>
                    <div>
                      <span className="font-semibold">Creation Fee:</span> 0.03 ETH
                    </div>
                    <div>
                      <span className="font-semibold">Your Subsidy:</span> {parseFloat(formData.subsidyAmount).toFixed(6)} ETH
                    </div>
                    <div className="font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                      Total: {(0.03 + parseFloat(formData.subsidyAmount)).toFixed(6)} ETH
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preview */}
        {formData.title && (
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>Review your market before creating</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Title</div>
                <div className="font-semibold">{formData.title}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Category</div>
                <Badge>{formData.category}</Badge>
              </div>
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Outcomes</div>
                <div className="flex gap-2">
                  <Badge variant="success">YES</Badge>
                  <Badge variant="destructive">NO</Badge>
                </div>
              </div>
              {endTimeDate && (
                <div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Trading Ends</div>
                  <div>{endTimeDate.toLocaleString("en-US", { timeZone: "UTC" })} UTC</div>
                </div>
              )}
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Resolution Source</div>
                <div>{formData.resolutionSource || "Not specified"}</div>
              </div>
              {formData.lmsrB && (
                <>
                  <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">LMSR-B (Liquidity)</div>
                    <div className="font-semibold">{parseFloat(formData.lmsrB).toFixed(6)} ETH</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Your Subsidy / Max Loss</div>
                    <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {parseFloat(formData.subsidyAmount).toFixed(6)} ETH
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Submit */}
        {errors.submit && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200">
            <AlertTriangle className="h-4 w-4" />
            <span>{errors.submit}</span>
          </div>
        )}

        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={isSubmitting || isWriting || isConfirming}
            className="flex-1"
          >
            {isSubmitting || isWriting || isConfirming ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isWriting
                  ? "Sign Transaction..."
                  : isConfirming
                  ? "Confirming..."
                  : "Preparing..."}
              </>
            ) : (
              "Create Market"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
