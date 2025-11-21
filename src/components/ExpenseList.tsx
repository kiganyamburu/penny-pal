import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, DollarSign, Tag } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  date: string;
  created_at: string;
}

const ExpenseList = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSpent, setTotalSpent] = useState(0);

  useEffect(() => {
    fetchExpenses();
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel("expenses-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expenses",
        },
        () => {
          fetchExpenses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("date", { ascending: false })
        .limit(10);

      if (error) throw error;

      setExpenses(data || []);
      
      // Calculate total
      const total = (data || []).reduce((sum, expense) => sum + parseFloat(expense.amount.toString()), 0);
      setTotalSpent(total);
    } catch (error) {
      console.error("Error fetching expenses:", error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      food: "bg-orange-100 text-orange-800 border-orange-200",
      transport: "bg-blue-100 text-blue-800 border-blue-200",
      entertainment: "bg-purple-100 text-purple-800 border-purple-200",
      bills: "bg-red-100 text-red-800 border-red-200",
      shopping: "bg-pink-100 text-pink-800 border-pink-200",
      healthcare: "bg-green-100 text-green-800 border-green-200",
    };
    return colors[category.toLowerCase()] || "bg-gray-100 text-gray-800 border-gray-200";
  };

  if (loading) {
    return (
      <Card className="shadow-medium">
        <CardHeader>
          <CardTitle className="text-xl">Recent Expenses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-medium">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-primary" />
          Recent Expenses
        </CardTitle>
        <div className="text-2xl font-bold text-primary mt-2">
          ${totalSpent.toFixed(2)}
          <span className="text-sm text-muted-foreground font-normal ml-2">total</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {expenses.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No expenses tracked yet. Start chatting to add your first expense!
          </p>
        ) : (
          expenses.map((expense) => (
            <div
              key={expense.id}
              className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary/70 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className={getCategoryColor(expense.category)}>
                    <Tag className="w-3 h-3 mr-1" />
                    {expense.category}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarDays className="w-3 h-3" />
                    {new Date(expense.date).toLocaleDateString()}
                  </span>
                </div>
                {expense.description && (
                  <p className="text-sm text-muted-foreground truncate">{expense.description}</p>
                )}
              </div>
              <div className="text-lg font-semibold text-foreground ml-4">
                ${parseFloat(expense.amount.toString()).toFixed(2)}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default ExpenseList;
