import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { refreshEmbeddingsForMerchants } from "@/lib/embeddings";

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

/*
 * Change categories.
 *
 * Move merchants into a category (existing or brand new):
 *   { "merchantIds": [1, 2], "category": "Subscriptions" }
 *
 * Rename a category (merges if the new name already exists):
 *   { "renameFrom": "Food & Dining", "category": "Eating Out" }
 *
 * Edited merchants are marked category_source = "manual".
 * Their transactions are then re-embedded so Ask SmartSpend
 * sees the new category.
 */
export async function PATCH(request: Request) {
  let body: {
    merchantIds?: unknown;
    renameFrom?: unknown;
    category?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const category = typeof body.category === "string" ? body.category.trim().replace(/\s+/g, " ") : "";

  if (!category || category.length > 40) {
    return NextResponse.json(
      { error: "Category name must be between 1 and 40 characters." },
      { status: 400 }
    );
  }

  try {
    const admin = getSupabaseAdmin();
    let merchantIds: number[];

    if (typeof body.renameFrom === "string" && body.renameFrom.trim()) {
      const { data, error } = await admin
        .from("merchants")
        .select("id")
        .eq("category", body.renameFrom.trim());

      if (error) throw new Error(error.message);
      merchantIds = (data ?? []).map((row) => row.id as number);
    } else if (
      Array.isArray(body.merchantIds) &&
      body.merchantIds.length > 0 &&
      body.merchantIds.every((id) => Number.isInteger(id))
    ) {
      merchantIds = body.merchantIds as number[];
    } else {
      return NextResponse.json(
        { error: "Provide merchantIds or renameFrom." },
        { status: 400 }
      );
    }

    if (merchantIds.length === 0) {
      return NextResponse.json({ updated: 0, reembedded: 0 });
    }

    const { data: updated, error: updateError } = await admin
      .from("merchants")
      .update({ category, category_source: "manual" })
      .in("id", merchantIds)
      .select("id, canonical_name, category, category_source");

    if (updateError) {
      console.error("Category update error:", updateError);
      return NextResponse.json(
        { error: `Could not update categories: ${updateError.message}` },
        { status: 500 }
      );
    }

    // The category change is saved at this point. Re-embedding is best-effort.
    let reembedded = 0;
    let warning: string | undefined;

    try {
      reembedded = await refreshEmbeddingsForMerchants(merchantIds);
    } catch (embeddingError) {
      console.error("Embedding refresh failed:", embeddingError);
      warning =
        "Category saved, but Ask SmartSpend could not be refreshed. Run the embeddings script to update it.";
    }

    return NextResponse.json({
      updated: updated?.length ?? 0,
      data: updated ?? [],
      reembedded,
      warning,
    });
  } catch (error) {
    console.error("Unexpected category update error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}
