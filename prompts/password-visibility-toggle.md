# Implementation Prompt: Password Visibility Toggle

## Goal
Let users reveal or conceal passwords while signing in or registering.

## Requirements
- Add an accessible Show/Hide control to the login password, signup password, and signup confirmation fields.
- Keep each field hidden by default and toggle only that field between `password` and `text`.
- Preserve current form state, autocomplete values, validation, and submit behavior.
- Use a real keyboard-operable button with an accessible name; do not use a decorative span as the only control.
- Keep the change scoped to the auth form and existing styling.

## Verification
- Run `npm run lint` and `npm run build` from `client/`.
- Manually verify all three fields can be shown and hidden without clearing their values.