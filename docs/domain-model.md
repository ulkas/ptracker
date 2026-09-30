# Domain model

A room owns descriptive venue data. A session references exactly one room and carries structural stakes (`smallBlind`, `bigBlind`, currency), game type, table size, start/end timestamps, and notes. Cash activity is an appendable event stream; editing is explicit and calculated values are not independently stored.

`INITIAL_BUYIN`, `REBUY`, and `ADDON` increase total in. `CASHOUT` defines money returned. `TIP_TABLE`, `TIP_END`, and `EXPENSE` reduce net result. `ADJUSTMENT` is signed. Breaks reduce playable duration.

Hands and all-ins may attach to either active or completed sessions. A hand stores hero position/cards, board, result, tags, notes, and street actions. All-ins store the eligible pot, equity, expected payout, and actual payout. Bankroll events remain a separate ledger so deposits and withdrawals never distort poker results.
