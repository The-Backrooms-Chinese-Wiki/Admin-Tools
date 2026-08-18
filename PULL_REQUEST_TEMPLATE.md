# Replace wiki.backroomszh.org with backroomszh.miraheze.org

This PR replaces all occurrences of the host `wiki.backroomszh.org` with `backroomszh.miraheze.org` in repository files, preserving the original protocol, path and query parameters.

Files changed:
- app/page.tsx — update external links to use backroomszh.miraheze.org

Reasoning:
- The site is moving to Miraheze-hosted domain; updating links avoids broken redirects and ensures links point to the new host.

---

Automated change performed by Copilot.
