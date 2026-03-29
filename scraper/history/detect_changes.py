#!/usr/bin/env python3
"""
detect_changes.py — Daily promo change detection for Pagamax.

Compares today's consolidated NDJSON against yesterday's and emits a
structured change log. Uses DuckDB for zero-dependency SQL diffing.

Usage:
    python history/detect_changes.py
    python history/detect_changes.py --today 2026-03-19 --yesterday 2026-03-18

Output:
    history/changes/YYYY-MM-DD-changes.ndjson   — structured diff log
    Printed summary to stdout

Install:
    pip install duckdb
"""

import duckdb
import json
import sys
import os
from datetime import date, timedelta
from pathlib import Path

# ─── Config ──────────────────────────────────────────────────────────────────

ROOT         = Path(__file__).parent.parent  # scraper root
CONSOLIDATED = ROOT / 'output_consolidated'
HISTORY_DIR  = ROOT / 'history'
CHANGES_DIR  = HISTORY_DIR / 'changes'
DUCKDB_FILE  = str(HISTORY_DIR / 'pagamax.duckdb')

CHANGES_DIR.mkdir(parents=True, exist_ok=True)

# ─── CLI args ────────────────────────────────────────────────────────────────

args = sys.argv[1:]
def get_arg(flag, default):
    try: return args[args.index(flag) + 1]
    except (ValueError, IndexError): return default

TODAY_STR     = get_arg('--today',     str(date.today()))
YESTERDAY_STR = get_arg('--yesterday', str(date.today() - timedelta(days=1)))

# ─── Fields to track for changes ─────────────────────────────────────────────
# Only routing-critical fields — noise from scraped_at etc. is excluded.

TRACKED_FIELDS = [
    'discount_percent',
    'cap_amount_ars',
    'cap_period',
    'valid_to',
    'valid_from',
    'day_pattern',
    'channel',
    'rail',
    'freshness_status',
    'excluded_rails',
    'routing_confidence',
    'routing_ltv',
]

# ─── Main ────────────────────────────────────────────────────────────────────

def find_file(date_str: str) -> str | None:
    """Find the consolidated NDJSON for a given date."""
    path = CONSOLIDATED / f'pagamax-{date_str}.ndjson'
    return str(path) if path.exists() else None

