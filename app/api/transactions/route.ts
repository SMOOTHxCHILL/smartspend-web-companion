import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const type = searchParams.get("type") || "";

    const page = Math.max(
      Number.parseInt(searchParams.get("page") || "1", 10),
      1
    );

    const limit = Math.min(
      Math.max(
        Number.parseInt(searchParams.get("limit") || "20", 10),
        1
      ),
      100
    );

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    /*
     * Find matching merchants first.
     *
     * This lets us filter transactions using merchant_id
     * instead of relying on Supabase's embedded relation filters.
     */
    if (search || category) {
      let merchantQuery = supabase
        .from("merchants")
        .select("id");

      if (search) {
        merchantQuery = merchantQuery.ilike(
          "canonical_name",
          `%${search}%`
        );
      }

      if (category) {
        merchantQuery = merchantQuery.eq(
          "category",
          category
        );
      }

      const {
        data: matchingMerchants,
        error: merchantError,
      } = await merchantQuery;

      if (merchantError) {
        console.error(
          "Merchant filter error:",
          merchantError
        );

        return NextResponse.json(
          { error: "Failed to filter merchants" },
          { status: 500 }
        );
      }

      const merchantIds =
        matchingMerchants?.map((merchant) => merchant.id) ?? [];

      if (merchantIds.length === 0) {
        return NextResponse.json({
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        });
      }

      let query = supabase
        .from("transactions")
        .select(
          `
          id,
          bank,
          amount,
          type,
          raw_merchant,
          transaction_date,
          confidence,
          merchant_id,
          merchants (
            canonical_name,
            category,
            category_source
          )
          `,
          { count: "exact" }
        )
        .in("merchant_id", merchantIds)
        .order("transaction_date", { ascending: false })
        .range(from, to);

      if (type === "debit" || type === "credit") {
        query = query.eq("type", type);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error(
          "Transactions API error:",
          error
        );

        return NextResponse.json(
          { error: "Failed to fetch transactions" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        data: data ?? [],
        pagination: {
          page,
          limit,
          total: count ?? 0,
          totalPages: Math.ceil(
            (count ?? 0) / limit
          ),
        },
      });
    }

    /*
     * No merchant filters.
     * Query transactions directly.
     */
    let query = supabase
      .from("transactions")
      .select(
        `
        id,
        bank,
        amount,
        type,
        raw_merchant,
        transaction_date,
        confidence,
        merchant_id,
        merchants (
          canonical_name,
          category,
          category_source
        )
        `,
        { count: "exact" }
      )
      .order("transaction_date", { ascending: false })
      .range(from, to);

    if (type === "debit" || type === "credit") {
      query = query.eq("type", type);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error(
        "Transactions API error:",
        error
      );

      return NextResponse.json(
        { error: "Failed to fetch transactions" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil(
          (count ?? 0) / limit
        ),
      },
    });
  } catch (error) {
    console.error(
      "Unexpected API error:",
      error
    );

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}