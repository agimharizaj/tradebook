"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import DeleteAccount from "@/components/DeleteAccount";
import Link from "next/link";
import Combobox from "@/components/Combobox";

type Meta = Record<string, unknown>;
const str = (m: Meta, k: string) => (typeof m[k] === "string" ? (m[k] as string) : "");

const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia","Australia","Austria","Azerbaijan",
  "Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia",
  "Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cambodia","Cameroon","Canada",
  "Chile","China","Colombia","Costa Rica","Croatia","Cuba","Cyprus","Czechia","Denmark","Dominican Republic",
  "Ecuador","Egypt","El Salvador","Estonia","Ethiopia","Fiji","Finland","France","Georgia","Germany",
  "Ghana","Greece","Guatemala","Honduras","Hong Kong","Hungary","Iceland","India","Indonesia","Iran",
  "Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kuwait",
  "Latvia","Lebanon","Libya","Liechtenstein","Lithuania","Luxembourg","Malaysia","Maldives","Malta","Mauritius",
  "Mexico","Moldova","Monaco","Mongolia","Montenegro","Morocco","Nepal","Netherlands","New Zealand","Nigeria",
  "North Macedonia","Norway","Oman","Pakistan","Panama","Paraguay","Peru","Philippines","Poland","Portugal",
  "Qatar","Romania","Russia","Rwanda","Saudi Arabia","Senegal","Serbia","Singapore","Slovakia","Slovenia",
  "South Africa","South Korea","Spain","Sri Lanka","Sweden","Switzerland","Taiwan","Tanzania","Thailand","Tunisia",
  "Turkey","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Venezuela","Vietnam","Zambia","Zimbabwe",
];

const DIAL: Record<string, string> = {
  Afghanistan:"+93",Albania:"+355",Algeria:"+213",Andorra:"+376",Angola:"+244",Argentina:"+54",Armenia:"+374",Australia:"+61",Austria:"+43",Azerbaijan:"+994",
  Bahamas:"+1",Bahrain:"+973",Bangladesh:"+880",Barbados:"+1",Belarus:"+375",Belgium:"+32",Belize:"+501",Benin:"+229",Bhutan:"+975",Bolivia:"+591",
  "Bosnia and Herzegovina":"+387",Botswana:"+267",Brazil:"+55",Brunei:"+673",Bulgaria:"+359","Burkina Faso":"+226",Burundi:"+257",Cambodia:"+855",Cameroon:"+237",Canada:"+1",
  Chile:"+56",China:"+86",Colombia:"+57","Costa Rica":"+506",Croatia:"+385",Cuba:"+53",Cyprus:"+357",Czechia:"+420",Denmark:"+45","Dominican Republic":"+1",
  Ecuador:"+593",Egypt:"+20","El Salvador":"+503",Estonia:"+372",Ethiopia:"+251",Fiji:"+679",Finland:"+358",France:"+33",Georgia:"+995",Germany:"+49",
  Ghana:"+233",Greece:"+30",Guatemala:"+502",Honduras:"+504","Hong Kong":"+852",Hungary:"+36",Iceland:"+354",India:"+91",Indonesia:"+62",Iran:"+98",
  Iraq:"+964",Ireland:"+353",Israel:"+972",Italy:"+39",Jamaica:"+1",Japan:"+81",Jordan:"+962",Kazakhstan:"+7",Kenya:"+254",Kuwait:"+965",
  Latvia:"+371",Lebanon:"+961",Libya:"+218",Liechtenstein:"+423",Lithuania:"+370",Luxembourg:"+352",Malaysia:"+60",Maldives:"+960",Malta:"+356",Mauritius:"+230",
  Mexico:"+52",Moldova:"+373",Monaco:"+377",Mongolia:"+976",Montenegro:"+382",Morocco:"+212",Nepal:"+977",Netherlands:"+31","New Zealand":"+64",Nigeria:"+234",
  "North Macedonia":"+389",Norway:"+47",Oman:"+968",Pakistan:"+92",Panama:"+507",Paraguay:"+595",Peru:"+51",Philippines:"+63",Poland:"+48",Portugal:"+351",
  Qatar:"+974",Romania:"+40",Russia:"+7",Rwanda:"+250","Saudi Arabia":"+966",Senegal:"+221",Serbia:"+381",Singapore:"+65",Slovakia:"+421",Slovenia:"+386",
  "South Africa":"+27","South Korea":"+82",Spain:"+34","Sri Lanka":"+94",Sweden:"+46",Switzerland:"+41",Taiwan:"+886",Tanzania:"+255",Thailand:"+66",Tunisia:"+216",
  Turkey:"+90",Uganda:"+256",Ukraine:"+380","United Arab Emirates":"+971","United Kingdom":"+44","United States":"+1",Uruguay:"+598",Uzbekistan:"+998",Venezuela:"+58",Vietnam:"+84",Zambia:"+260",Zimbabwe:"+263",
};

