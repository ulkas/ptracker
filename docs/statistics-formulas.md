# Statistics formulas

All calculations use integer minor units until display.

- `totalIn = INITIAL_BUYIN + REBUY + ADDON`
- `cashOut = sum(CASHOUT)`
- `grossResult = cashOut - totalIn + ADJUSTMENT`
- `tips = TIP_TABLE + TIP_END`
- `netResult = grossResult - tips - EXPENSE`
- `durationMs = endedAt - startedAt - completedBreakMs`
- `hourly = result / decimalHours`
- `BB/hour = (result / bigBlind) / decimalHours`
- `expectedPayout = eligiblePot * heroEquity`
- `expectedResult = expectedPayout - heroContribution`
- `actualResult = actualPayout - heroContribution`
- `actualMinusEV = actualResult - expectedResult`
- `requiredEquity = amountToCall / (currentPot + opponentBet + amountToCall)`
- `callEV = equity * (currentPot + opponentBet) - (1 - equity) * amountToCall`

During an active session only:

- `recordedPokerResult = sum(linked hand results)`
- `trackedStack = totalIn + recordedPokerResult - tableTips`
- `liveNetResult = recordedPokerResult - tableTips - expenses`

Expenses do not change the physical table stack. Once a session ends, cash-out becomes authoritative and recorded hands are not counted again.

Aggregate hourly and BB/hour divide aggregate result by aggregate hours; they are never averages of per-session rates. Filters are applied to the session set before every statistic or chart grouping.

Dashboard analytics always select one currency before aggregating. The cumulative profit chart starts at zero and adds finalized session net results in chronological order. The calendar groups finalized session net results by the local start date within its independently selected month.

The bankroll chart also starts at zero for each selected period and cumulatively adds only ledger events in the selected currency. It therefore represents change during the period, while the balance cards remain authoritative all-time balances.
