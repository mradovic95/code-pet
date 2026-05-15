# Security Policy

## Supported versions

Code Pet is in the `0.1.x` line. Only the latest minor version receives security
fixes. If you are on an older version, please upgrade before reporting an issue.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security reports.

Email the maintainer privately: **22870872+mradovic95@users.noreply.github.com**

Include, where possible:

- A description of the issue and its impact
- Steps to reproduce (or a proof-of-concept)
- The version of Code Pet, your OS, and Node.js version
- Any suggested mitigation

You should expect an acknowledgement within a few days. Once a fix is ready,
a patched release will be published and the report credited (unless you ask
to remain anonymous).

## Scope

In scope:

- The Electron overlay app (`src/app/**`)
- Hook scripts (`hooks/scripts/**`)
- The local HTTP server on `127.0.0.1:31425`
- The marketplace client (license activation, asset download)

Out of scope:

- Vulnerabilities in upstream dependencies (report to the upstream project)
- Issues that require physical access to an unlocked machine
- Social-engineering or phishing scenarios
