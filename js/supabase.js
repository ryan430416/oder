import { config } from "./config.js";

let clientPromise;

export function isSupabaseEnabled() {
  return !config.USE_MOCK && Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
}

export async function getSupabase() {
  if (!isSupabaseEnabled()) {
    throw new Error("Supabase 尚未設定：請填入 Project URL、publishable key，並將 USE_MOCK 改為 false。");
  }
  if (!clientPromise) {
    clientPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm").then(
      ({ createClient }) =>
        createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
    );
  }
  return clientPromise;
}

export async function rpc(name, args = {}) {
  try {
    const client = await getSupabase();
    const { data, error } = await client.rpc(name, args);
    if (error) {
      console.error(`Supabase RPC ${name} failed`, error);
      return { ok: false, code: "backend_error", message: error.message };
    }
    return data;
  } catch (error) {
    console.error(`Supabase RPC ${name} failed`, error);
    return { ok: false, code: "backend_error", message: error.message };
  }
}
