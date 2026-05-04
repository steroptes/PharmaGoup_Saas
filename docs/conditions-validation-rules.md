# Conditions Validation Rules (QA)

## Purpose
This document lists the condition validation codes used in campaign setup, with their meaning and expected corrective action.

## Blocking Errors

| Code | Meaning | Expected Action |
|---|---|---|
| `COND_SCOPE_001` | Campaign scope shape is invalid (BU/GROUP/Product must be empty). | Remove BU/GROUP/Product IDs for campaign-level condition. |
| `COND_SCOPE_002` | BU scope shape is invalid (BU required, GROUP/Product must be empty). | Set BU, clear GROUP/Product. |
| `COND_SCOPE_003` | GROUP scope shape is invalid (BU+GROUP required, Product must be empty). | Set BU and GROUP, clear Product. |
| `COND_SCOPE_004` | Product scope shape is invalid (Product required). | Set Product ID. |
| `COND_ITEM_001` | Condition is attached to an item with no products. | Add products to the item or remove the condition. |
| `COND_VALUE_001` | Target value must be strictly greater than 0. | Enter a positive value. |
| `COND_PCT_001` | Percentage value cannot exceed 100. | Reduce value to `<= 100`. |
| `COND_PCT_002` | `% of total` condition has missing/invalid reference scope. | Set an allowed `reference_scope_type`. |
| `COND_DUP_001` | Duplicate condition nature on the same item. | Keep only one condition per nature per item. |
| `COND_MINMAX_001` | Contradiction: min is greater than max for same metric/item. | Adjust values so `min <= max`. |
| `COND_MOD_001` | Modulo condition value must be an integer. | Use an integer value (no decimals). |
| `COND_PCTSUM_001` | Sum of minimum percentage constraints exceeds 100 on same item. | Reduce min percentage totals to `<= 100`. |

## Warnings

| Code | Meaning | Suggested Action |
|---|---|---|
| `COND_WARN_001` | Item has only min or only max for a metric. | Consider adding the complementary bound. |
| `COND_WARN_002` | Item is highly constrained (4+ conditions). | Review for over-constraining risk. |
| `COND_WARN_003` | Partial campaign coverage (no campaign root and no full branch coverage). | Add root/branch conditions for clearer policy coverage. |

## Notes for QA

- Blocking errors prevent adding/saving conditions.
- Warnings do not block save, but should be reviewed.
- Codes are stable and can be used in bug reports and test cases.
