1. **DB Schema & API Foundation**
   - Update `src/lib/db.ts` to add the `notifications` table.
   - Update `src/lib/db.ts` to add `request_message`, `request_sender`, and `request_created_at` to the `conversations` table via ALTER TABLE.
   - Update `src/lib/db.ts` to add `listUsers`, `createNotification`, `getNotifications`, and `markNotificationAsRead` functions. Update functions like `listConversations`, `getConversationWithMessages`, and `createConversation` inside `src/lib/db.ts` to accommodate the new fields.
   - Update `src/types/index.ts` to define `Notification` type and update `Conversation` type to include `requestMessage`, `requestSender`, `requestCreatedAt` fields.
   - Create `app/api/notifications/route.ts` for `GET` (list notifications for a user) and `POST` (create).
   - Create `app/api/notifications/[id]/read/route.ts` for `POST` (mark as read).
   - Create `app/api/users/route.ts` to expose `listUsers` (fetch Google users) for autocompletion.
   - Run verification (e.g., `list_files` and `read_file`) to ensure files were created and modified correctly.

2. **Send Hook & Autocomplete (Message Input)**
   - Update `src/components/chat/InputArea.tsx` to support `@` (mention) and `#` (artifact) autocomplete logic.
     - Detect `@` and fetch user list from `app/api/users/route.ts` using state.
     - Detect `#` and get current conversation artifacts. Retrieve `conversations` and `activeConversationId` from `useChatStore`, find the active conversation, and extract its artifacts from `messages`.
     - Render autocomplete dropdowns above the input field.
   - Update message submission logic in `src/hooks/useChat.ts` to detect mentions (`@username`) and artifacts (`#filename`) in the `text` before calling `saveMessage`. If both are present, make an API call to `POST app/api/notifications/route.ts` with the matched user, artifact filename, and message.
   - Run verification (e.g., `read_file`) to verify `InputArea.tsx` and `useChat.ts`.

3. **Notification UI & Conversation Creation API**
   - Create `src/stores/notificationStore.ts` using Zustand to manage unread counts, notifications list, fetch actions, and mark-as-read actions.
   - Create `src/components/notification/NotificationPanel.tsx` to display notifications.
   - Integrate `NotificationPanel.tsx` into `src/components/layout/Header.tsx` (add bell icon & unread badge).
   - Create `app/api/conversations/from-request/route.ts` (`POST`). It takes `notification_id`, reads the notification from DB, creates a new conversation with `request_message`, `request_sender`, `request_created_at` fields populated, fetches the artifact content from the source conversation, creates an initial message containing the artifact in the new conversation, marks the notification as read, and returns the new `conversation_id`.
   - Run verification to verify the creation of the Zustand store, UI component, and API route.

4. **Request Chat Room UI**
   - Create `src/components/chat/RequestBanner.tsx` to display request info (message, sender, date).
   - Update `src/components/layout/AppLayout.tsx` to retrieve `conversations` and `activeConversationId` from `useChatStore`, find the active conversation, and then render `RequestBanner` directly above the `<MessageList />` component if the active conversation's `requestMessage` exists.
   - Run verification to confirm the edits to `AppLayout.tsx` and creation of `RequestBanner.tsx`.

5. **Build and Verification**
   - Run `npm run build` to verify there are no TypeScript or Next.js build errors.
   - Run `npx playwright test` to run the project's existing tests to ensure no regressions were introduced.
   - Run manual UI testing using a temporary Playwright script per Frontend Verification rule to demonstrate creating a mention with an artifact, seeing the notification, and opening the new request chat room.

6. **Pre-commit Steps**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

7. **Submit the change.**
   - Once all tests pass, submit the change with a descriptive commit message.
