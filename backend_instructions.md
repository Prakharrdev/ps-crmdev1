# Backend Developer Instructions: Citizen Confirmation Feedback Loop

The frontend and API features for the **Citizen Confirmation Feedback Loop** have been implemented. However, they rely on a new database state: `pending_closure`.

You must execute the following database manual steps to complete this feature.

## 1. Database Migration: Update Enum

You need to add `'pending_closure'` to the `complaint_status` enum in Supabase.

Run the following SQL in the Supabase SQL Editor:

```sql
ALTER TYPE complaint_status ADD VALUE 'pending_closure' AFTER 'in_progress';
```

## 2. Update database.types.ts

Once the migration is applied to the Supabase project, you MUST regenerate the types in the frontend so it recognizes the new enum value.

Run your standard Supabase CLI type generation command. For example:

```bash
npx supabase gen types typescript --project-id <your-project-id> --schema public > apps/web/src/types/database.types.ts
```

*(Currently, in `apps/web/app/api/complaints/route.ts` and `apps/web/app/citizen/tickets/page.tsx`, we temporarily cast to `any` or `string` to suppress TypeScript errors. Once you regenerate the types, these casts can safely be removed if you wish.)*

## 3. Verify WhatsApp Configuration

To ensure the notification endpoint (`POST /api/notify/closure-confirmation`) works correctly, verify the following are populated in your production environment:
* `WHATSAPP_TOKEN`
* `WHATSAPP_PHONE_NUMBER_ID`
* The app server url `NEXT_PUBLIC_API_URL` correctly points to the FastAPI backend.

The flow is now fully intact! When a worker marks a ticket as complete, it goes to `pending_closure` and WhatsApp pings the citizen. The citizen can then click the portal link to explicitly "Confirm Resolved" or "Not Resolved".
