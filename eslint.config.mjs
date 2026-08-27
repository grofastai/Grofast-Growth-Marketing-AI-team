import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Reading the gf_impersonate cookie and trusting it is how member pages ended up
// letting anyone view another employee's payslip: the cookie is httpOnly, but that
// only blocks JavaScript from READING it — anyone can still set it by hand in
// DevTools. lib/impersonation.ts is the only place allowed to read it; everywhere
// else must go through getValidImpersonationId(), which checks ADMIN + same company.
const IMPERSONATION_COOKIE_GUARD = {
  selector:
    "CallExpression[callee.property.name='get'][arguments.0.value='gf_impersonate']",
  message:
    "Don't read the gf_impersonate cookie directly — it can be forged by hand. Use getValidImpersonationId(user.id) from @/lib/impersonation.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-syntax": ["error", IMPERSONATION_COOKIE_GUARD],
    },
  },
  {
    // The one owner of the cookie: it reads the raw value and validates it.
    // impersonate.ts only sets/deletes the cookie, which the selector doesn't match.
    files: ["lib/impersonation.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
