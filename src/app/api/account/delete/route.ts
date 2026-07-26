import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "entry-models";

// Recursively collect every file path under a storage prefix (folders come
// back from list() with a null id).
async function collectPaths(
  admin: { storage: ReturnType<typeof createAdminClient>["storage"] },
  prefix: string,
  depth = 0
): Promise<string[]> {
  if (depth > 5) return [];
  const { data } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 });
  const out: string[] = [];
  for (const item of data ?? []) {
    const full = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) out.push(full);
    else out.push(...(await collectPaths(admin, full, depth + 1)));
  }
  return out;
}

// Deletes the signed-in user's account: their storage files, then the auth
// user itself - every table references auth.users with on delete cascade,
// so all rows go with it. Requires the service-role key, server-side only.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    return NextResponse.json(
      { error: "Account deletion is not configured (missing SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  const admin = createAdminClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Storage first: rows cascade with the user, files do not.
  const paths = await collectPaths(admin, user.id);
  if (paths.length) await admin.storage.from(BUCKET).remove(paths);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
