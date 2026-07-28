-- Let strategy risk limits hold either a figure or a percent of account
-- ("200" or "5%"), stored verbatim so percentages track account-size changes
-- instead of being frozen to a figure at entry time. Run in the Supabase SQL
-- Editor. Existing figures carry over unchanged; the old risk_per_trade_pct
-- was always a percent, so it gets a trailing "%".

alter table public.strategies
  alter column max_daily_loss   type text using max_daily_loss::text,
  alter column max_daily_profit type text using max_daily_profit::text,
  alter column risk_per_trade_pct type text using (
    case when risk_per_trade_pct is null then null
         else risk_per_trade_pct::text || '%' end
  );
