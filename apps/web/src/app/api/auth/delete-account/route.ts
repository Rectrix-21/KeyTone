import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const USER_STORAGE_BUCKETS = ["audio", "midi", "analysis", "avatars"];

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (adminError) {
    return NextResponse.json(
      {
        error:
          adminError instanceof Error
            ? adminError.message
            : "Server not configured for account deletion",
      },
      { status: 500 },
    );
  }

  for (const bucket of USER_STORAGE_BUCKETS) {
    try {
      const { data: files } = await admin.storage
        .from(bucket)
        .list(user.id);
      if (files?.length) {
        await admin.storage
          .from(bucket)
          .remove(files.map((file) => `${user.id}/${file.name}`));
      }
    } catch {
      // Best-effort storage cleanup; account deletion proceeds regardless.
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
