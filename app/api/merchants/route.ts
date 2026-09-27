import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("merchants")
      .select(`
        id,
        canonical_name,
        category,
        category_source
      `)
      .order("canonical_name", { ascending: true });

    if (error) {
      console.error("Merchants API error:", error);

      return NextResponse.json(
        { error: "Failed to fetch merchants" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data ?? [],
    });
  } catch (error) {
    console.error("Unexpected merchants API error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}