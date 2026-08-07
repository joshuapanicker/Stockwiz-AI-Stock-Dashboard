# Project instructions

## Git commits

Never add a `Co-Authored-By: Claude ...` (or any AI attribution) trailer to
commit messages in this repo. Commit as the configured git user only, with no
attribution footer.

## Keep AI_ARCHITECTURE.md current

`AI_ARCHITECTURE.md` in the repo root is the running narrative of the AI
side of this project — what was built, what broke, why each decision went
the way it did. It is **gitignored**, so it will not show up in
`git status` and is easy to forget. Check it anyway.

Update it as part of any change to the AI stack — the analysis prompt,
RAG/retrieval, filing ingestion, the distillation or fine-tuning work, the
model or provider — in the same turn as the change, not at the end of a
session. Match the existing voice: plain language for a non-specialist,
told in order as a story, jargon explained on first use.

Record the reasoning and the failures, not just the outcome. A hypothesis
that was tested and disproved, or a fix that made things worse before it
worked, is worth more than the final diff — it stops the same idea being
re-proposed later. Cite commit hashes where they help.
