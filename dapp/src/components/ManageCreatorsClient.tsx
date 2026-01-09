"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2, Plus, X, Trash2 } from "lucide-react";
import { formatAddress } from "@/lib/utils";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";

export default function ManageCreatorsClient() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const [newCreatorAddress, setNewCreatorAddress] = useState("");
  const [newCreatorRole, setNewCreatorRole] = useState<"ADMIN" | "EDITOR">("EDITOR");

  // Check if user is admin
  const { data: isAdmin, isLoading: checkingAdmin } = useQuery({
    queryKey: ["isAdmin", address],
    queryFn: async () => {
      if (!address) return false;
      const res = await fetch(`/api/admin/check-creator?address=${address}`);
      if (!res.ok) return false;
      const data = await res.json();
      return data.isAdmin || false;
    },
    enabled: !!address && isConnected,
  });

  // Fetch creators list
  const { data: creators, isLoading: loadingCreators } = useQuery({
    queryKey: ["creators", address],
    queryFn: async () => {
      const res = await fetch(`/api/admin/creators?adminAddress=${address}`);
      if (!res.ok) throw new Error("Failed to fetch creators");
      const data = await res.json();
      return data.creators || [];
    },
    enabled: !!address && isConnected && isAdmin === true,
  });

  // Add creator mutation
  const addCreatorMutation = useMutation({
    mutationFn: async ({ address: creatorAddress, role }: { address: string; role: "ADMIN" | "EDITOR" }) => {
      const res = await fetch("/api/admin/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminAddress: address,
          creatorAddress,
          role,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to add creator");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creators"] });
      setNewCreatorAddress("");
      setNewCreatorRole("EDITOR");
    },
  });

  // Remove creator mutation
  const removeCreatorMutation = useMutation({
    mutationFn: async (creatorAddress: string) => {
      const res = await fetch("/api/admin/creators", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminAddress: address,
          creatorAddress,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to remove creator");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creators"] });
    },
  });

  const handleAddCreator = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCreatorAddress.trim()) return;
    
    // Basic address validation
    if (!newCreatorAddress.startsWith("0x") || newCreatorAddress.length !== 42) {
      alert("Invalid Ethereum address");
      return;
    }

    addCreatorMutation.mutate({
      address: newCreatorAddress.trim(),
      role: newCreatorRole,
    });
  };

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Manage Creators</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Manage the whitelist of market creators
          </p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              Connect wallet to continue
            </p>
            <ConnectButton />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (checkingAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Manage Creators</h1>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-400" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Manage Creators</h1>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <div className="flex items-center justify-center gap-2 text-red-600 dark:text-red-400 mb-4">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-semibold">Unauthorized</span>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Only administrators can manage the creator whitelist.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Manage Creators</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Add or remove addresses from the market creator whitelist
        </p>
      </div>

      {/* Add Creator Form */}
      <Card>
        <CardHeader>
          <CardTitle>Add Creator</CardTitle>
          <CardDescription>
            Add a new address to the creator whitelist
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddCreator} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="creatorAddress">Creator Address</Label>
                <Input
                  id="creatorAddress"
                  value={newCreatorAddress}
                  onChange={(e) => setNewCreatorAddress(e.target.value)}
                  placeholder="0x..."
                  required
                />
              </div>
              <div>
                <Label htmlFor="creatorRole">Role</Label>
                <Select
                  value={newCreatorRole}
                  onValueChange={(v) => setNewCreatorRole(v as "ADMIN" | "EDITOR")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EDITOR">Editor</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              type="submit"
              disabled={addCreatorMutation.isPending || !newCreatorAddress.trim()}
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
            {addCreatorMutation.isError && (
              <p className="text-sm text-red-500">
                {addCreatorMutation.error?.message || "Failed to add creator"}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Creators List */}
      <Card>
        <CardHeader>
          <CardTitle>Whitelisted Creators</CardTitle>
          <CardDescription>
            {creators?.length || 0} creator(s) in the whitelist
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingCreators ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : creators && creators.length > 0 ? (
            <div className="space-y-3">
              {creators.map((creator: any) => (
                <motion.div
                  key={creator.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="font-mono text-sm">{formatAddress(creator.address)}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        Added {new Date(creator.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={creator.role === "ADMIN" ? "default" : "secondary"}>
                      {creator.role}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Remove ${formatAddress(creator.address)} from whitelist?`)) {
                          removeCreatorMutation.mutate(creator.address);
                        }
                      }}
                      disabled={removeCreatorMutation.isPending}
                    >
                      {removeCreatorMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-8">
              No creators in whitelist yet
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

