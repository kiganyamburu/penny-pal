import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message } = await req.json();
    const authHeader = req.headers.get("Authorization");
    
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Invalid authorization");
    }

    // Fetch recent conversation history
    const { data: recentMessages } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(10);

    // Fetch recent expenses for context
    const { data: recentExpenses } = await supabase
      .from("expenses")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Build conversation context
    const conversationHistory = recentMessages?.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })) || [];

    // Create system prompt with expense context
    const expenseContext = recentExpenses && recentExpenses.length > 0
      ? `\n\nRecent expenses:\n${recentExpenses.map(e => 
          `- ${e.date}: $${e.amount} for ${e.category}${e.description ? ` (${e.description})` : ''}`
        ).join('\n')}`
      : '';

    const systemPrompt = `You are a friendly Personal Savings Coach assistant. Your job is to help users track their daily expenses and provide personalized savings advice.

When users tell you about expenses, extract:
1. Amount (as a number, e.g., 50.00)
2. Category (e.g., "food", "transport", "entertainment", "bills", "shopping", "healthcare", etc.)
3. Description (optional details)
4. Date (default to today if not specified)

After extracting expense information, respond with a JSON object in this format:
{
  "type": "expense",
  "amount": 50.00,
  "category": "food",
  "description": "lunch at cafe",
  "date": "2024-01-15"
}

For other conversations about budgeting, savings tips, or financial advice, respond normally with helpful, encouraging advice.

Be conversational, friendly, and supportive. Celebrate progress and provide actionable savings tips.${expenseContext}`;

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiMessage = data.choices[0].message.content;

    console.log("AI Response:", aiMessage);

    // Save user message
    await supabase.from("chat_messages").insert({
      user_id: user.id,
      role: "user",
      content: message,
    });

    // Try to parse expense from AI response
    let expense = null;
    try {
      const jsonMatch = aiMessage.match(/\{[\s\S]*"type":\s*"expense"[\s\S]*\}/);
      if (jsonMatch) {
        expense = JSON.parse(jsonMatch[0]);
        
        // Save expense to database
        if (expense.type === "expense") {
          await supabase.from("expenses").insert({
            user_id: user.id,
            amount: expense.amount,
            category: expense.category,
            description: expense.description || null,
            date: expense.date || new Date().toISOString().split('T')[0],
          });
          
          console.log("Expense saved:", expense);
        }
      }
    } catch (error) {
      console.error("Error parsing expense:", error);
    }

    // Create a friendly response
    let friendlyResponse = aiMessage;
    if (expense) {
      friendlyResponse = `Got it! I've tracked $${expense.amount} for ${expense.category}${expense.description ? ` (${expense.description})` : ''}. Keep up the great work tracking your expenses! 💰`;
    }

    // Save assistant response
    await supabase.from("chat_messages").insert({
      user_id: user.id,
      role: "assistant",
      content: friendlyResponse,
    });

    return new Response(
      JSON.stringify({ 
        message: friendlyResponse,
        expense: expense 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in chat function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
