Skill: verified-claims

Self-check before writing a factual claim into an issue, commit, PR or doc:

1. Can I paste the exact command and its output? If not, this is inference —
   say so, or go measure it.
2. Did an exit code come through a pipe? `$?` is the last command's, not the
   script's. Use `out=$(cmd); code=$?`.
3. Is the claim about Claude Code's mod API? Ask the installed engine, not a
   type definition file or its docs: a logging probe in a live session
   (`claude --plugin-dir`) or a test under `claude plugin test`. The
   marketplace copy of `claude-code.d.ts` was older than the engine and lacked
   `atom`, `read` and `update`, which this mod uses (#1).
4. Am I repeating a claim from an issue or an existing doc? Re-measure before
   restating it as fact.
5. If a claim published earlier turns out wrong, correct it where it was
   published, not only in conversation.

Adapted from endavis/pyproject-template's rule of the same name.