def main():
    today_file     = find_file(TODAY_STR)
    yesterday_file = find_file(YESTERDAY_STR)

    if not today_file:
        print(f'[detect_changes] ERROR: no file for today ({TODAY_STR}). Run consolidate first.')
        sys.exit(1)

    con = duckdb.connect(DUCKDB_FILE)

    # Load today into DuckDB
    con.execute(f"""
        CREATE OR REPLACE TABLE today AS
        SELECT * FROM read_ndjson('{today_file}', auto_detect=true, ignore_errors=true)
    """)
    today_count = con.execute('SELECT COUNT(*) FROM today').fetchone()[0]
    print(f'[detect_changes] Today ({TODAY_STR}):     {today_count:,} rows')

    if not yesterday_file:
        print(f'[detect_changes] No file for yesterday ({YESTERDAY_STR}) — first run, skipping diff.')
        _append_to_history(con, TODAY_STR)
        return

    con.execute(f"""
        CREATE OR REPLACE TABLE yesterday AS
        SELECT * FROM read_ndjson('{yesterday_file}', auto_detect=true, ignore_errors=true)
    """)
    yesterday_count = con.execute('SELECT COUNT(*) FROM yesterday').fetchone()[0]
    print(f'[detect_changes] Yesterday ({YESTERDAY_STR}): {yesterday_count:,} rows')
    print(f'[detect_changes] Row delta: {today_count - yesterday_count:+,}')

    changes = []

    # ── New promos (in today, not in yesterday) ───────────────────────────────
    new_rows = con.execute("""
        SELECT t.promo_key, t.issuer, t.merchant_name, t.discount_percent,
               t.cap_amount_ars, t.valid_to, t.channel, t.rail, t.routing_ltv
        FROM today t
        LEFT JOIN yesterday y ON t.promo_key = y.promo_key
        WHERE y.promo_key IS NULL
        ORDER BY t.issuer, t.merchant_name
    """).fetchall()

    for row in new_rows:
        changes.append({
            'change_type': 'new',
            'date': TODAY_STR,
            'promo_key': row[0], 'issuer': row[1], 'merchant_name': row[2],
            'discount_percent': row[3], 'cap_amount_ars': row[4],
            'valid_to': row[5], 'channel': row[6], 'rail': row[7],
            'routing_ltv': row[8],
        })

    # ── Expired promos (in yesterday, not in today) ───────────────────────────
    expired_rows = con.execute("""
        SELECT y.promo_key, y.issuer, y.merchant_name, y.discount_percent,
               y.valid_to, y.routing_ltv
        FROM yesterday y
        LEFT JOIN today t ON t.promo_key = y.promo_key
        WHERE t.promo_key IS NULL
        ORDER BY y.issuer, y.merchant_name
    """).fetchall()

    for row in expired_rows:
        changes.append({
            'change_type': 'expired',
            'date': TODAY_STR,
            'promo_key': row[0], 'issuer': row[1], 'merchant_name': row[2],
            'discount_percent': row[3], 'valid_to': row[4], 'routing_ltv': row[5],
        })

    # ── Changed promos (same key, different tracked fields) ───────────────────
    field_comparisons = ' OR '.join(
        f't.{f} IS DISTINCT FROM y.{f}' for f in TRACKED_FIELDS
    )
    changed_selects = ', '.join(
        f'y.{f} AS old_{f}, t.{f} AS new_{f}' for f in TRACKED_FIELDS
    )
    changed_rows = con.execute(f"""
        SELECT t.promo_key, t.issuer, t.merchant_name,
               {changed_selects}
        FROM today t
        JOIN yesterday y ON t.promo_key = y.promo_key
        WHERE {field_comparisons}
        ORDER BY t.issuer, t.merchant_name
    """).fetchall()

    col_names = ['promo_key', 'issuer', 'merchant_name'] + \
                [f'old_{f}' for f in TRACKED_FIELDS] + \
                [f'new_{f}' for f in TRACKED_FIELDS]

    for row in changed_rows:
        record = dict(zip(col_names, row))
        # Only include fields that actually changed
        field_diffs = {}
        for f in TRACKED_FIELDS:
            old_val = record[f'old_{f}']
            new_val = record[f'new_{f}']
            if old_val != new_val:
                field_diffs[f] = {'old': old_val, 'new': new_val}

        if field_diffs:
            changes.append({
                'change_type': 'changed',
                'date': TODAY_STR,
                'promo_key': record['promo_key'],
                'issuer': record['issuer'],
                'merchant_name': record['merchant_name'],
                'fields_changed': list(field_diffs.keys()),
                'diffs': field_diffs,
            })

    # ── Write changes log ─────────────────────────────────────────────────────
    changes_path = CHANGES_DIR / f'{TODAY_STR}-changes.ndjson'
    with open(changes_path, 'w', encoding='utf-8') as f:
        for c in changes:
            f.write(json.dumps(c, default=str, ensure_ascii=False) + '\n')

    # ── Summary ───────────────────────────────────────────────────────────────
    new_count     = sum(1 for c in changes if c['change_type'] == 'new')
    expired_count = sum(1 for c in changes if c['change_type'] == 'expired')
    changed_count = sum(1 for c in changes if c['change_type'] == 'changed')

    print(f'\n=== Change Summary ({TODAY_STR} vs {YESTERDAY_STR}) ===')
    print(f'  New promos:     {new_count:,}')
    print(f'  Expired promos: {expired_count:,}')
    print(f'  Changed fields: {changed_count:,}')
    print(f'  Total changes:  {len(changes):,}')
    print(f'  Log → {changes_path}')

    # ── Flag high-value losses (routing_ltv dropped significantly) ────────────
    high_value_losses = [
        c for c in changes
        if c['change_type'] == 'expired'
        and c.get('routing_ltv') and float(c['routing_ltv'] or 0) > 5000
    ]
    if high_value_losses:
        print(f'\n  ⚠ HIGH-VALUE PROMOS LOST ({len(high_value_losses)}):')
        for c in sorted(high_value_losses, key=lambda x: -(float(x['routing_ltv'] or 0))):
            print(f'    [{c["issuer"]}] {c["merchant_name"]} — LTV {c["routing_ltv"]} ARS/month')

    # ── Append snapshot to history DB ─────────────────────────────────────────
    _append_to_history(con, TODAY_STR)

def _append_to_history(con, date_str: str):
    """Persist today's snapshot into the long-term history table."""
    con.execute(f"""
        CREATE TABLE IF NOT EXISTS promo_history AS
        SELECT *, '{date_str}' AS snapshot_date FROM today WHERE false;

        INSERT INTO promo_history
        SELECT *, '{date_str}' AS snapshot_date FROM today;
    """)
    total = con.execute(
        "SELECT COUNT(*) FROM promo_history"
    ).fetchone()[0]
    print(f'[detect_changes] History DB: {total:,} total snapshots in {DUCKDB_FILE}')

if __name__ == '__main__':
    main()
