# claude-code-fleet demo — spawn a fleet, then catch a worker that fabricates a result.
# Render from the repo root:  vhs demo/demo.tape
# Self-contained: demo/_setup.sh builds an isolated tmux fleet + a throwaway /tmp repo.
Output demo/claude-code-fleet-demo.gif

Set Shell "bash"
Set FontSize 19
Set Width 1180
Set Height 680
Set Padding 18
Set Theme "Dracula"
Set TypingSpeed 26ms
Set Framerate 24

# silent sandbox setup (sourced so the short hidden command leaves a clean, cleared screen)
Hide
Type ". demo/_setup.sh"
Enter
Show

Sleep 800ms
Type "# Spin up a fleet of Claude Code worker agents -- one tmux session each:"
Enter
Sleep 1200ms
Type "tmux -L fleet ls"
Enter
Sleep 2600ms
Type "# claude-code-fleet supervises every commit they land. Watch it review one:"
Enter
Sleep 1500ms
Type "# A worker committed a strategy -- claiming a 3-year out-of-sample Sharpe of 2.10."
Enter
Sleep 1300ms
Type "git show --stat HEAD | head -6"
Enter
Sleep 2900ms
Type "# Did it actually run that backtest, or fabricate the number?"
Enter
Sleep 1400ms
Type "verify-claim HEAD | python3 -m json.tool"
Enter
Sleep 3200ms
Type "# -> it pulled out the cited backtest-id and flagged it UNVERIFIED."
Enter
Sleep 1500ms
Type "# Plug in the quant-qc backend and a fabricated id FAILs the review --"
Enter
Sleep 1200ms
Type "# a worker can't pass off a number it can't prove. No human in the loop."
Enter
Sleep 2800ms
