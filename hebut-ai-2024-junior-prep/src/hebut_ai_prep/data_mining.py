"""Small, dependency-free utilities for the historical data-mining lab chain.

The historical task used sales records from several stores.  This module keeps the
field names explicit and intentionally works on dictionaries so that it is easy to
adapt when the teacher publishes a new spreadsheet.
"""

from __future__ import annotations

import csv
from collections import defaultdict
from copy import deepcopy
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable, Mapping, MutableMapping, Sequence

DATE_FORMATS = ("%Y-%m-%d", "%Y/%m/%d", "%Y%m%d", "%Y.%m.%d")
OUTPUT_FIELDS = (
    "store_id",
    "sale_date",
    "transaction_id",
    "item_code",
    "item_category",
    "quantity",
    "amount",
)
Cube = dict[tuple[str, str, str], Decimal]


def read_csv_rows(path: str | Path) -> list[dict[str, str]]:
    """Read UTF-8/UTF-8-BOM CSV records into a list of dictionaries."""

    with Path(path).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError(f"CSV has no header: {path}")
        return [dict(row) for row in reader]


def write_csv_rows(
    path: str | Path,
    rows: Iterable[Mapping[str, object]],
    fieldnames: Sequence[str] = OUTPUT_FIELDS,
) -> None:
    """Write rows as UTF-8-BOM CSV so Excel opens Chinese text correctly."""

    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(fieldnames), extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({name: row.get(name, "") for name in fieldnames})


def parse_date(value: object) -> date | None:
    """Parse common date formats; return ``None`` for blank values."""

    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unsupported date format: {value!r}")


def _parse_decimal(value: object, field: str) -> Decimal:
    text = "" if value is None else str(value).strip().replace(",", "")
    if not text:
        raise ValueError(f"Missing numeric value in {field}")
    try:
        return Decimal(text)
    except InvalidOperation as exc:
        raise ValueError(f"Invalid number in {field}: {value!r}") from exc


def _normalise_item_code(value: object) -> str:
    text = "" if value is None else str(value).strip()
    if not text:
        raise ValueError("Missing item_code")
    # Excel often serialises integer-looking codes as ``10010001.0``.
    if text.endswith(".0") and text[:-2].isdigit():
        text = text[:-2]
    return text


def _infer_dates(rows: list[MutableMapping[str, object]]) -> None:
    """Fill blank dates from nearest known neighbours within each store.

    The historical data had occasional blank dates.  We avoid pretending to know a
    business rule: when both neighbours exist we interpolate by row position; when
    only one side exists we reuse the nearest known date.  The caller can replace
    this policy after reading the current teacher's instructions.
    """

    indices_by_store: dict[str, list[int]] = defaultdict(list)
    for index, row in enumerate(rows):
        indices_by_store[str(row["store_id"])].append(index)

    for store_indices in indices_by_store.values():
        parsed_by_position: dict[int, date] = {}
        for position, index in enumerate(store_indices):
            parsed_date = parse_date(rows[index].get("sale_date"))
            if parsed_date is not None:
                parsed_by_position[position] = parsed_date

        if not parsed_by_position:
            raise ValueError("Cannot infer dates: a store has no known sale_date")

        for position, index in enumerate(store_indices):
            if position in parsed_by_position:
                continue

            previous = next(
                (candidate for candidate in range(position - 1, -1, -1) if candidate in parsed_by_position),
                None,
            )
            following = next(
                (
                    candidate
                    for candidate in range(position + 1, len(store_indices))
                    if candidate in parsed_by_position
                ),
                None,
            )

            if previous is not None and following is not None:
                left = parsed_by_position[previous]
                right = parsed_by_position[following]
                row_span = following - previous
                if right >= left and row_span > 0:
                    fraction = (position - previous) / row_span
                    offset = round((right - left).days * fraction)
                    inferred = left + timedelta(days=offset)
                else:
                    inferred = left
            elif previous is not None:
                inferred = parsed_by_position[previous]
            elif following is not None:
                inferred = parsed_by_position[following]
            else:  # pragma: no cover - guarded by ``not parsed_by_position`` above
                raise AssertionError("unreachable")

            parsed_by_position[position] = inferred
            rows[index]["sale_date"] = inferred.isoformat()


