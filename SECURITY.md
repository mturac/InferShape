# Security Policy

## Supported versions

Security fixes are applied to the latest release and `main`.

## Reporting a vulnerability

Do not open a public issue for vulnerabilities involving content disclosure, command redaction, path traversal, artifact tampering, or unsafe HTML generation. Report privately through GitHub's security advisory flow.

InferShape is local-first and sends no network requests. It deliberately removes prompt, completion, message, tool-argument, tool-result, response, and reasoning fields during normalization. Command text is excluded unless `--include-command-text` is explicitly enabled. Repository-relative paths remain visible because they are necessary for repair handoff; use sanitized traces when path names are sensitive.
