/**
 * Email addresses for users the suite creates.
 *
 * Since web-pet #1583 (PET-12883) every user write refuses placeholder domains
 * (example.com, test.com, .test, .local, …), so the suite plus-addresses one real
 * QA mailbox instead: E2E_USER_EMAIL=qa-mailbox@company.tld → qa-mailbox+<token>@company.tld.
 * The mailbox is configuration (gitignored .env locally, a repo variable in CI) because this
 * repo is public. Creating a user sends nothing; the setup-link email is an explicit admin action.
 */
export function testUserEmail(token: string): string {
    const base = (process.env.E2E_USER_EMAIL ?? '').trim();
    const at = base.lastIndexOf('@');
    if (at <= 0 || at === base.length - 1) {
        throw new Error(
            'E2E_USER_EMAIL is not set to a real mailbox (name@domain). User writes refuse placeholder domains ' +
                'since web-pet #1583; set it in .env locally or as the E2E_USER_EMAIL repo variable in CI.',
        );
    }
    const tag = token.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${base.slice(0, at)}+${tag}${base.slice(at)}`;
}
