import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import ChatMessage from "@/components/ChatMessage";
import ExpenseList from "@/components/ExpenseList";
import { Send, LogOut, Coins } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const Index = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      } else {
        loadChatHistory();
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadChatHistory = async () => {
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(50);

      if (error) throw error;

      if (data && data.length > 0) {
        setMessages(
          data.map((msg) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          }))
        );
      } else {
        // Welcome message
        setMessages([
          {
            role: "assistant",
            content: "Hello! I'm your Personal Savings Coach. Tell me about your expenses, and I'll help you track them and provide savings tips! For example, you can say 'I spent $50 on lunch today' or 'I paid $100 for groceries'.",
          },
        ]);
      }
    } catch (error) {
      console.error("Error loading chat history:", error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || loading) return;

    const userMessage = inputMessage.trim();
    setInputMessage("");
    setLoading(true);

    // Add user message to UI
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    try {
      const { data, error } = await supabase.functions.invoke("chat", {
        body: { message: userMessage },
      });

      if (error) throw error;

      // Add assistant response to UI
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message },
      ]);
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
      // Remove the user message if failed
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-secondary">
      {/* Header */}
      <header className="bg-background border-b shadow-soft sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center">
              <Coins className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Personal Savings Coach</h1>
              <p className="text-xs text-muted-foreground">Track expenses, save smarter</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chat Area - Takes 2 columns on large screens */}
          <div className="lg:col-span-2">
            <Card className="flex flex-col h-[calc(100vh-12rem)] shadow-medium">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {messages.map((msg, idx) => (
                  <ChatMessage key={idx} role={msg.role} content={msg.content} />
                ))}
                {loading && (
                  <div className="flex gap-3 p-4 animate-pulse">
                    <div className="w-8 h-8 rounded-full bg-primary" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-secondary rounded w-3/4" />
                      <div className="h-4 bg-secondary rounded w-1/2" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={handleSendMessage} className="p-4 border-t bg-background">
                <div className="flex gap-2">
                  <Input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Tell me about your expenses..."
                    disabled={loading}
                    className="flex-1"
                  />
                  <Button type="submit" disabled={loading || !inputMessage.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </form>
            </Card>
          </div>

          {/* Expenses Sidebar */}
          <div className="lg:col-span-1">
            <ExpenseList />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
