"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import Combobox from "@/components/Combobox";
import { withCommas } from "@/lib/format";
import ThemeToggle from "@/components/ThemeToggle";

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
    broker: str(meta, "broker"),
    account_currency: str(meta, "account_currency") || "USD",
    account_size: withCommas(str(meta, "account_size")),
    default_risk_pct: str(meta, "default_risk_pct"),
    experience: str(meta, "experience"),
    trading_style: str(meta, "trading_style"),
    markets: str(meta, "markets"),
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));


  function onCountry(v: string) {
    const newDial = DIAL[v] ?? "";
    setForm((f) => {
      if (!newDial) return { ...f, country: v };
      // Swap the dial-code prefix in place, keeping the rest of the number:
      // ""            -> "+44 "
      // "+355 "       -> "+44 "
      // "+355 692..." -> "+44 692..."
      // "0779..."     -> "+44 0779..."
      const rest = f.phone.trim().replace(/^\+\d{1,4}\s*/, "");
      return { ...f, country: v, phone: rest ? `${newDial} ${rest}` : `${newDial} ` };
    });
  }

  const [savingDetails, setSavingDetails] = useState(false);
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

  async function saveDetails() {
    setSavingDetails(true);
    setMsg(null);
    // Exclude pairs: it is managed on /profile/pairs and resending the
    // page-load snapshot here could overwrite newer changes.
    const { pairs: _pairs, ...metaRest } = meta;
    void _pairs;
    const { error } = await supabase.auth.updateUser({
      data: {
        ...metaRest,
        ...form,
        // Store raw digits: parseFloat("10,000") reads as 10 downstream.
        account_size: form.account_size.replace(/,/g, ""),
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

      <div className="mt-6 space-y-4">
        <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-lg font-semibold text-accent2">
              {(fullName || email).slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="font-medium">{fullName || "No name set"}</div>
              <div className="text-sm text-muted">{email}</div>
              <div className="text-xs text-dim">Member since {joined}</div>
            </div>
          </div>
        </div>

        <Section title="Appearance">
          <div className="w-fit rounded-lg border border-border2">
            <ThemeToggle />
          </div>
          <p className="mt-2 text-xs text-dim">Tap to cycle System, Light, and Dark.</p>
        </Section>

        <Section title="Personal details">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="First name"><input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} className="field" /></Field>
            <Field label="Last name"><input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} className="field" /></Field>
            <Field label="Date of birth"><input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} className="field" /></Field>
            <Field label="Phone"><input type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+44..." className="field" /></Field>
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
        </Section>

        <Section title="Trading profile">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Broker / prop firm"><input value={form.broker} onChange={(e) => set("broker", e.target.value)} placeholder="FTMO" className="field" /></Field>
            <Field label="Account currency">
              <input
                list="ccy-list"
                value={form.account_currency}
                onChange={(e) => set("account_currency", e.target.value.toUpperCase())}
                className="field"
              />
              <datalist id="ccy-list">
                {["USD","EUR","GBP","JPY","AUD","CAD","CHF","NZD","SGD","HKD","SEK","NOK","DKK","PLN","ZAR","AED"].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Account size"><input inputMode="decimal" value={form.account_size} onChange={(e) => set("account_size", withCommas(e.target.value))} placeholder="10,000" className="field" /></Field>
            <Field label="Default risk % / trade"><input inputMode="decimal" value={form.default_risk_pct} onChange={(e) => set("default_risk_pct", e.target.value)} placeholder="1" className="field" /></Field>
            <Field label="Experience">
              <select value={form.experience} onChange={(e) => set("experience", e.target.value)} className="field">
                <option value="">Select...</option>
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
                <option>Professional</option>
              </select>
            </Field>
            <Field label="Trading style">
              <select value={form.trading_style} onChange={(e) => set("trading_style", e.target.value)} className="field">
                <option value="">Select...</option>
                <option>Scalper</option>
                <option>Day trader</option>
                <option>Swing trader</option>
                <option>Position trader</option>
              </select>
            </Field>
            <Field label="Markets traded"><input value={form.markets} onChange={(e) => set("markets", e.target.value)} placeholder="FX, indices, gold" className="field" /></Field>
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
              <div className="text-xs font-medium uppercase tracking-wide text-muted">Trading pairs</div>
              <p className="mt-1 text-sm text-muted">
                The watchlist behind every pair dropdown in the app.
              </p>
            </div>
            <Link
              href="/profile/pairs"
              className="shrink-0 rounded-lg border border-border2 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
            >
              Manage pairs
            </Link>
          </div>
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

        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-lg border border-border2 px-4 py-2 text-sm font-medium text-muted transition hover:border-danger hover:text-danger"
          >
            Sign out
          </button>
        </form>
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
