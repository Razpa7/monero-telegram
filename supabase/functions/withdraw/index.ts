import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { ethers } from "https://esm.sh/ethers@6.10.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, amountChips, destinationAddress } = await req.json()

    if (!userId || !amountChips || !destinationAddress) {
      throw new Error("Missing parameters")
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Verify User Balance
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('credit')
      .eq('id', userId)
      .single()

    if (userError || !user) throw new Error("User not found")
    if (user.credit < amountChips) throw new Error("Insufficient chips")

    // 2. Deduct balance in DB first to prevent race conditions
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ credit: user.credit - amountChips })
      .eq('id', userId)

    if (updateError) throw new Error("Error updating balance")

    // 3. Process Web3 Transaction (USDT on BSC)
    const RPC_URL = "https://bsc-dataseed.binance.org/"
    const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955"
    const PRIVATE_KEY = Deno.env.get('MASTER_WALLET_PRIVATE_KEY')

    if (!PRIVATE_KEY) throw new Error("Master wallet not configured")

    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
    
    const abi = ["function transfer(address to, uint256 amount) returns (bool)"]
    const usdtContract = new ethers.Contract(USDT_ADDRESS, abi, wallet)

    const usdtAmount = amountChips / 10 // 10 Chips = 1 USDT
    const parsedAmount = ethers.parseUnits(usdtAmount.toString(), 18)

    // Execute transfer
    const tx = await usdtContract.transfer(destinationAddress, parsedAmount)
    await tx.wait()

    // Optionally log the transaction in a `withdrawals` table here

    return new Response(
      JSON.stringify({ success: true, usdtSent: usdtAmount, txHash: tx.hash }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
