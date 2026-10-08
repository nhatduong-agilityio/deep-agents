---
name: policy-report
description: Produces structured multi-file policy analysis reports from AI-regulation corpus documents.
---

# Policy Report Skill

Use this skill when the user asks about AI regulation — EU AI Act, US Executive Orders, or related policy.

## Required output structure

Always produce three output paths under `/report/`:

| File                            | Content                                                                   |
| ------------------------------- | ------------------------------------------------------------------------- |
| `/report/summary.md`            | 400–600 word synthesis answering the user's question directly             |
| `/report/findings/finding-N.md` | One file per themed finding (produce ≥3); each MUST cite ≥1 corpus source |
| `/report/sources.md`            | Table: corpus file path, title, relevant excerpt (≤80 words each)         |

## Citation format

In each finding file, cite sources inline:

```
> Source: /corpus/<filename> — "<short quote or paraphrase>"
```

Every claim must trace back to a corpus file. Do not include facts that cannot be cited.

## Workflow

1. Use `ls /corpus/` to discover available source files.
2. Use `read_file` to read relevant corpus files.
3. Write `/report/sources.md` with the files you will cite.
4. Write each `/report/findings/finding-N.md` with inline citations.
5. Write `/report/summary.md` last, synthesising across all findings.

## Style

- Neutral, analytical tone — avoid advocacy language.
- Use headings (`##`) to separate sections within findings.
- Do not exceed 400 words per finding file.
