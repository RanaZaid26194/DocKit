# Email templates for DocKit

DocKit delivers all transactional email through **MailerSend**, either via
Supabase Auth's SMTP integration (all sign-up / invite / password-reset flows)
or via server routes calling MailerSend's REST API for custom notifications.

All templates are intentionally plain-text friendly. Replace `{{VAR}}` with real
values before sending. Keep the sender name (`DocKit`) consistent with
`MAIL_FROM_NAME`.

---

## 1. Housing office — confirm your email (Supabase Auth)

**Subject:** Confirm your DocKit account

```
Hi {{OrgName}},

You (or someone using your email address) just created a DocKit account.

Confirm your email to finish setup: {{ConfirmationURL}}

If this wasn't you, ignore this message — the account will not activate.

— The DocKit team
```

Configure this in Supabase → Auth → Email Templates → **Confirm signup**.

---

## 2. Team invitation (custom, sent from a server route)

**Subject:** {{InviterName}} invited you to DocKit

```
Hi,

{{InviterName}} at {{OrgName}} invited you to review housing applications on
DocKit for the "{{ProgramName}}" program.

Accept the invitation by creating an account with this email address at:
https://the-dockit.vercel.app/auth

You'll be linked to the program automatically after you confirm your email.

— The DocKit team
```

---

## 3. Renter decision — approved

**Subject:** Your application was received and approved

```
Hi {{RenterName}},

The housing office at {{OrgName}} marked your application for {{ProgramName}}
as approved. They'll contact you directly with next steps.

If you did not expect this message, please contact {{OrgName}} directly.

— DocKit
```

---

## 4. Renter decision — needs follow-up / rejected

**Subject:** Update on your housing application

```
Hi {{RenterName}},

The housing office at {{OrgName}} has closed your application for
{{ProgramName}}. This is not a legal decision — please contact them
directly to discuss next steps or reapply.

— DocKit
```

---

## 5. Password reset (Supabase Auth)

**Subject:** Reset your DocKit password

```
Someone requested a password reset for your DocKit account.

Reset your password: {{PasswordResetURL}}

If this wasn't you, ignore this message.

— The DocKit team
```

Configure in Supabase → Auth → Email Templates → **Reset password**.
