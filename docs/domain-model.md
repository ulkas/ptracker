# Domain model

A room owns descriptive venue data. A session references exactly one room and carries structural stakes (`smallBlind`, `bigBlind`, currency), a default game (`NLH`, `PLO4`, `PLO5`, or `PLO4_DOUBLE_BOARD_BOMB_POT`), table size, start/end timestamps, and notes. Individual hands may override the session game for mixed-game nights. Cash activity is an appendable event stream; editing is explicit and calculated values are not independently stored.

`INITIAL_BUYIN`, `REBUY`, and `ADDON` increase total in. `CASHOUT` defines money returned. `TIP_TABLE`, `TIP_END`, and `EXPENSE` reduce net result. `ADJUSTMENT` is signed. Breaks reduce playable duration.

Hands and all-ins may attach to either active or completed sessions. A hand stores game type, hero position/cards, one or two boards, one signed total result, tags, notes, and street actions. PLO4/PLO5 card limits and double-board structure are validated locally; street-by-street Omaha actions are intentionally not required. All-ins store the eligible pot, equity, expected payout, and actual payout. Bankroll events remain a separate ledger so deposits and withdrawals never distort poker results.