export default function ProfileForm({
  email,
  createdAt,
  meta,
}: {
  email: string;
  createdAt: string;
  meta: Meta;
}) {
  const supabase = createClient();

  // Trading profile (broker, account size, risk...) moved to /settings.
  // Only personal details are edited here; everything else in metadata is
  // preserved untouched on save.
  const [form, setForm] = useState({
    first_name: str(meta, "first_name"),
    last_name: str(meta, "last_name"),
    dob: str(meta, "dob"),
    country: str(meta, "country"),
    city: str(meta, "city"),
    timezone: str(meta, "timezone"),
    phone:
      str(meta, "phone") ||
      (DIAL[str(meta, "country")] ? `${DIAL[str(meta, "country")]} ` : ""),
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));


  function onCountry(v: string) {
    const newDial = DIAL[v] ?? "";
    setForm((f) => {
      if (!newDial) return { ...f, country: v };
      // Swap the dial-code prefix in place, keeping the rest of the number.
      // Prefer the OLD country's exact dial code (handles numbers stored
      // without a space, where a greedy \d{1,4} would eat real digits).
      const oldDial = DIAL[f.country] ?? "";
      let rest = f.phone.trim();
      if (oldDial && rest.startsWith(oldDial)) rest = rest.slice(oldDial.length).trim();
      else rest = rest.replace(/^\+\d{1,3}\s+/, "");
      return { ...f, country: v, phone: rest ? `${newDial} ${rest}` : `${newDial} ` };
    });
  }

  const [savingDetails, setSavingDetails] = useState(false);

  // Profile photo: stored in the private entry-models bucket under
  // <uid>/avatar-*, path kept in user_metadata.avatar_path, shown via a
  // signed URL. Auth metadata updates merge, so only the one key is sent.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const path = str(meta, "avatar_path");
    if (!path) return;
    supabase.storage
      .from("entry-models")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (data?.signedUrl) setAvatarUrl(data.signedUrl);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadAvatar(file: File) {
    setAvatarBusy(true);
    setMsg(null);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setAvatarBusy(false);
      return;
    }
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${u.user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("entry-models").upload(path, file, {
      contentType: file.type || "image/png",
    });
    if (error) {
      setMsg({ t: "err", text: `Could not upload photo: ${error.message}` });
      setAvatarBusy(false);
      return;
    }
    const old = str((u.user.user_metadata ?? {}) as Meta, "avatar_path");
    if (old) supabase.storage.from("entry-models").remove([old]);
    const { error: metaErr } = await supabase.auth.updateUser({ data: { avatar_path: path } });
    setAvatarBusy(false);
    if (metaErr) {
      setMsg({ t: "err", text: metaErr.message });
      return;
    }
    const { data } = await supabase.storage.from("entry-models").createSignedUrl(path, 3600);
    setAvatarUrl(data?.signedUrl ?? null);
    setMsg({ t: "ok", text: "Photo updated." });
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const old = str((u.user?.user_metadata ?? {}) as Meta, "avatar_path");
    if (old) supabase.storage.from("entry-models").remove([old]);
    await supabase.auth.updateUser({ data: { avatar_path: null } });
    setAvatarUrl(null);
    setAvatarBusy(false);
  }

  // Email change: Supabase sends confirmation links (to the old and new
  // address with secure email change on); the switch happens on confirm.
  const [newEmail, setNewEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  async function changeEmail() {
    const target = newEmail.trim();
    if (!/^\S+@\S+\.\S+$/.test(target)) {
      setMsg({ t: "err", text: "Enter a valid email address." });
      return;
    }
    setSavingEmail(true);
    setMsg(null);
    // Send the confirm link back to THIS origin (production or local); the
    // Supabase project's Site URL / redirect allow-list must include it.
    const { error } = await supabase.auth.updateUser(
      { email: target },
      { emailRedirectTo: `${window.location.origin}/auth/callback` }
    );
    setSavingEmail(false);
    if (error) {
      setMsg({ t: "err", text: error.message });
      return;
    }
    setShowEmail(false);
    setNewEmail("");
    setMsg({
      t: "ok",
      text: "Confirmation sent - check both your current and new inbox. The change applies once confirmed.",
    });
  }

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; text: string } | null>(null);

  const timezones = useMemo<string[]>(() => {
    try {
      const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
        .supportedValuesOf;
      return fn ? fn("timeZone") : [];
    } catch {
      return [];
    }
  }, []);

  const fullName = `${form.first_name} ${form.last_name}`.trim();

  // Phone renders as [dial code | number] when a prefix exists. The stored
  // value stays a single string ("+39 692..."). The prefix is the selected
  // country's exact dial code when the number starts with it; the generic
  // fallback requires a space so "+447438..." can't be split as "+4474".
  const countryDial = DIAL[form.country] ?? "";
  const phonePrefix =
    countryDial && form.phone.startsWith(countryDial)
      ? countryDial
      : form.phone.match(/^\+\d{1,3}(?=\s)/)?.[0] ?? "";
  const phoneRest = phonePrefix
    ? form.phone.slice(phonePrefix.length).replace(/^\s+/, "")
    : form.phone;

  async function saveDetails() {
    setSavingDetails(true);
    setMsg(null);
    // Exclude pairs: it is managed in Settings and resending the page-load
    // snapshot here could overwrite newer changes. Trading-profile keys pass
    // through metaRest untouched (they are edited in Settings now).
    const { pairs: _pairs, ...metaRest } = meta;
    void _pairs;
    const { error } = await supabase.auth.updateUser({
      data: {
        ...metaRest,
        ...form,
        display_name: fullName || str(meta, "display_name"),
      },
    });
    setSavingDetails(false);
    setMsg(error ? { t: "err", text: error.message } : { t: "ok", text: "Profile saved." });
  }

  async function savePassword() {
    if (newPw.length < 10) {
      setMsg({ t: "err", text: "New password must be at least 10 characters." });
      return;
    }
    if (newPw !== confirmPw) {
      setMsg({ t: "err", text: "New passwords do not match." });
      return;
    }
    setSavingPw(true);
    setMsg(null);
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email,
      password: currentPw,
    });
    if (verifyErr) {
      setSavingPw(false);
      setMsg({ t: "err", text: "Current password is incorrect." });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSavingPw(false);
    if (error) {
      setMsg({ t: "err", text: error.message });
      return;
    }
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setShowPw(false);
    setMsg({ t: "ok", text: "Password updated." });
  }

  const joined = new Date(createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8 md:py-10">
      <h1 className="text-2xl">Profile</h1>
      <p className="mt-1 text-muted">Manage your account and preferences.</p>

      {msg && (
        <p className={`mt-4 text-sm ${msg.t === "ok" ? "text-success" : "text-danger"}`}>
          {msg.text}
        </p>
      )}

      <div className="mt-8 space-y-6">
        <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
          <div className="flex items-center gap-4">
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarBusy}
              title="Change profile photo"
              aria-label="Change profile photo"
              className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-full disabled:opacity-60"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Profile photo" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-accent-soft text-lg font-semibold text-accent2">
                  {(fullName || email).slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
              </span>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
                e.target.value = "";
              }}
            />
            <div>
              <div className="font-medium">{fullName || "No name set"}</div>
              <div className="text-sm text-muted">{email}</div>
              <div className="text-xs text-dim">
                Member since {joined}
                {avatarBusy && " · uploading…"}
                {avatarUrl && !avatarBusy && (
                  <>
                    {" · "}
                    <button onClick={removeAvatar} className="text-dim underline hover:text-foreground">
                      remove photo
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <Section title="Personal details">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="First name"><input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} className="field" /></Field>
            <Field label="Last name"><input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} className="field" /></Field>
            <Field label="Date of birth"><input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} className="field" /></Field>
            <Field label="Phone">
              {phonePrefix ? (
                <div className="field-split">
                  <span className="field-prefix" title="Set by your country">{phonePrefix}</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phoneRest}
                    onChange={(e) => set("phone", `${phonePrefix} ${e.target.value}`)}
                    placeholder="7911 123456"
                    aria-label={`Phone number, prefix ${phonePrefix}`}
                  />
                </div>
              ) : (
                <input type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+44..." className="field" />
              )}
            </Field>
            <Field label="Country">
              <Combobox
                value={form.country}
                options={COUNTRIES}
                onType={(v) => {
                  // Fill the dial code even when the name is typed in full
                  // instead of picked from the dropdown.
                  const match = COUNTRIES.find(
                    (c) => c.toLowerCase() === v.trim().toLowerCase()
                  );
                  if (match) onCountry(match);
                  else set("country", v);
                }}
                onSelect={(v) => onCountry(v)}
                placeholder="Search country"
              />
            </Field>
            <Field label="City"><input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="London" className="field" /></Field>
            <Field label="Timezone">
              <input
                list="tz-list"
                value={form.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                placeholder="Search e.g. London"
                className="field"
              />
              {timezones.length > 0 && (
                <datalist id="tz-list">
                  {timezones.map((tz) => (<option key={tz} value={tz} />))}
                </datalist>
              )}
            </Field>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={saveDetails}
              disabled={savingDetails}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {savingDetails ? "Saving..." : "Save profile"}
            </button>
            {msg && (
              <span className={`text-sm ${msg.t === "ok" ? "text-success" : "text-danger"}`}>
                {msg.text}
              </span>
            )}
          </div>
        </Section>

        <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted">Settings</div>
              <p className="mt-1 text-sm text-muted">
                Trading profile, guardrails, pre-market routine, pairs and appearance moved to Settings.
              </p>
            </div>
            <Link
              href="/settings"
              className="shrink-0 rounded-lg border border-border2 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
            >
              Open Settings
            </Link>
          </div>
        </div>

        <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted">Email</div>
              <p className="mt-1 break-all text-sm text-muted">{email}</p>
            </div>
            {!showEmail && (
              <button
                onClick={() => { setShowEmail(true); setMsg(null); }}
                className="shrink-0 rounded-lg border border-border2 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
              >
                Change email
              </button>
            )}
          </div>
          {showEmail && (
            <div className="mt-5 space-y-3 border-t border-border pt-5">
              <Field label="New email address">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="field"
                />
              </Field>
              <p className="text-xs text-dim">
                Confirmation links go to your current and new address; the change applies once confirmed.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setShowEmail(false); setNewEmail(""); setMsg(null); }}
                  className="rounded-lg border border-border2 px-4 py-2 text-sm text-muted transition hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={changeEmail}
                  disabled={savingEmail}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {savingEmail ? "Sending…" : "Send confirmation"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted">Security</div>
              <p className="mt-1 text-sm text-muted">Change your password.</p>
            </div>
            {!showPw && (
              <button
                onClick={() => { setShowPw(true); setMsg(null); }}
                className="rounded-lg border border-border2 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
              >
                Change password
              </button>
            )}
          </div>
          {showPw && (
            <div className="mt-5 space-y-3 border-t border-border pt-5">
              <Field label="Current password"><input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="field" /></Field>
              <Field label="New password"><input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 10 characters" className="field" /></Field>
              <Field label="Confirm new password"><input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="field" /></Field>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setShowPw(false); setCurrentPw(""); setNewPw(""); setConfirmPw(""); setMsg(null); }}
                  className="rounded-lg border border-border2 px-4 py-2 text-sm text-muted transition hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={savePassword}
                  disabled={savingPw}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {savingPw ? "Updating..." : "Update password"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile only: the sidebar (and its sign out button) is hidden below
            md, so the phone needs its own way out. Desktop keeps the single
            sidebar button. */}
        <div className="rounded-2xl bg-card p-6 ring-1 ring-border md:hidden">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Session</div>
          <p className="mt-1 break-all text-sm text-muted">Signed in as {email}</p>
          <form action="/auth/signout" method="post" className="mt-4">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border2 px-4 py-2.5 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="mt-12 border-t border-border pt-8">
        <DeleteAccount />
      </div>

    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
      <div className="mb-4 text-xs font-medium uppercase tracking-wide text-muted">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-dim">{label}</span>
      {children}
    </label>
  );
}
