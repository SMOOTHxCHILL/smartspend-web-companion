import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

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