def clean_sales_rows(rows: Iterable[Mapping[str, object]]) -> list[dict[str, object]]:
    """Clean and standardise sales rows.

    Required input fields:
    ``store_id``, ``sale_date``, ``transaction_id``, ``item_code``, ``quantity``,
    and ``amount``.

    Negative quantity/amount values are converted to absolute values, matching the
    historical lab description.  That rule must be rechecked against the current
    assignment before submission.
    """

    copied: list[dict[str, object]] = [deepcopy(dict(row)) for row in rows]
    if not copied:
        return []

    required = {"store_id", "sale_date", "transaction_id", "item_code", "quantity", "amount"}
    for line_number, row in enumerate(copied, start=2):
        missing = required.difference(row)
        if missing:
            raise ValueError(f"Row {line_number} is missing fields: {sorted(missing)}")

        row["store_id"] = str(row["store_id"]).strip()
        row["transaction_id"] = str(row["transaction_id"]).strip()
        if not row["store_id"] or not row["transaction_id"]:
            raise ValueError(f"Row {line_number} has blank store_id/transaction_id")

        item_code = _normalise_item_code(row["item_code"])
        row["item_code"] = item_code
        row["item_category"] = item_code[:5]
        if len(row["item_category"]) < 5:
            raise ValueError(f"Row {line_number} item_code is shorter than five digits")

        quantity = abs(_parse_decimal(row["quantity"], "quantity"))
        amount = abs(_parse_decimal(row["amount"], "amount"))
        row["quantity"] = _decimal_to_text(quantity)
        row["amount"] = _decimal_to_text(amount)

    _infer_dates(copied)
    for row in copied:
        parsed = parse_date(row.get("sale_date"))
        if parsed is None:  # pragma: no cover - _infer_dates guarantees a value
            raise AssertionError("date inference failed")
        row["sale_date"] = parsed.isoformat()

    return copied


def _decimal_to_text(value: Decimal) -> str:
    normalised = value.normalize()
    # Avoid scientific notation in CSV output.
    return format(normalised, "f")


def build_cube(rows: Iterable[Mapping[str, object]]) -> Cube:
    """Aggregate amount into a category × store × date cube."""

    cube: defaultdict[tuple[str, str, str], Decimal] = defaultdict(Decimal)
    for row in rows:
        item_code = _normalise_item_code(row.get("item_code"))
        category = str(row.get("item_category") or item_code[:5]).strip()
        store = str(row.get("store_id", "")).strip()
        parsed = parse_date(row.get("sale_date"))
        if not category or not store or parsed is None:
            raise ValueError(f"Cube row is missing category/store/date: {row}")
        amount = abs(_parse_decimal(row.get("amount"), "amount"))
        cube[(category, store, parsed.isoformat())] += amount
    return dict(cube)


def query_cube(
    cube: Mapping[tuple[str, str, str], Decimal],
    *,
    category: str | None = None,
    store_id: str | None = None,
    sale_date: str | date | None = None,
) -> Decimal:
    """Slice/dice the cube by any subset of the three dimensions."""

    date_text: str | None
    if sale_date is None:
        date_text = None
    elif isinstance(sale_date, date):
        date_text = sale_date.isoformat()
    else:
        parsed = parse_date(sale_date)
        if parsed is None:
            raise ValueError("sale_date cannot be blank")
        date_text = parsed.isoformat()

    total = Decimal("0")
    for (cell_category, cell_store, cell_date), amount in cube.items():
        if category is not None and cell_category != str(category):
            continue
        if store_id is not None and cell_store != str(store_id):
            continue
        if date_text is not None and cell_date != date_text:
            continue
        total += amount
    return total


def cube_rows(cube: Mapping[tuple[str, str, str], Decimal]) -> list[dict[str, str]]:
    """Convert a cube into stable, CSV-friendly rows."""

    output: list[dict[str, str]] = []
    for (category, store, sale_date), amount in sorted(cube.items()):
        output.append(
            {
                "item_category": category,
                "store_id": store,
                "sale_date": sale_date,
                "amount": _decimal_to_text(amount),
            }
        )
    return output
