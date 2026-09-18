// Reports and optionally repairs orphaned negative balances without exposing user identity data.
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const apply = process.argv.includes("--apply");
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("begin");
  const balances = await client.query(`
    with active_ledger as (
      select user_id, coalesce(sum(credit_delta), 0)::int as ledger_balance
      from billing_entitlement_ledger
      where valid_from <= now() and (valid_until is null or valid_until > now())
      group by user_id
    ), reserved as (
      select user_id, count(*)::int as reserved_count
      from billing_usage_reservations
      where status = 'reserved' and reservation_kind = 'credit'
      group by user_id
    )
    select users.id as user_id,
      (coalesce(active_ledger.ledger_balance, 0) - coalesce(reserved.reserved_count, 0))::int as balance
    from users
    left join active_ledger on active_ledger.user_id = users.id
    left join reserved on reserved.user_id = users.id
    where coalesce(active_ledger.ledger_balance, 0) - coalesce(reserved.reserved_count, 0) < 0
  `);
  const values = balances.rows.map((row) => Number(row.balance));
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    negativeUsers: values.length,
    lowestBalance: values.length ? Math.min(...values) : 0,
    correctionCredits: values.reduce((total, value) => total + Math.abs(value), 0),
  }));

  let inserted = 0;
  if (apply) {
    for (const row of balances.rows) {
      const result = await client.query(
        `insert into billing_entitlement_ledger (
           id, user_id, source_type, source_id, credit_delta,
           valid_from, valid_until, metadata_json
         ) values (
           $2, $1, 'reversal', $2, $3,
           now(), null, $4::jsonb
         ) on conflict (source_type, source_id)
           where source_type = 'reversal' and source_id is not null
           do nothing`,
        [
          row.user_id,
          `negative-balance-repair:v1:${row.user_id}`,
          Math.abs(Number(row.balance)),
          JSON.stringify({ reason: "expired_credit_usage_reconciliation", repairVersion: 1 }),
        ],
      );
      inserted += result.rowCount ?? 0;
    }
  }
  console.log(JSON.stringify({ inserted }));
  await client.query(apply ? "commit" : "rollback");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
