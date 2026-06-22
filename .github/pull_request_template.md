## Describe your changes

Provide a concise description of the changes made and their intended purpose.

## Write your issue number after "Fixes "

Enter the corresponding issue number after "Fixes #"

## Please ensure all items are checked off before requesting a review:

- [ ] I deployed the code locally.
- [ ] I have performed a self-review of my code.
- [ ] I have included the issue # in the PR.
- [ ] I have labelled the PR correctly.
- [ ] The issue I am working on is assigned to me.
- [ ] I have avoided using hardcoded values to ensure scalability and maintain consistency across the application.
- [ ] I have ensured that font sizes, color choices, and other UI elements are referenced from the theme.
- [ ] My pull request is focused and addresses a single, specific feature.
- [ ] If there are UI changes, I have attached a screenshot or video to this PR.
- [ ] If I added or modified an API endpoint, the change is reflected in the generated OpenAPI spec (`npm run generate:swagger`).
- [ ] If the endpoint requires authentication, it uses `authenticateJWT` and the generated spec declares `bearerAuth` security.
- [ ] I ran `npm run check:api-drift` and committed the regenerated `swagger.yaml` and `endpoints.ts`.
