import { errorMessage } from "./config.js";

export interface SupabaseProductPayload {
  grocer_id: number;
  collection_ids: number[];
  barcodes: string[];
  name: string;
  brand: string | null;
  unit: string;
  size: string | null;
  deleted_from_grocer?: boolean;
  update_at_from_grocer?: string;
}

interface ExistingProductRow {
  grocer_id: number;
}

export class SupabaseProductsApi {
  readonly #baseUrl: string;
  readonly #secretKey: string;

  constructor(baseUrl: string, secretKey: string) {
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#secretKey = secretKey;
  }

  async upsert(rows: readonly SupabaseProductPayload[]): Promise<void> {
    if (rows.length === 0) return;
    const url = new URL(`${this.#baseUrl}/rest/v1/products`);
    url.searchParams.set("on_conflict", "grocer_id");
    await this.#request(url, {
      method: "POST",
      headers: this.#headers("resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify(rows),
    });
  }

  async markDeleted(grocerIds: readonly number[], updateDate: string): Promise<void> {
    if (grocerIds.length === 0) return;
    const url = this.#idsUrl(grocerIds);
    await this.#request(url, {
      method: "PATCH",
      headers: this.#headers("return=minimal"),
      body: JSON.stringify({
        deleted_from_grocer: true,
        update_at_from_grocer: updateDate,
      }),
    });
  }

  async existingGrocerIds(grocerIds: readonly number[]): Promise<Set<number>> {
    if (grocerIds.length === 0) return new Set<number>();
    const url = this.#idsUrl(grocerIds);
    url.searchParams.set("select", "grocer_id");
    const response = await this.#request(url, {
      method: "GET",
      headers: this.#headers(),
    });
    const rows = JSON.parse(await response.text()) as ExistingProductRow[];
    return new Set(rows.map(({ grocer_id: grocerId }) => grocerId));
  }

  #idsUrl(grocerIds: readonly number[]): URL {
    const url = new URL(`${this.#baseUrl}/rest/v1/products`);
    url.searchParams.set("grocer_id", `in.(${grocerIds.join(",")})`);
    return url;
  }

  #headers(prefer?: string): Record<string, string> {
    const headers: Record<string, string> = {
      apikey: this.#secretKey,
      authorization: `Bearer ${this.#secretKey}`,
      "content-type": "application/json",
    };
    if (prefer) headers.prefer = prefer;
    return headers;
  }

  async #request(url: URL, init: RequestInit): Promise<Response> {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        const response = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(60_000),
        });
        if (response.ok) return response;

        const body = await response.text();
        if (response.status < 500 && response.status !== 429) {
          throw new Error(`Supabase HTTP ${response.status}: ${body}`);
        }
        throw new Error(`Retryable Supabase HTTP ${response.status}: ${body}`);
      } catch (error: unknown) {
        if (attempt === 5 || errorMessage(error).startsWith("Supabase HTTP")) throw error;
        const waitMs = attempt * 2_000;
        console.warn(`[retry] Supabase attempt ${attempt} failed; waiting ${waitMs} ms: ${errorMessage(error)}`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
    throw new Error("Supabase request exhausted all retries");
  }
}
