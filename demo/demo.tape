# claude-code-fleet demo — the anti-fabrication review in action.
# Render from the repo root:  vhs demo/demo.tape
# Self-contained: demo/_setup.sh builds a throwaway /tmp sandbox (needs git + python3 + this checkout).
Output demo/claude-code-fleet-demo.gif

Set Shell "bash"
Set FontSize 19
Set Width 1180
Set Height 640
Set Padding 18
Set Theme "Dracula"
Set TypingSpeed 28ms

# silent sandbox setup (sourced so the short hidden command leaves a clean, cleared screen)
Hide
Type ". demo/_setup.sh"
Enter
Show

Sleep 800ms
Type "# A worker just committed a strategy -- claiming a 3-year out-of-sample Sharpe of 2.10."
Enter
Sleep 1300ms
Type "git show --stat HEAD | head -6"
Enter
Sleep 3s
Type "# Did it actually run that backtest, or fabricate the number?"
Enter
Sleep 1500ms
Type "# claude-code-fleet checks every result a commit CITES against ground truth:"
Enter
Sleep 1300ms
Type "verify-claim HEAD | python3 -m json.tool"
Enter
Sleep 3200ms
Type "# -> it pulled out the cited backtest-id and flagged it UNVERIFIED."
Enter
Sleep 1500ms
Type "# Plug in the quant-qc backend and a fabricated id FAILs the review --"
Enter
Sleep 1200ms
Type "# the worker can't pass off a number it can't prove. No human in the loop."
Enter
Sleep 2800ms
