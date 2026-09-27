import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase.rpc(
      "get_spending_summary"
    );

    if (error) {
      console.error("Summary API error:", error);

      return NextResponse.json(
        { error: "Failed to fetch summary" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Unexpected summary API error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}